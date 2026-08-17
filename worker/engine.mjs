/* ==========================================================================
   Policy Fit Checker: live-LLM engine (Cloudflare Worker, Node-testable).
   Pure + fetchable logic only. No secrets here: the Gemini key lives in the
   Worker environment, never in this file and never in the frontend.

   This module is plain ESM so it runs in a Cloudflare Worker and in Node
   (`node worker/test.mjs`) for offline verification.
   ========================================================================== */

"use strict";

export const SHEET_ID = "1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8";
export const SHEET_GID = "1610292741";

export function sheetCsvUrl(gid) {
  return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=" + (gid || SHEET_GID) + "&cb=" + Date.now();
}

/* --------------------------------------------------------------------------
   Catalog loading (same parser as app.js, so both paths agree on fields)
   -------------------------------------------------------------------------- */
export function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((x) => x.trim() !== "")) rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function rowToPolicy(header, row) {
  const p = {};
  header.forEach((col, i) => {
    const v = (row[i] || "").trim();
    if (["min_age", "max_age", "monthly_premium_eur", "coverage_amount_eur", "deductible_eur", "rating_out_of_5"].includes(col))
      p[col] = parseFloat(v) || 0;
    else if (col === "suitability_tags") p[col] = v.split(",").map((s) => s.trim()).filter(Boolean);
    else p[col] = v;
  });
  return p;
}

export async function fetchCatalog(opts) {
  const fetchFn = (opts && opts.fetch) || globalThis.fetch;
  const gid = (opts && opts.gid) || SHEET_GID;
  const res = await fetchFn(sheetCsvUrl(gid));
  if (!res.ok) throw new Error("Catalog HTTP " + res.status);
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Catalog is empty");
  return rows.slice(1).map((r) => rowToPolicy(rows[0], r));
}

/* --------------------------------------------------------------------------
   Life-stage and insurance-type vocabulary for row selection
   -------------------------------------------------------------------------- */
export const STAGE_KEYWORDS = [
  ["student", ["student", "school", "university", "college", "campus", "young"]],
  ["young-professional", ["young professional", "just started working", "first job"]],
  ["new-parent", ["new parent", "baby", "children", "kids", "dependants", "family"]],
  ["self-employed", ["self-employed", "freelance", "independent", "own business", "contractor"]],
  ["chronic", ["pre-existing", "chronic", "diabetes", "asthma", "condition", "health"]],
  ["senior", ["senior", "retir", "over 60", "60+", "pension", "elderly"]]
];

export const TYPE_KEYWORDS = {
  "Life insurance": ["life insurance", "life cover", "life"],
  "Health insurance": ["health", "medical", "hospital", "doctor"],
  "Income protection": ["income protection", "income", "salary", "disability"],
  "Critical illness": ["critical illness", "cancer", "illness"],
  "Travel insurance": ["travel", "holiday", "trip"],
  "Motor insurance": ["motor", "car", "vehicle", "auto", "van"],
  "Home insurance": ["home", "house", "property", "contents", "tenant"],
  "Pet insurance": ["pet", "dog", "cat", "animal"]
};

export function regionOf(text) {
  const t = text.toLowerCase();
  if (t.includes("ireland") || t.includes("irish")) return "Ireland";
  if (t.includes("uk") || t.includes("britain") || t.includes("england") || t.includes("scotland")) return "UK";
  return null;
}

export function parseBudget(text) {
  const m = text.match(/(\d{2,4})\s*(?:eur|euros?|€|a month|per month|monthly)/) ||
            text.match(/(?:€|eur|euros?|a month|per month|monthly)\s*(\d{2,4})/);
  return m ? parseInt(m[1], 10) : null;
}

export function parseAge(text) {
  const m = text.match(/age\s*(\d{1,2})/) ||
            text.match(/(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|years?\b)/) ||
            text.match(/under\s*(\d{1,2})\s*(?!a month|per month)/);
  return m ? parseInt(m[1], 10) : null;
}

/* --------------------------------------------------------------------------
   Select the rows relevant to the question (grounding, not guesswork).
   Scores every policy; returns the best up to max, plus honest metadata.
   -------------------------------------------------------------------------- */
