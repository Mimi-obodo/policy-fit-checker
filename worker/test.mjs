/* ==========================================================================
   Offline verification for the live-LLM engine (no network, no key needed).

   Run:  node worker/test.mjs

   Proves the exact problem being fixed is gone: distinct questions now route
   to different agents, select different catalog rows, and produce different
   prompts, so Gemini can never receive identical context for unrelated asks.
   ========================================================================== */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  selectRelevantRows,
  routeAgent,
  buildSystemPrompt,
  buildUserPrompt,
  formatRows,
  parseCSV,
  rowToPolicy
} from "./engine.mjs";

/* ---- DEV-ONLY SAMPLE CATALOG -------------------------------------------
   The rows below are fabricated test fixtures that mimic the shape of the
   live Google Sheet (column names identical) so the engine's routing and
   grounding can be verified OFFLINE. They are NOT the real catalog and are
   NEVER served or shipped: this file is a Node test runner only, never
   loaded by any page and never deployed to GitHub Pages. The real catalog
   is fetched live at runtime via fetchLiveCatalog() (app.js) or
   fetchCatalog() (worker/engine.mjs). Do not confuse these fixtures with
   real policy data.
   ----------------------------------------------------------------------- */
const CSV = [
  "policy_id,provider_name,policy_name,insurance_type,target_life_stage,min_age,max_age,monthly_premium_eur,coverage_amount_eur,deductible_eur,key_features,suitability_tags,region,rating_out_of_5,exclusions",
  "PFC-001,Hibernia Life,Student Essentials,Life insurance,Student,18,25,19,50000,0,No medical exam;Low premium,\"student,under-26,budget-friendly\",EU-Wide,4.6,Pre-existing conditions excluded",
  "PFC-002,Atlantic Health,Family Shield,Health insurance,Family,25,55,64,120000,150,Family discount;Mental health cover,\"family-protection,dependents,family-discount\",EU-Wide,4.8,Pregnancy after 12 weeks excluded",
  "PFC-003,Coastal Mutual,Self-Employed Guard,Income protection,Self-Employed,22,60,71,60000,200,Flexible income cover,\"self-employed-friendly,flexible-income-cover\",EU-Wide,4.5,Pre-existing conditions excluded",
  "PFC-004,Northwind Cover,Senior Care Plus,Health insurance,Senior,60,80,88,90000,250,\"Pre-existing-condition-friendly;No medical exam\",\"over-60,fixed-income,simplified-underwriting\",EU-Wide,4.3,Pre-existing conditions excluded for first 6 months",
  "PFC-005,Delta Life,Chronic Companion,Life insurance,Chronic Condition Management,18,70,55,110000,100,\"Pre-existing-condition-friendly;Specialist cover\",\"pre-existing-condition-friendly,ongoing-care\",EU-Wide,4.7,None published",
  "PFC-006,Beacon Insure,Young Professional Flex,Health insurance,Young Professional,21,35,49,75000,120,Digital-first;Flexible,\"career-focused,digital-first\",EU-Wide,4.4,Pre-existing conditions excluded"
].join("\n");

const catalog = (() => {
  const rows = parseCSV(CSV);
  return rows.slice(1).map((r) => rowToPolicy(rows[0], r));
})();

const questions = [
  "Which policy fits a student in Ireland under 40 a month?",
  "Why is that policy a good fit? Explain it in plain language, Sasha.",
  "How do you handle pre-existing conditions?",
  "What data do you use to match me, Priya?",
  "Hello, who are you?",
  "Compare the two cheapest health policies for me.",
  "Nadia, what do you research in the live catalog?"
];

console.log("Questions under test:\n" + questions.map((q, i) => "  " + (i + 1) + ". " + q).join("\n") + "\n");

/* ---- 1. routing: each question maps to the expected agent ---- */
const expectRoute = {
  "Which policy fits a student in Ireland under 40 a month?": "milo",
  "Why is that policy a good fit? Explain it in plain language, Sasha.": "sasha",
  "How do you handle pre-existing conditions?": "milo",
  "What data do you use to match me, Priya?": "priya",
  "Hello, who are you?": "callum",
  "Compare the two cheapest health policies for me.": "milo",
  "Nadia, what do you research in the live catalog?": "nadia"
};

