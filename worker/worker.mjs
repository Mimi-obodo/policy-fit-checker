/* ==========================================================================
   Policy Fit Checker: serverless proxy to Google Gemini (Cloudflare Worker).

   This is the ONLY place the Gemini API key lives (in the Worker's
   environment variables). The static site calls this Worker's URL and never
   touches the Gemini API directly.

   POST  { "message": "…", "history": [{ "role": "user"|"assistant", "content": "…" }] }
   ->    { "reply": "…", "agent": "nadia|milo|priya|sasha|callum", "matchedCount": n }

   Deploy:
     npm i -g wrangler
     wrangler login
     wrangler secret put GEMINI_API_KEY
     (optional) wrangler secret put GEMINI_MODEL
     wrangler deploy worker.mjs --name pfc-agent-proxy
   Then set PFC_CONFIG.WORKER_URL in config.js to the deployed URL.
   ========================================================================== */

import { fetchCatalog, selectRelevantRows, routeAgent, buildSystemPrompt, buildUserPrompt, callGemini } from "./engine.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "Method not allowed. Send POST with a JSON body." }, 405);

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY is not set on this Worker. See worker/README." }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: "Request body must be valid JSON." }, 400);
    }

    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (!message) return json({ error: '"message" is required.' }, 400);
    if (message.length > 2000) return json({ error: "Message too long (max 2000 characters)." }, 413);

    const history = Array.isArray(payload.history) ? payload.history.slice(-10) : [];

    try {
      const fetchedAt = new Date().toISOString();
      const catalog = await fetchCatalog({ fetch: globalThis.fetch });
      const selection = selectRelevantRows(catalog, message);
      const agent = routeAgent(message);
      const model = env.GEMINI_MODEL || "gemini-3.6-flash";
      const systemPrompt = buildSystemPrompt(agent, selection);
      const userPrompt = buildUserPrompt(message, history);
      const reply = await callGemini(apiKey, model, systemPrompt, userPrompt, { fetch: globalThis.fetch });

      return json({
        reply,
        agent,
        matchedCount: selection.matchedCount,
        total: selection.total,
        model,
        fetchedAt
      });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      return json({ error: "The team could not reach the model right now: " + msg }, 502);
    }
  }
};