export function selectRelevantRows(catalog, message, max) {
  const t = message.toLowerCase();
  const limit = max || 8;
  const region = regionOf(message);
  const budget = parseBudget(message);
  const age = parseAge(message);

  let stageMatch = null;
  for (const [stage, words] of STAGE_KEYWORDS) {
    if (words.some((w) => t.includes(w))) { stageMatch = stage; break; }
  }

  const scored = catalog.map((p) => {
    let s = 0;
    const reasons = [];
    const type = p.insurance_type || "";

    for (const [label, words] of Object.entries(TYPE_KEYWORDS)) {
      if (words.some((w) => t.includes(w)) && type.toLowerCase().includes(label.replace(" insurance", "").toLowerCase())) {
        s += 3; reasons.push("type:" + label); break;
      }
    }

    const stage = (p.target_life_stage || "").toLowerCase();
    if (stageMatch) {
      if (stageMatch === "new-parent" && /family|new parent/i.test(stage)) { s += 2; reasons.push("stage:" + stage); }
      else if (stage === stageMatch || (stageMatch === "chronic" && /chronic|pre-existing/i.test(stage))) { s += 2; reasons.push("stage:" + stage); }
    }

    const tags = (p.suitability_tags || []).join(" ");
    if (stageMatch && tags.toLowerCase().includes(stageMatch.replace("-", " "))) { s += 1; reasons.push("tag"); }
    if (/pre-existing|chronic/i.test(t) && /pre-existing-condition-friendly/i.test(tags)) { s += 2; reasons.push("preexisting"); }

    if (region && (p.region === region || p.region === "EU-Wide")) { s += 1; reasons.push("region"); }
    if (age && isFinite(p.min_age) && isFinite(p.max_age) && age >= p.min_age && age <= p.max_age) { s += 1; reasons.push("age"); }
    if (budget && isFinite(p.monthly_premium_eur) && p.monthly_premium_eur <= budget) { s += 1; reasons.push("budget"); }

    return { policy: p, score: s, reasons };
  });

  scored.sort((a, b) => b.score - a.score || (b.policy.rating_out_of_5 || 0) - (a.policy.rating_out_of_5 || 0));
  const matched = scored.filter((x) => x.score > 0).slice(0, limit);
  const rows = (matched.length ? matched : scored.slice(0, 4)).map((x) => x.policy);
  return {
    rows,
    matchedCount: matched.length,
    total: catalog.length,
    note: matched.length
      ? "Matched " + matched.length + " polic" + (matched.length === 1 ? "y" : "ies") + " by type/stage/region keywords from the question."
      : "No keyword match in the catalog; showing the highest-rated " + rows.length + " polic" + (rows.length === 1 ? "y" : "ies") + " instead. Say so honestly."
  };
}

/* --------------------------------------------------------------------------
   Agent routing: explicit name wins, otherwise infer by content.
   -------------------------------------------------------------------------- */
export function routeAgent(message) {
  const t = message.toLowerCase();
  if (/\bnadia\b/.test(t) || /researcher|research|query the catalog|query the live|source|where (do|does|did) you (get|find)/.test(t)) return "nadia";
  if (/\bmilo\b/.test(t) || /score|scoring|compare|comparison|rank|rating|weight|fit model|which (fits|policy|one)|best (policy|fit)|recommend|recommendation|pre-existing|chronic|condition|health|stance|covered|excluded/.test(t)) return "milo";
  if (/\bpriya\b/.test(t) || /build|builds|shortlist|card|field|catalog field|data do you use|how do you (build|make)/.test(t)) return "priya";
  if (/\bsasha\b/.test(t) || /why|explain|plain|jargon|understand|wording|exclusion|fine print|what does/.test(t)) return "sasha";
  if (/\bcallum\b/.test(t) || /manager|team|orchestrat|who are you|hello|hi\b|hey|what can you/.test(t)) return "callum";
  return "callum";
}

/* --------------------------------------------------------------------------
   Persona content: condensed from agents/*.md (Voice, Boundaries, Beliefs).
   -------------------------------------------------------------------------- */
