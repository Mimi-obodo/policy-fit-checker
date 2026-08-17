/* ==========================================================================
   Policy Fit Checker: local proxy to Google Gemini (Node.js).

   Keeps the API key server-side. The static site calls this server's URL
   and never touches the Gemini API directly. Same engine as the Cloudflare
   Worker (worker.mjs); this is the local-dev equivalent.

   Usage:
     node worker/serve.mjs
     Then set PFC_CONFIG.WORKER_URL = "http://localhost:8787" in config.js.
   ========================================================================== */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCatalog, selectRelevantRows, routeAgent, buildSystemPrompt, buildUserPrompt, callGemini } from "./engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;

/* Load key from ../.dev.vars (same file Cloudflare Wrangler reads locally) */
let API_KEY = process.env.GEMINI_API_KEY || "";
if (!API_KEY) {
  try {
    const envText = readFileSync(resolve(__dirname, "..", ".dev.vars"), "utf8");
    const match = envText.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (match) API_KEY = match[1].trim();
  } catch (_) { /* ignore */ }
}
if (!API_KEY) {
  console.error("ERROR: No GEMINI_API_KEY found. Set it in .dev.vars or as an env var.");
  process.exit(1);
}

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function json(res, data, status) {
  const body = JSON.stringify(data);
  res.writeHead(status || 200, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method !== "POST") return json(res, { error: "POST only." }, 405);

  let raw = "";
  for await (const chunk of req) raw += chunk;

  let payload;
  try { payload = JSON.parse(raw); } catch (_) { return json(res, { error: "Invalid JSON." }, 400); }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return json(res, { error: '"message" is required.' }, 400);
  if (message.length > 2000) return json(res, { error: "Message too long (max 2000)." }, 413);

  const history = Array.isArray(payload.history) ? payload.history.slice(-10) : [];

  try {
    const fetchedAt = new Date().toISOString();
    const catalog = await fetchCatalog({});
    const selection = selectRelevantRows(catalog, message);
    const agent = routeAgent(message);
    const systemPrompt = buildSystemPrompt(agent, selection);
    const userPrompt = buildUserPrompt(message, history);
    const reply = await callGemini(API_KEY, MODEL, systemPrompt, userPrompt, { timeoutMs: 60000 });

    json(res, {
      reply,
      agent,
      matchedCount: selection.matchedCount,
      total: selection.total,
      model: MODEL,
      fetchedAt
    });
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    json(res, { error: "Gemini error: " + msg }, 502);
  }
});

server.listen(PORT, () => {
  console.log("PFC agent proxy running on http://localhost:" + PORT);
  console.log("Model: " + MODEL);
  console.log("Key: " + API_KEY.substring(0, 6) + "..." + API_KEY.substring(API_KEY.length - 4));
});