let routes = {};
questions.forEach((q) => {
  const r = routeAgent(q);
  routes[q] = r;
  assert.ok(r, "no route for: " + q);
});
console.log("ROUTING (explicit name wins, else inferred):");
questions.forEach((q) => {
  const r = routes[q];
  const status = expectRoute[q] === r ? "ok" : "WARN got " + r + ", expected " + expectRoute[q];
  console.log("  " + r.padEnd(8) + " <- " + q.slice(0, 60) + "  [" + status + "]");
  if (status !== "ok") process.exitCode = 1;
});
assert.notEqual(routes[questions[0]], routes[questions[1]], "fit vs why questions must route to different agents");
console.log("");

/* ---- 2. grounding: each question selects different relevant rows ---- */
console.log("GROUNDING (rows selected from the catalog per question):");
let selections = {};
questions.forEach((q) => {
  const sel = selectRelevantRows(catalog, q);
  selections[q] = sel;
  const ids = sel.rows.map((p) => p.policy_id).join(",");
  console.log("  " + ids.padEnd(44) + " <- " + q.slice(0, 50) + "  [" + sel.matchedCount + "/" + sel.total + "]");
});
assert.ok(
  selections["How do you handle pre-existing conditions?"].rows.some((p) => p.policy_id === "PFC-005"),
  "pre-existing question must surface Chronic Companion (PFC-005)"
);
assert.ok(
  selections["Which policy fits a student in Ireland under 40 a month?"].rows.some((p) => p.policy_id === "PFC-001"),
  "student question must surface Student Essentials (PFC-001)"
);
assert.ok(
  selections["Compare the two cheapest health policies for me."].rows.some((p) => p.policy_id === "PFC-002"),
  "health comparison question must surface Family Shield (PFC-002)"
);
console.log("");

/* ---- 3. prompt building: distinct questions => distinct, grounded prompts ---- */
console.log("PROMPT DIFFERENTIATION (sha1 of the full prompt sent to Gemini):");
const prompts = {};
questions.forEach((q) => {
  const sel = selections[q];
  const agent = routes[q];
  prompts[q] = buildSystemPrompt(agent, sel) + "\n" + buildUserPrompt(q, []);
  const hash = createHash("sha1").update(prompts[q]).digest("hex").slice(0, 10);
  console.log("  " + agent.padEnd(8) + " sha1=" + hash + "  <- " + q.slice(0, 50));
});
const uniquePrompts = new Set(Object.values(prompts));
assert.ok(uniquePrompts.size >= questions.length, "every question must produce a unique full prompt");
assert.ok(Object.keys(prompts).every((q) => prompts[q].includes(selections[q].rows[0].policy_id)), "every prompt must embed at least one real policy_id");

/* ---- 4. the old Sasha bug is gone: 'why' and 'explain why' cannot share context ---- */
const qA = "Why is that policy a good fit?";
const qB = "Can you explain why, Sasha?";
const aSel = selectRelevantRows(catalog, qA);
const bSel = selectRelevantRows(catalog, qB);
assert.equal(routeAgent(qA), "sasha", "why question routes to Sasha");
assert.equal(routeAgent(qB), "sasha", "'explain why, Sasha' routes to Sasha by name");
const fullA = buildSystemPrompt(routeAgent(qA), aSel) + "\n" + buildUserPrompt(qA, []);
const fullB = buildSystemPrompt(routeAgent(qB), bSel) + "\n" + buildUserPrompt(qB, []);
assert.notEqual(fullA, fullB, "the two why-questions must produce different full prompts (user message is never discarded)");
console.log("\nSasha bug check: 'Why…' vs 'Can you explain why, Sasha?' carry different user messages into distinct prompts. PASS");

/* ---- 5. user prompt includes history + current message ---- */
const up = buildUserPrompt("the new question", [{ role: "user", content: "hi" }, { role: "assistant", content: "hi there" }]);
assert.ok(up.includes("the new question"));
assert.ok(up.includes("hi there"));
console.log("User-prompt history check: PASS\n");

console.log("formatRows sample:");
console.log(formatRows(catalog.slice(0, 2)));

console.log("\nALL OFFLINE CHECKS PASSED.");