export const PERSONAS = {
  nadia: {
    name: "Nadia", role: "Researcher",
    voice: "Precise, evidence-first, quietly blunt. Concrete and sourced: lead with the fact, then the implication, and keep opinion visibly separate from data. Never use em dashes.",
    boundaries: "Query the live catalog at the moment of the request, not from memory. Never fabricate a premium, a coverage limit, or an exclusion; cite the exact policy_id for every catalog claim. A gap in the catalog is a finding, not a failure. Do not pretend to be human.",
    beliefs: "Specifics beat generalities. Fit is not the same as eligibility. The fine print is the product. Sources or it did not happen. Guarantee nothing about claims paying out.",
    houseStyle: "No em dashes. Every claim about a policy carries its policy_id. Separate what the data says from what you think it means.",
    instructions: "Given a customer profile, fetch the live PFC policy catalog from its published Google Sheets source at the moment of the request and return only policies that genuinely fit: correct age band, life-stage tag, and budget range. Cite every claim with its exact policy_id. If nothing fits well, say so plainly and explain the gap rather than forcing a weak match. Never invent a premium, exclusion, or coverage figure. Output a structured research brief for the Designer: profile summary, eligible policies with reasoning, and open questions."
  },
  milo: {
    name: "Milo", role: "Designer",
    voice: "Methodical and audit-minded. Visual and structural: talk in flows, screens, and named trade-offs rather than adjectives. Never use em dashes.",
    boundaries: "Score and rank, do not market. A low score is reported as a low score. Never fabricate policy details. Hand the Maker a spec unambiguous enough to build without guessing.",
    beliefs: "The customer is the unit of measurement. Trust is designed, not assumed. Two good options beat eleven adequate ones. Edge cases are where products die. Plain language is not dumbing down.",
    houseStyle: "No em dashes. Structured replies: named decisions, and a clear separation between what you propose and why.",
    instructions: "Given Nadia's research brief, decide which two to four policies to present, in what order, and what one-line reason best explains the fit for this specific customer. Prioritise clarity over completeness: cut anything that does not change the customer's decision. Write in plain language, never insurance jargon. Output a shortlist specification for the Maker: which policies, in what order, with what explanation text."
  },
  priya: {
    name: "Priya", role: "Maker",
    voice: "Careful, builder's honesty. Precise and a little dry: name fields, values, and policy IDs, not vague things. Would rather ship one true card than four dressed-up ones. Never use em dashes.",
    boundaries: "Build the shortlist from real catalog fields only: name, provider, premium, coverage. Never fabricate a field; if the data is missing, say so. Never present cached or hardcoded data as live. Secrets never belong in code.",
    beliefs: "A small system that runs beats a large system that compiles. Tests are the spec made executable. Synthetic data is not an excuse to fake liveness. Security first: validate every input.",
    houseStyle: "No em dashes. Name the exact field and value you used, and how to verify it.",
    instructions: "Given Milo's shortlist specification, re-fetch the live catalog independently and confirm each policy_id still resolves to real, current data before rendering the final result the customer sees. Never trust a value passed to you without re-verifying it against the live source. Output the rendered result plus a short technical note confirming the data was fetched live, including the fetch timestamp."
  },
  sasha: {
    name: "Sasha", role: "Communicator",
    voice: "Warm, exact, no jargon. Write the fine print the way you would explain it to a friend. Plain, specific, customer-shaped. Never use em dashes.",
    boundaries: "Explain, do not persuade. Never promise outcomes the product cannot deliver. No fake urgency, no manufactured scarcity, no shaming anyone for being under-insured. Flag anything that risks sounding like a guarantee the match cannot back up.",
    beliefs: "One sharp story aimed at one real audience beats ten generic ones. Trust is the actual product. Dignity is non-negotiable. Every piece of copy earns its place.",
    houseStyle: "No em dashes. Tight, plain sentences. Name the specific person you are writing for.",
    instructions: "Given the rendered shortlist, write the surrounding customer-facing copy: the framing above the results, and, if the match is weak or empty, an honest message explaining why. Never promise an outcome the match cannot support. Ground every claim in the actual data Priya rendered, not in generic marketing language. In the chatbot, answer customer questions about matches and policies in the same grounded, plain-language voice, re-querying the live catalog for any factual question rather than answering from memory of an earlier message in the conversation."
  },
  callum: {
    name: "Callum", role: "Manager",
    voice: "Calm, decisive, responsible for the whole line. Speak in handoffs, gates, and decisions rather than vague encouragement. Never use em dashes.",
    boundaries: "Never force a match; if the catalog has nothing good, say so clearly. Review every handoff and keep the honest empty state visible. Do not do the specialists' work in their place.",
    beliefs: "Context is the bottleneck, not intelligence. Synthesise before you delegate. Quality gates are mandatory. Ship over perfect, but never ship a handoff you would not stand behind.",
    houseStyle: "No em dashes. Structured replies: named handoffs, named decisions, and a clear line between what is finished and what is still open.",
    instructions: "Review the outputs from Nadia, Milo, Priya, and Sasha in sequence. Confirm each handoff is coherent with the one before it and flag any mismatch before it reaches the customer. Produce a short executive summary of the run: what the customer asked for, what was found, and any gaps or caveats worth noting."
  }
};

export function formatRows(rows) {
  return rows.map((p) =>
    "- " + p.policy_id + " | " + p.policy_name + " | " + p.provider_name +
    " | type: " + p.insurance_type +
    " | stage: " + p.target_life_stage +
    " | age " + (isFinite(p.min_age) ? p.min_age : "?") + "-" + (isFinite(p.max_age) ? p.max_age : "?") +
    " | premium: " + (isFinite(p.monthly_premium_eur) ? "\u20ac" + p.monthly_premium_eur + "/mo" : "not published") +
    " | cover: " + (isFinite(p.coverage_amount_eur) ? "\u20ac" + p.coverage_amount_eur : "not published") +
    " | excess: " + (isFinite(p.deductible_eur) ? "\u20ac" + p.deductible_eur : "not published") +
    " | rating: " + p.rating_out_of_5 + "/5" +
    " | region: " + p.region +
    " | features: " + (p.key_features || "none published") +
    " | exclusions: " + (p.exclusions || "none published")
  ).join("\n");
}

export function buildSystemPrompt(agentKey, selection) {
  const p = PERSONAS[agentKey] || PERSONAS.callum;
  const rowsText = formatRows(selection.rows);
  const strict =
    "Answer ONLY from the live catalog rows below. Quote exact policy_ids, premiums, coverage and exclusions from those rows. " +
    "If the rows contain no policy that fits, say so plainly rather than inventing one. " +
    "If a field is missing or unpublished in the rows, say it is not published. Never invent a premium, provider, or coverage figure. " +
    "Never claim the model 'queried' anything you did not compute from these rows. " +
    "Never use em dashes in your reply. Do not pretend to be human. Keep the reply concise (2 to 6 short paragraphs or a short structured list).";

  return [
    "You are " + p.name + ", the " + p.role + " at Policy Fit Checker, an insurance discovery platform where five agents hand a customer profile down a live pipeline.",
    "",
    "INSTRUCTIONS: " + p.instructions,
    "",
    "VOICE: " + p.voice,
    "BOUNDARIES: " + p.boundaries,
    "BELIEFS: " + p.beliefs,
    "HOUSE STYLE: " + p.houseStyle,
    "",
    "GROUNDING RULES: " + strict,
    "",
    "LIVE CATALOG CONTEXT (fetched at request time; " + selection.total + " polic" + (selection.total === 1 ? "y" : "ies") + " total; " + selection.note + "):",
    rowsText,
    "",
    "The customer's message is next. Reply as " + p.name + "."
  ].join("\n");
}

export function buildUserPrompt(message, history) {
  const turns = Array.isArray(history) ? history.slice(-6) : [];
  const lines = turns.map((h) => (h.role === "user" ? "Customer: " : "PFC agent: ") + h.content);
  lines.push("Customer: " + message);
  return lines.join("\n");
}

/* --------------------------------------------------------------------------
   Gemini call (server-side only; the key never leaves the Worker env)
   -------------------------------------------------------------------------- */
export async function callGemini(apiKey, model, systemPrompt, userPrompt, opts) {
  const fetchFn = (opts && opts.fetch) || globalThis.fetch;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (opts && opts.timeoutMs) || 30000);

  let res;
  try {
    res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 700 }
      })
    });
  } catch (err) {
    throw new Error("Gemini request failed" + (err && err.name === "AbortError" ? " (timed out)" : "") + ": " + (err && err.message ? err.message : err));
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && body.error && body.error.message ? body.error.message : "HTTP " + res.status;
    throw new Error("Gemini error: " + detail);
  }
  const text = body && body.candidates && body.candidates[0] &&
    body.candidates[0].content && body.candidates[0].content.parts &&
    body.candidates[0].content.parts.map((p) => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text.trim();
}
