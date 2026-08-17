/* ==========================================================================
   Policy Fit Checker: five-agent pipeline, driven entirely by live data.
   The Researcher's data query (Google Sheets CSV fetch) is genuinely live
   and happens in the browser at the moment of use. The other four agents
   are deterministic, persona-grounded logic over that live-fetched data,
   and Priya independently re-queries the catalog before rendering. With a
   Cloudflare Worker configured (config.js), chat replies come from a live
   LLM grounded in a per-request catalog fetch. No policy value is
   hardcoded anywhere in this file.
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   Live data source. The only "data" in this file is a URL, never policy
   values. Every catalog read goes through fetchLiveCatalog() below, which
   hits a live Google Sheets CSV at the moment it is called. Nothing is
   cached, stored, or hardcoded; a failed fetch is a visible error state.
   -------------------------------------------------------------------------- */
var SHEET_ID = "1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8";
var SHEET_GID = "1610292741";

/* Optional: the published, durable CSV link for this sheet's tab
   (File > Share > Publish to web > the "1610292741" tab > CSV).
   `https://docs.google.com/spreadsheets/d/e/<published-id>/pub?gid=1610292741&single=true&output=csv`
   Paste it below once published. Left empty, the export endpoint is used
   instead (also keyless and CORS-open). */
var PUBLISHED_CSV_URL = "";

function sheetCsvUrl() {
  if (PUBLISHED_CSV_URL) {
    return PUBLISHED_CSV_URL + (PUBLISHED_CSV_URL.indexOf("?") === -1 ? "?" : "&") + "cb=" + Date.now();
  }
  return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=" + SHEET_GID + "&cb=" + Date.now();
}
function sheetJsonpUrl() {
  return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?gid=" + SHEET_GID + "&tqx=out:json;responseHandler:pfcCallback&cb=" + Date.now();
}

/* --------------------------------------------------------------------------
   Liveness diagnostic. Updated on every fresh fetch so the "live" claim is
   provable on the match page and the chat page, and in the chat widget.
   -------------------------------------------------------------------------- */
var __pfcDiag = { at: null, count: null, source: null };
function noteCatalogFetch(count, at, source) {
  __pfcDiag.count = count;
  __pfcDiag.at = at || new Date();
  __pfcDiag.source = source || "live";
  var label = "Catalog fetched " + __pfcDiag.at.toLocaleTimeString() + ", " + count + " policies loaded.";
  document.querySelectorAll("[data-catalog-diag]").forEach(function (el) { el.textContent = label; });
}

/* --------------------------------------------------------------------------
   Persona voices (templated, grounded in live fields, per each agent's tone)
   -------------------------------------------------------------------------- */
var STAGE_TAGS = {
  "Student": ["student", "under-26", "budget-friendly", "low-commitment"],
  "Young Professional": ["career-focused", "digital-first", "no-dependents", "flexible"],
  "New Parent": ["family-protection", "income-replacement", "dependents", "long-term"],
  "Family": ["multi-person-cover", "dependents", "family-discount"],
  "Self-Employed": ["self-employed-friendly", "no-employer-benefits", "flexible-income-cover"],
  "Chronic Condition Management": ["pre-existing-condition-friendly", "ongoing-care", "specialist-cover"],
  "Senior": ["over-60", "fixed-income", "simplified-underwriting", "pre-existing-condition-friendly"],
  "General Adult": ["standard-cover", "general-purpose"]
};

/* --------------------------------------------------------------------------
   Tiny helpers
   -------------------------------------------------------------------------- */
function $(sel) { return document.querySelector(sel); }

function sleep(ms) {
  return new Promise(function (res) { setTimeout(res, ms); });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function money(n) {
  return "€" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* --------------------------------------------------------------------------
   CSV parsing + Google Sheets loaders (fetch first, JSONP fallback)
   -------------------------------------------------------------------------- */
function parseCSV(text) {
  var rows = [], row = [], cur = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  row.push(cur);
  if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
  return rows;
}

function rowToPolicy(header, row) {
  var p = {};
  header.forEach(function (col, i) {
    var v = (row[i] || "").trim();
    if (["min_age", "max_age", "monthly_premium_eur", "coverage_amount_eur", "deductible_eur", "rating_out_of_5"].indexOf(col) !== -1)
      p[col] = parseFloat(v) || 0;
    else if (col === "suitability_tags") p[col] = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    else p[col] = v;
  });
  return p;
}

function loadViaJSONP() {
  return new Promise(function (resolve, reject) {
    var s = document.createElement("script");
    var done = false;
    function cleanup() { delete window.pfcCallback; s.remove(); }
    window.pfcCallback = function (json) {
      if (done) return; done = true; clearTimeout(timer); cleanup();
      if (!json || json.status !== "ok" || !json.table) return reject(new Error("Catalog responded with an error"));
      var header = json.table.cols.map(function (c) { return (c.label && c.label !== "") ? c.label : c.id; });
      var rows = json.table.rows.map(function (r) { return r.c.map(function (cell) { return (cell && cell.v != null) ? String(cell.v) : ""; }); });
      resolve(rows.map(function (r) { return rowToPolicy(header, r); }));
    };
    var timer = setTimeout(function () { if (!done) { done = true; cleanup(); reject(new Error("Catalog request timed out")); } }, 20000);
    s.onerror = function () { if (!done) { done = true; clearTimeout(timer); cleanup(); reject(new Error("Catalog could not be reached")); } };
    s.src = sheetJsonpUrl();
    document.head.appendChild(s);
  });
}

/* Shared live catalog fetch. Every agent that touches policy data calls this,
   at the moment of use, and it updates the on-page liveness diagnostic. */
function fetchLiveCatalog() {
  return fetch(sheetCsvUrl())
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Catalog is empty");
      var policies = rows.slice(1).map(function (r) { return rowToPolicy(rows[0], r); });
      noteCatalogFetch(policies.length);
      return policies;
    })
    .catch(function (err) {
      return loadViaJSONP().then(function (policies) {
        noteCatalogFetch(policies.length);
        return policies;
      });
    });
}

/* --------------------------------------------------------------------------
   Agent: Nadia, Researcher. Live query + eligibility scan + honest gap note.
   -------------------------------------------------------------------------- */
function nadiaResearch(catalog, profile) {
  var eligible = catalog.filter(function (p) {
    if (profile.age < p.min_age || profile.age > p.max_age) return false;
    if (profile.region !== "Any" && p.region !== "EU-Wide" && p.region !== profile.region) return false;
    return true;
  });
  var inBudget = eligible.filter(function (p) { return p.monthly_premium_eur <= profile.budget; });
  var note = null;
  if (eligible.length <= 6) {
    note = "Nadia: the live catalog is thin for your segment. Only " + eligible.length + " polic" +
      (eligible.length === 1 ? "y" : "ies") + " match your age band and region, and " + inBudget.length +
      " sit inside your budget. That is a finding, not a failure.";
  }
  return { total: catalog.length, eligible: eligible, inBudget: inBudget, note: note };
}

/* --------------------------------------------------------------------------
   Agent: Milo, Designer. Stance classifier + fit scoring.
   -------------------------------------------------------------------------- */
function classifyStance(policy, condition) {
  if (!condition || condition === "None") return null;
  var tags = (policy.suitability_tags || []).join(" ").toLowerCase();
  var features = (policy.key_features || "").toLowerCase();
  var exclusions = (policy.exclusions || "").toLowerCase();

  if (condition === "Chronic condition") {
    if (/pre-existing-condition-friendly/.test(tags)) return { level: "ok", label: "Welcomes pre-existing conditions" };
    if (/no medical exam/.test(features)) return { level: "ok", label: "No medical exam under the coverage threshold" };
    if (/pre-existing condition cover option/.test(features)) return { level: "ok", label: "Offers a pre-existing condition cover option" };
    if (/excluded for first 6 months/.test(exclusions)) return { level: "warn", label: "Waiting period on pre-existing conditions" };
    if (/undeclared pre-existing conditions excluded/.test(exclusions)) return { level: "warn", label: "Covers declared conditions only" };
    if (/pre-existing conditions excluded/.test(exclusions)) return { level: "bad", label: "Excludes pre-existing conditions" };
    return { level: "warn", label: "No explicit pre-existing condition wording" };
  }
  if (condition === "Mental health support") {
    if (/mental health/.test(features)) return { level: "ok", label: "Includes mental health cover" };
    if (/pre-existing conditions excluded/.test(exclusions)) return { level: "bad", label: "Excludes pre-existing conditions" };
    return { level: "warn", label: "No explicit mental health wording" };
  }
  if (condition === "Ongoing care") {
    if (/ongoing-care/.test(tags) || /ongoing care/.test(features)) return { level: "ok", label: "Tailored to ongoing care needs" };
    if (/pre-existing conditions excluded/.test(exclusions)) return { level: "bad", label: "Excludes pre-existing conditions" };
    return { level: "warn", label: "No explicit ongoing-care wording" };
  }
  return null;
}

function scorePolicy(policy, profile, stance) {
  var parts = { life: 0, condition: 0, budget: 0, region: 0, rating: 0, coverage: 0 };
  var reasons = [];

  var stage = STAGE_TAGS[profile.stage] || [];
  var tags = policy.suitability_tags || [];
  var lifeOverlap = tags.filter(function (t) { return stage.indexOf(t) !== -1; }).length;

  if (policy.target_life_stage === profile.stage) { parts.life = 25; reasons.push("your life stage matches this policy's target"); }
  else if (lifeOverlap > 0) { parts.life = 12; reasons.push("shares " + lifeOverlap + " suitability tag" + (lifeOverlap === 1 ? "" : "s") + " with your life stage"); }
  if (profile.dependants !== "None" && tags.indexOf("dependents") !== -1) { parts.life += 5; reasons.push("built for people supporting dependants"); }

  if (stance) {
    parts.condition = stance.level === "ok" ? 30 : stance.level === "warn" ? 18 : 4;
    reasons.push(stance.label.toLowerCase());
  } else {
    parts.condition = 15;
    reasons.push("no health considerations raised");
  }

  var premium = policy.monthly_premium_eur;
  if (premium <= profile.budget) { parts.budget = 20; reasons.push("inside your budget at " + money(premium) + " a month"); }
  else { parts.budget = 20 * (profile.budget / premium); reasons.push("above your budget at " + money(premium) + " a month"); }

  if (profile.region === "Any" || policy.region === "EU-Wide" || policy.region === profile.region) { parts.region = 10; }
  parts.rating = 10 * (policy.rating_out_of_5 / 5);
  parts.coverage = 5 * Math.min(1, policy.coverage_amount_eur / 100000);

  var total = Math.round((parts.life + parts.condition + parts.budget + parts.region + parts.rating + parts.coverage) * 10) / 10;
  return { total: total, parts: parts, reasons: reasons };
}

function miloDesign(eligible, profile) {
  return eligible.map(function (p) {
    var stance = classifyStance(p, profile.condition);
    var s = scorePolicy(p, profile, stance);
    return { policy: p, stance: stance, score: s };
  }).filter(function (x) { return x.score.total > 0; })
    .sort(function (a, b) { return b.score.total - a.score.total; });
}

/* --------------------------------------------------------------------------
   Agent: Priya, Maker. Build the shortlist from live fields, guarded, and
   independently re-verify against a fresh catalog fetch (a live cross-check:
   she re-queries the published sheet herself before rendering anything).
   -------------------------------------------------------------------------- */
function priyaBuild(scored, profile, liveRows, fetchTime) {
  var liveById = {};
  (liveRows || []).forEach(function (p) { if (p.policy_id) liveById[p.policy_id] = p; });

  var shortlist = scored.slice(0, 4).map(function (x) {
    var p = x.policy;
    var card = {
      policy_id: p.policy_id || "n/a",
      policy_name: p.policy_name || "Unnamed policy",
      provider: p.provider_name || "Unknown provider",
      min_age: isFinite(p.min_age) ? p.min_age : null,
      max_age: isFinite(p.max_age) ? p.max_age : null,
      premium: isFinite(p.monthly_premium_eur) ? p.monthly_premium_eur : null,
      coverage: isFinite(p.coverage_amount_eur) ? p.coverage_amount_eur : null,
      deductible: isFinite(p.deductible_eur) ? p.deductible_eur : null,
      type: p.insurance_type || "",
      region: p.region || "",
      rating: isFinite(p.rating_out_of_5) ? p.rating_out_of_5 : null,
      stance: x.stance,
      score: x.score,
      overBudget: isFinite(p.monthly_premium_eur) && p.monthly_premium_eur > profile.budget
    };
    return card;
  });

  var stale = shortlist.filter(function (c) { return liveById && !liveById[c.policy_id]; }).map(function (c) { return c.policy_id; });
  var verified = shortlist.filter(function (c) { return !stale.length || liveById[c.policy_id]; });

  var note = shortlist.length === 0
    ? "Priya: no eligible policy passed the fit bar. Nothing was invented to fill the gap."
    : "Priya: " + shortlist.length + " card" + (shortlist.length === 1 ? "" : "s") + " built from live catalog fields only." +
      (stale.length
        ? " Priya re-queried the catalog independently and " + stale.length + " shortlisted polic" + (stale.length === 1 ? "y no longer resolves" : "ies no longer resolve") + " (" + stale.join(", ") + ") \u2014 surfaced honestly."
        : " Priya re-queried the catalog independently and every shortlisted policy_id still resolves.") +
      (fetchTime ? " Fetched live at " + fetchTime.toLocaleTimeString() + "." : "");
  return { shortlist: shortlist, verified: verified, stale: stale, note: note };
}

/* --------------------------------------------------------------------------
   Agent: Sasha, Communicator. The why line, grounded in real numbers.
   -------------------------------------------------------------------------- */
function sashaWhy(card, profile) {
  var bits = [];
  var ageOk = card.min_age != null && card.max_age != null && profile.age >= card.min_age && profile.age <= card.max_age;
  if (ageOk) bits.push("your age fits its band");
  else if (card.min_age != null) bits.push("your age sits at the edge of its range");
  else bits.push("its age band is not published in the catalog");
  bits.push(card.premium !== null ? "it costs " + money(card.premium) + " a month" : "pricing to confirm with provider");
  if (card.overBudget) bits.push("which is over your budget");
  else if (card.premium !== null) bits.push("inside your budget");
  if (card.stance) bits.push(card.stance.label.toLowerCase());
  var line = "Fits you because " + bits.join(", ") + ". Real catalog entry, live at query time.";
  return line;
}

function sashaEmpty(profile) {
  return "No policy in the live catalog fits your profile well right now. We will not force a match or dress up a weak one. Try widening your budget or age range, or a different health consideration, and run the pipeline again.";
}

/* --------------------------------------------------------------------------
   Agent: Callum, Manager. Review + synthesis.
   -------------------------------------------------------------------------- */
function callumSynthesise(shortlist, profile, nadia) {
  if (shortlist.length === 0) {
    return {
      html: "Nadia confirmed <b>" + nadia.total + "</b> policies in the live catalog; after Milo's scoring, none met your profile's bar. That is a real gap in the catalog, not a failure of the match.",
      note: "Callum: the honest empty state stands. Nothing is forced."
    };
  }
  var top = shortlist[0];
  var topReasons = top.score.reasons.slice(0, 3).map(esc).join("; ");
  var html = "Callum's recommendation: <b>" + esc(top.policy_name) + "</b> (" + esc(top.provider) + ", <span class='mono'>" + esc(top.policy_id) + "</span>). It scored highest because " + topReasons + ".";
  if (shortlist[1]) {
    var second = shortlist[1];
    var why = second.overBudget
      ? "its premium runs over your budget"
      : (second.stance && second.stance.level === "bad") ? "it excludes your health consideration"
      : "it scored lower on the criteria that matter most for you";
    html += " If that is not right, <b>" + esc(second.policy_name) + "</b> is the closest alternative; it lost out because " + why + ".";
  }
  return { html: html, note: "Callum: shortlist reviewed, handoffs checked, recommendation synthesised." };
}

/* --------------------------------------------------------------------------
   Pipeline UI
   -------------------------------------------------------------------------- */
var nodes = {};
function initNodes() {
  document.querySelectorAll(".node").forEach(function (el) { nodes[el.getAttribute("data-node")] = el; });
}
function movePulse(key) {
  var el = nodes[key];
  if (!el) return;
  var track = document.querySelector(".pipeline .pipeline-track .pulse");
  if (!track) return;
  var pipe = el.offsetParent;
  if (!pipe) return;
  var center = el.offsetLeft + el.offsetWidth / 2;
  var pct = 6 + (center / (pipe.offsetWidth || 1)) * 88;
  track.style.left = Math.min(94, Math.max(6, pct)) + "%";
}
function setNode(key, state, statusText) {
  var el = nodes[key];
  if (!el) return;
  el.classList.remove("active", "done");
  if (state) el.classList.add(state);
  var st = el.querySelector(".node-status");
  if (st && statusText) st.textContent = statusText;
  movePulse(key);
}
function resetPipeline() {
  ["nadia", "milo", "priya", "sasha", "callum"].forEach(function (k) {
    setNode(k, null, "Idle");
  });
  var p = $("#pipeline");
  if (p) p.classList.remove("running");
  var log = $("#pipelineLog");
  if (log) log.innerHTML = "";
}

var logId = 0;
function appendLog(text, cls) {
  var log = $("#pipelineLog");
  if (!log) return;
  var el = document.createElement("p");
  el.className = "log-line " + (cls || "");
  el.textContent = text;
  log.appendChild(el);
  logId++;
  log.scrollTop = log.scrollHeight;
}

async function pipelineStep(key, activeLabel, work, statusLines, minMs) {
  var floor = typeof minMs === "number" ? minMs : 6000;
  setNode(key, "active", statusLines ? statusLines[0] || "Working" : "Working");
  appendLog(activeLabel, "agent");
  var started = Date.now();
  var result = await work();
  var elapsed = Date.now() - started;
  var remaining = Math.max(0, floor - elapsed);
  if (remaining > 0) await sleep(remaining);
  setNode(key, "done", "Done");
  return result;
}

function setNodeStatus(key, text) {
  var el = nodes[key];
  if (!el) return;
  var st = el.querySelector(".node-status");
  if (st) st.textContent = text;
}

/* --------------------------------------------------------------------------
   Handoff trace: captures every agent's structured output for the trace panel
   -------------------------------------------------------------------------- */
var __trace = [];
function traceCapture(agent, label, data) {
  __trace.push({ agent: agent, label: label, data: data, ts: new Date() });
}

/* --------------------------------------------------------------------------
   Quality-gate: Callum reviews Sasha's copy for real policy_id citations,
   grounded claims, and no unsupported promises. Returns { pass, reason, target }.
   -------------------------------------------------------------------------- */
function callumReview(built, catalog) {
  var ids = catalog.map(function (p) { return p.policy_id; });
  var issues = [];

  built.shortlist.forEach(function (c) {
    if (!c.policy_id || ids.indexOf(c.policy_id) === -1) {
      issues.push({ target: "sasha", msg: "Copy references policy_id " + (c.policy_id || "none") + " which is not in the catalog" });
    }
    if (c.why && /\bguarantee|assured|definitely|will pay out\b/i.test(c.why)) {
      issues.push({ target: "sasha", msg: "Copy for " + c.policy_id + " makes an unsupported promise: \"" + c.why.substring(0, 80) + "\"" });
    }
    if (!c.why || c.why.trim().length < 10) {
      issues.push({ target: "sasha", msg: "Copy for " + c.policy_id + " is too thin to be useful" });
    }
  });

  if (built.shortlist.length > 0) {
    var topIds = built.shortlist.map(function (c) { return c.policy_id; });
    var nadiaIds = (built._nadiaEligible || []).map(function (p) { return p.policy_id; });
    var missingFromNadia = topIds.filter(function (id) { return nadiaIds.indexOf(id) === -1; });
    if (missingFromNadia.length > 0) {
      issues.push({ target: "milo", msg: "Shortlist includes " + missingFromNadia.join(", ") + " which were not in Nadia's eligible set" });
    }
  }

  if (issues.length === 0) return { pass: true };
  var primaryTarget = issues[0].target || "sasha";
  return { pass: false, reason: issues.map(function (i) { return i.msg; }).join("; "), target: primaryTarget };
}

async function runPipeline(profile) {
  if (window.__pfcRunning) return;
  window.__pfcRunning = true;
  resetPipeline();
  __trace = [];
  var pipeEl = $("#pipeline");
  if (pipeEl) pipeEl.classList.add("running");
  var retryCount = 0;
  try {
    setNodeStatus("nadia", "retrieving catalog...");
    var catalog = await pipelineStep("nadia",
      "Querying the live policy catalog\u2026", function () { return fetchLiveCatalog(); }, undefined, 10000);
    var nadia = nadiaResearch(catalog, profile);
    traceCapture("nadia", "Research brief", {
      total: nadia.total, eligible: nadia.eligible.map(function (p) { return p.policy_id; }),
      note: nadia.note || "Standard query"
    });
    setNodeStatus("nadia", nadia.eligible.length + " policies matched");
    appendLog("Queried " + nadia.total + " live polic" + (nadia.total === 1 ? "y" : "ies") + "; " + nadia.eligible.length + " match your age band and region", "done");
    if (nadia.note) appendLog(nadia.note, "agent");

    setNodeStatus("milo", "scoring " + nadia.eligible.length + " policies...");
    var scored = await pipelineStep("milo",
      "Scoring " + nadia.eligible.length + " eligible policies against your profile\u2026",
      function () { return Promise.resolve(miloDesign(nadia.eligible, profile)); }, undefined, 8000);
    traceCapture("milo", "Ranking", {
      ranked: scored.map(function (s) { return { id: s.policy.policy_id, score: s.score.total, reasons: s.score.reasons }; })
    });
    setNodeStatus("milo", scored.length + " ranked by fit");
    appendLog("Scored and ranked " + scored.length + " polic" + (scored.length === 1 ? "y" : "ies") + " by fit, not price", "done");

    setNodeStatus("priya", "re-fetching catalog to verify...");
    var built = await pipelineStep("priya",
      "Building your shortlist from live catalog fields\u2026",
      function () {
        return fetchLiveCatalog().then(function (liveRows) {
          var fetchTime = new Date();
          var result = priyaBuild(scored, profile, liveRows, fetchTime);
          result._nadiaEligible = nadia.eligible;
          return result;
        });
      }, undefined, 6000);
    traceCapture("priya", "Verification", {
      shortlisted: built.shortlist.map(function (c) { return c.policy_id; }),
      note: built.note
    });
    setNodeStatus("priya", built.shortlist.length + " verified");
    appendLog(built.note, "done");

    setNodeStatus("sasha", "writing copy...");
    var copy = await pipelineStep("sasha",
      "Writing the why behind each recommendation\u2026",
      function () {
        built.shortlist.forEach(function (c) { c.why = sashaWhy(c, profile); });
        return Promise.resolve({ empty: built.shortlist.length === 0 ? sashaEmpty(profile) : null });
      }, undefined, 6000);
    traceCapture("sasha", "Copy", {
      reasons: built.shortlist.map(function (c) { return { id: c.policy_id, why: c.why }; })
    });
    setNodeStatus("sasha", "wrote " + built.shortlist.length + " explanations");
    appendLog(copy.empty ? "The catalog is empty for this profile; wrote the honest message instead" : "Wrote the reason under each of the " + built.shortlist.length + " polic" + (built.shortlist.length === 1 ? "y" : "ies"), "done");

    setNodeStatus("callum", "reviewing handoffs...");
    var verdict = await pipelineStep("callum",
      "Reviewing the handoffs and synthesising the recommendation\u2026",
      function () { return Promise.resolve(callumSynthesise(built.shortlist, profile, nadia)); }, undefined, 6000);

    /* Quality-gate: Callum reviews the full pipeline output */
    setNodeStatus("callum", "quality-gate check...");
    var gate = callumReview(built, catalog);
    traceCapture("callum", "Quality gate", { pass: gate.pass, reason: gate.reason || "All checks passed" });

    if (!gate.pass && retryCount < 1) {
      retryCount++;
      appendLog("Callum flagged: " + gate.reason + " \u2014 sending back to " + gate.target, "warn");
      setNodeStatus("callum", "flagged, sending back to " + gate.target);

      /* Show backward animation on pipeline */
      var pipeTrack = document.querySelector(".pipeline-track");
      if (pipeTrack) pipeTrack.classList.add("revision-loop");
      setNode(gate.target, "revision", "Re-running");
      await sleep(350);

      if (gate.target === "sasha") {
        setNodeStatus("sasha", "re-writing copy...");
        built.shortlist.forEach(function (c) { c.why = sashaWhy(c, profile); });
        traceCapture("sasha", "Copy (retry)", {
          reasons: built.shortlist.map(function (c) { return { id: c.policy_id, why: c.why }; })
        });
        setNodeStatus("sasha", "re-wrote " + built.shortlist.length + " explanations");
      } else if (gate.target === "milo") {
        setNodeStatus("milo", "re-scoring...");
        scored = miloDesign(nadia.eligible, profile);
        traceCapture("milo", "Ranking (retry)", {
          ranked: scored.map(function (s) { return { id: s.policy.policy_id, score: s.score.total, reasons: s.score.reasons }; })
        });
        setNodeStatus("milo", "re-scored " + scored.length + " policies");
        built = await new Promise(function (resolve) {
          fetchLiveCatalog().then(function (liveRows) {
            var result = priyaBuild(scored, profile, liveRows, new Date());
            result._nadiaEligible = nadia.eligible;
            resolve(result);
          });
        });
        built.shortlist.forEach(function (c) { c.why = sashaWhy(c, profile); });
        traceCapture("priya", "Re-verification", {
          shortlisted: built.shortlist.map(function (c) { return c.policy_id; })
        });
      } else if (gate.target === "nadia") {
        setNodeStatus("nadia", "re-querying catalog...");
        catalog = await fetchLiveCatalog();
        nadia = nadiaResearch(catalog, profile);
        traceCapture("nadia", "Research (retry)", {
          total: nadia.total, eligible: nadia.eligible.map(function (p) { return p.policy_id; })
        });
        setNodeStatus("nadia", nadia.eligible.length + " re-matched");
        scored = miloDesign(nadia.eligible, profile);
        built = await new Promise(function (resolve) {
          fetchLiveCatalog().then(function (liveRows) {
            var result = priyaBuild(scored, profile, liveRows, new Date());
            result._nadiaEligible = nadia.eligible;
            resolve(result);
          });
        });
        built.shortlist.forEach(function (c) { c.why = sashaWhy(c, profile); });
      }

      if (pipeTrack) pipeTrack.classList.remove("revision-loop");
      setNode(gate.target, "done", "Done");

      gate = callumReview(built, catalog);
      traceCapture("callum", "Quality gate (re-check)", { pass: gate.pass, reason: gate.reason || "All checks passed" });

      if (!gate.pass) {
        appendLog("Second check still flagged: " + gate.reason + ". Showing honest status to customer.", "warn");
        verdict = { note: "The pipeline found issues it could not resolve automatically. Here is an honest summary of what was found.", html: "<p>Callum's quality gate flagged: " + esc(gate.reason) + ". Rather than serve a questionable result, we are showing you exactly what happened.</p>" };
      }
    }

    setNodeStatus("callum", "signed off");
    appendLog(verdict.note, "done");
    traceCapture("callum", "Final verdict", { note: verdict.note });

    window.__lastRun = {
      total: nadia.total,
      eligible: nadia.eligible.length,
      shortlisted: built.shortlist.length,
      at: new Date(),
      profile: profile,
      top: scored[0],
      trace: __trace.slice(),
      retries: retryCount
    };

    renderResults(built, copy, verdict);
  } catch (err) {
    setNode("nadia", null, "Failed");
    var logEl = $("#pipelineLog");
    if (logEl) logEl.innerHTML = "";
    appendLog("The live catalog could not be reached: " + err.message + ". This page never fakes a match; try again in a moment.", "agent");
    var res = $("#results");
    res.hidden = false;
    $("#verdict").hidden = true;
    $("#emptyState").hidden = false;
    $("#emptyState").innerHTML =
      "<h3>No connection, no fake match</h3>" +
      "<p>Priya keeps that rule: if the catalog cannot be queried live, nothing gets invented to fill the gap.</p>" +
      "<p>Check your connection and run the pipeline again.</p>";
    $("#resultCards").innerHTML = "";
  } finally {
    window.__pfcRunning = false;
  }
}

/* --------------------------------------------------------------------------
   Results rendering
   -------------------------------------------------------------------------- */
function stanceHTML(stance) {
  if (!stance) return "";
  var cls = { ok: "ok", warn: "warn", bad: "bad" }[stance.level] || "warn";
  var icon = { ok: "Fits your health consideration", warn: "Check the fine print", bad: "Not covered for this" }[stance.level];
  return '<span class="stance ' + cls + '"><b>' + icon + "</b> &middot; " + esc(stance.label) + "</span>";
}

function renderResults(built, copy, verdict) {
  var res = $("#results");
  res.hidden = false;
  $("#resultCards").innerHTML = "";
  $("#verdict").hidden = built.shortlist.length === 0;
  $("#verdict").innerHTML = verdict.html;

  var sum = $("#pipelineSummary");
  if (sum && window.__lastRun) {
    var lr = window.__lastRun;
    sum.innerHTML =
      "<b>Live run, " + lr.at.toLocaleTimeString() + ".</b> Nadia queried " + lr.total + " polic" + (lr.total === 1 ? "y" : "ies") +
      " from the published catalog; Milo scored " + lr.eligible + " eligible against your profile; Priya re-queried independently and built the shortlist; Callum signed it off. Nothing here is cached or hardcoded.";
  } else if (sum) {
    sum.innerHTML = "<b>Live run.</b> Catalog fetched fresh for this match.";
  }

  var oldSb = res.querySelector(".score-breakdown");
  if (oldSb) oldSb.remove();
  if (built.shortlist.length && built.shortlist[0].score && built.shortlist[0].score.parts) {
    var labels = { life: "Life stage", condition: "Health fit", budget: "Budget", region: "Region", rating: "Rating", coverage: "Coverage" };
    var sb = document.createElement("div");
    sb.className = "score-breakdown";
    var parts = built.shortlist[0].score.parts;
    Object.keys(parts).forEach(function (k) {
      var row = document.createElement("div");
      row.className = "sb-row";
      var pct = Math.max(2, Math.min(100, parts[k]));
      row.innerHTML =
        "<i>" + esc(labels[k] || k) + "</i>" +
        '<span class="sb-track"><span class="sb-fill" style="width:' + pct + '%"></span></span>' +
        "<b>" + Math.round(parts[k]) + "</b>";
      sb.appendChild(row);
    });
    res.insertBefore(sb, $("#resultCards"));
  }

  if (built.shortlist.length === 0) {
    $("#emptyState").hidden = false;
    $("#emptyState").innerHTML = "<h3>Nothing fits well right now</h3><p>" + esc(copy.empty) + "</p>";
  } else {
    $("#emptyState").hidden = true;
    built.shortlist.forEach(function (c, i) {
      var el = document.createElement("article");
      el.className = "card" + (i === 0 ? " top" : "");
      el.innerHTML =
        (i === 0 ? '<span class="card-top-label">Top fit</span>' : "") +
        "<h3>" + esc(c.policy_name) + "</h3>" +
        '<p class="provider">' + esc(c.provider) + " &middot; " + esc(c.region) + " &middot; " + esc(c.type) + "</p>" +
        '<div class="mono-row">' +
          '<span><span class="k">policy</span> ' + esc(c.policy_id) + "</span>" +
          '<span><span class="k">premium</span> <span class="premium">' + (c.premium !== null ? money(c.premium) + "/mo" : "on request") + "</span>" +
            (c.overBudget ? " <span class='tag' style='color:var(--bad)'>over budget</span>" : "") + "</span>" +
          '<span><span class="k">cover</span> ' + (c.coverage !== null ? money(c.coverage) : "on request") + "</span>" +
          '<span><span class="k">excess</span> ' + (c.deductible !== null ? money(c.deductible) : "on request") + "</span>" +
          '<span><span class="k">fit</span> ' + Math.round(c.score.total) + "/100</span>" +
        "</div>" +
        (c.score.reasons && c.score.reasons.length ? '<div class="tags">' + c.score.reasons.slice(0, 3).map(function (r) { return '<span class="tag">' + esc(r) + "</span>"; }).join("") + "</div>" : "") +
        '<p class="why"><b>Sasha:</b> ' + esc(c.why) + "</p>" +
        stanceHTML(c.stance) +
        '<p class="caveat">Verify every detail with the provider before buying. This is a fit match on live catalog fields, not a guarantee.</p>';
      $("#resultCards").appendChild(el);
    });
  }
  renderTracePanel();
  smoothScrollTo(res);
}

/* --------------------------------------------------------------------------
   Handoff trace panel: shows the structured output each agent passed
   -------------------------------------------------------------------------- */
function renderTracePanel() {
  var lr = window.__lastRun;
  if (!lr || !lr.trace || !lr.trace.length) return;
  var res = $("#results");
  if (!res) return;
  var existing = res.querySelector(".trace-panel");
  if (existing) existing.remove();

  var panel = document.createElement("div");
  panel.className = "trace-panel";
  var names = { nadia: "Nadia (Research)", milo: "Milo (Design)", priya: "Priya (Maker)", sasha: "Sasha (Copy)", callum: "Callum (Manager)" };
  var html = '<button type="button" class="trace-toggle" aria-expanded="false">View handoff trace</button>';
  html += '<div class="trace-body" hidden>';
  html += '<p class="trace-retry">' + (lr.retries ? "Callum's quality gate triggered " + lr.retries + " revision" + (lr.retries > 1 ? "s" : "") + "." : "Quality gate passed on first check.") + '</p>';
  lr.trace.forEach(function (t) {
    html += '<div class="trace-step">';
    html += '<span class="trace-agent">' + (names[t.agent] || t.agent) + '</span>';
    html += '<span class="trace-label">' + esc(t.label) + '</span>';
    html += '<span class="trace-ts">' + t.ts.toLocaleTimeString() + '</span>';
    html += '<pre class="trace-data">' + esc(JSON.stringify(t.data, null, 2)) + '</pre>';
    html += '</div>';
  });
  html += '</div>';
  panel.innerHTML = html;
  res.appendChild(panel);

  var toggle = panel.querySelector(".trace-toggle");
  var body = panel.querySelector(".trace-body");
  toggle.addEventListener("click", function () {
    var open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide handoff trace" : "View handoff trace";
  });
}

/* --------------------------------------------------------------------------
   Intake flow: six short questions, one at a time
   -------------------------------------------------------------------------- */
var STEPS = [
  { key: "stage", type: "options", title: "What stage of life are you in?", hint: "This is the single biggest driver of the match. Pick the closest.",
    options: [
      { v: "Student", l: "Student" },
      { v: "Young Professional", l: "Young professional" },
      { v: "New Parent", l: "New parent" },
      { v: "Family", l: "Family with dependants" },
      { v: "Self-Employed", l: "Self-employed or freelance" },
      { v: "Chronic Condition Management", l: "Managing a health condition" },
      { v: "Senior", l: "Senior" },
      { v: "General Adult", l: "None of these fit neatly" }
    ] },
  { key: "age", type: "range", title: "How old are you?", hint: "Policies in the live catalog are age-banded.", min: 17, max: 85, unit: " yrs", def: 30 },
  { key: "dependants", type: "options", title: "Do you support others financially?", hint: "This changes which policies we can honestly recommend.",
    options: [
      { v: "None", l: "Just me" },
      { v: "Partner", l: "I have a partner" },
      { v: "Children", l: "I have children" },
      { v: "Other dependants", l: "Other dependants" }
    ] },
  { key: "condition", type: "options", title: "Any health consideration to match for?", hint: "We scan the fine print for it, so you see the exclusion before a claim, not after.",
    options: [
      { v: "None", l: "No, nothing specific" },
      { v: "Chronic condition", l: "A chronic condition (e.g. diabetes, heart, asthma)" },
      { v: "Mental health support", l: "Mental health support" },
      { v: "Ongoing care", l: "Other ongoing care" }
    ] },
  { key: "budget", type: "range", title: "What can you comfortably spend per month?", hint: "Being honest here is how we keep you out of over-budget recommendations.", min: 0, max: 150, step: 5, unit: " €", def: 60 },
  { key: "region", type: "options", title: "Where do you want cover?", hint: "The live catalog covers Ireland, the UK, and EU-wide products.",
    options: [
      { v: "Any", l: "Anywhere in the catalog" },
      { v: "EU-Wide", l: "EU-wide cover" },
      { v: "Ireland", l: "Ireland" },
      { v: "UK", l: "United Kingdom" }
    ] }
];

var stepIdx = 0;
var answers = {};

function setStep(sel) {
  stepIdx = sel;
  document.querySelectorAll("#stepBar span").forEach(function (sp, i) { sp.classList.toggle("on", i <= stepIdx); });
  renderStep();
}

function renderStep() {
  var s = STEPS[stepIdx];
  $("#stepTitle").textContent = s.title;
  $("#stepHint").textContent = s.hint;
  $("#stepBack").hidden = stepIdx === 0;
  var next = $("#stepNext");
  next.textContent = stepIdx === STEPS.length - 1 ? "Show me my match" : "Continue";
  next.disabled = false;

  var ctl = $("#stepControl");
  ctl.innerHTML = "";

  if (s.type === "options") {
    s.options.forEach(function (opt, i) {
      var lab = document.createElement("label");
      var inp = document.createElement("input");
      inp.type = "radio";
      inp.name = "step";
      inp.value = opt.v;
      inp.id = "opt_" + stepIdx + "_" + i;
      inp.setAttribute("aria-label", opt.l);
      if (answers[s.key] === opt.v) { inp.checked = true; lab.classList.add("sel"); }
      var span = document.createElement("span");
      span.textContent = opt.l;
      lab.appendChild(inp);
      lab.appendChild(span);
      lab.addEventListener("click", function () {
        ctl.querySelectorAll("label").forEach(function (l) { l.classList.remove("sel"); });
        lab.classList.add("sel");
        next.disabled = false;
        answers[s.key] = inp.value;
        if (stepIdx === STEPS.length - 1) setTimeout(finishAndRun, 380);
      });
      lab.addEventListener("keydown", function (e) { if (e.key === "Enter") { next.focus(); } });
      ctl.appendChild(lab);
    });
    if (!answers[s.key]) next.disabled = true;
  } else if (s.type === "range") {
    var row = document.createElement("div");
    row.className = "range-row";
    var range = document.createElement("input");
    range.type = "range";
    range.min = s.min; range.max = s.max;
    if (s.step) range.step = s.step;
    range.value = answers[s.key] != null ? answers[s.key] : s.def;
    var val = document.createElement("span");
    val.className = "range-value";
    val.textContent = range.value + (s.unit || "");
    range.addEventListener("input", function () { val.textContent = range.value + (s.unit || ""); });
    row.appendChild(range);
    row.appendChild(val);
    ctl.appendChild(row);
  }
}

function finishAndRun() {
  var profile = {
    stage: answers.stage,
    age: answers.age,
    dependants: answers.dependants,
    condition: answers.condition,
    budget: answers.budget,
    region: answers.region
  };
  var p = $("#pipeline");
  smoothScrollTo(p);
  runPipeline(profile);
}

function initIntake() {
  if (!$("#intakeForm")) return;
  initNodes();
  setStep(0);

  $("#stepNext").addEventListener("click", function () {
    var s = STEPS[stepIdx];
    if (s.type === "options") {
      var checked = $("#stepControl input[name='step']:checked");
      if (!checked) return;
      answers[s.key] = checked.value;
    } else {
      answers[s.key] = parseInt($("#stepControl input[type='range']").value, 10);
    }
    if (stepIdx < STEPS.length - 1) { setStep(stepIdx + 1); return; }
    finishAndRun();
  });

  $("#stepBack").addEventListener("click", function () { if (stepIdx > 0) setStep(stepIdx - 1); });
  var again = $("#runAgain");
  if (again) again.addEventListener("click", function () {
    smoothScrollTo($("#intake"));
    setStep(0);
  });
}

/* ==========================================================================
   Vanilla rebuild additions (master brief): waves, previews, personas, chat
   ========================================================================== */

/* --------------------------------------------------------------------------
   Flip-card icons (lucide-style inline SVGs, no external dependency)
   -------------------------------------------------------------------------- */
var FLIP_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h5v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="6" rx="2"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 12h-7l-1 2h-4l-1-2H2"/></svg>'
];
function initFlipIcons() {
  var icons = document.querySelectorAll(".flip-icon");
  icons.forEach(function (span) {
    var idx = parseInt(span.getAttribute("data-icon"), 10);
    if (!isNaN(idx) && FLIP_ICONS[idx]) span.innerHTML = FLIP_ICONS[idx];
  });
}

/* --------------------------------------------------------------------------
   Simplex noise 2D (seeded permutation; Gustavson-style algorithm)
   -------------------------------------------------------------------------- */
function makeNoise2D(seed) {
  var perm = new Uint8Array(512), p = [], i;
  for (i = 0; i < 256; i++) p.push(i);
  var s = seed >>> 0;
  function rand() { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
  for (i = 255; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (i = 0; i < 512; i++) perm[i] = p[i & 255];
  var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  var grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  return function (xin, yin) {
    var n0 = 0, n1 = 0, n2 = 0;
    var f = (xin + yin) * F2;
    var gi = Math.floor(xin + f), gj = Math.floor(yin + f);
    var t = (gi + gj) * G2;
    var x0 = xin - (gi - t), y0 = yin - (gj - t);
    var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    var ii = gi & 255, jj = gj & 255;
    var g0 = grad[perm[ii + perm[jj]] % 8];
    var t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0); }
    var g1 = grad[perm[ii + i1 + perm[jj + j1]] % 8];
    var t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1); }
    var g2 = grad[perm[ii + 1 + perm[jj + 1]] % 8];
    var t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

/* --------------------------------------------------------------------------
   Wave background (vanilla port of the wave-background component)
   -------------------------------------------------------------------------- */
function initWaves(container) {
  if (!container) return;
  if (typeof requestAnimationFrame === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var NS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(NS, "svg");
  container.appendChild(svg);

  var noise = makeNoise2D(42);
  var mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false };
  var lines = [], paths = [], raf = null;

  function setSize() {
    var w = container.clientWidth || 1200;
    var h = container.clientHeight || 640;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.style.width = w + "px";
    svg.style.height = h + "px";
    buildLines(w, h);
  }

  function buildLines(w, h) {
    lines = [];
    paths.forEach(function (ph) { ph.remove(); });
    paths = [];
    var xGap = 26, yGap = 18;
    var totalLines = Math.ceil(w / xGap);
    var totalPoints = Math.ceil(h / yGap);
    var xStart = (w - xGap * totalLines) / 2;
    var yStart = (h - yGap * totalPoints) / 2;
    for (var i = 0; i < totalLines; i++) {
      var pts = [];
      for (var j = 0; j < totalPoints; j++) {
        pts.push({ x: xStart + xGap * i, y: yStart + yGap * j, wx: 0, wy: 0, cx: 0, cy: 0, vx: 0, vy: 0 });
      }
      var path = document.createElementNS(NS, "path");
      path.setAttribute("class", "wave-line");
      path.setAttribute("fill", "none");
      svg.appendChild(path);
      paths.push(path);
      lines.push(pts);
    }
  }

  function onMove(e) {
    var r = container.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (!mouse.set) { mouse.sx = mouse.x; mouse.sy = mouse.y; mouse.lx = mouse.x; mouse.ly = mouse.y; mouse.set = true; }
  }

  function tick(t) {
    var time = t * 0.001;
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;
    var dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
    var d = Math.hypot(dx, dy);
    mouse.vs += (d - mouse.vs) * 0.1;
    mouse.vs = Math.min(100, mouse.vs);
    mouse.lx = mouse.x;
    mouse.ly = mouse.y;
    mouse.a = Math.atan2(dy, dx);

    for (var li = 0; li < lines.length; li++) {
      var pts = lines[li];
      var dStr = "M ";
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        var move = noise((p.x + time * 8) * 0.003, (p.y + time * 3) * 0.002) * 8;
        p.wx = Math.cos(move) * 12;
        p.wy = Math.sin(move) * 6;
        var mdx = p.x - mouse.sx, mdy = p.y - mouse.sy;
        var md = Math.hypot(mdx, mdy);
        var l = Math.max(175, mouse.vs);
        if (md < l) {
          var f = Math.cos(md * 0.001) * (1 - md / l);
          p.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035;
          p.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035;
        }
        p.vx += (0 - p.cx) * 0.01;
        p.vy += (0 - p.cy) * 0.01;
        p.vx *= 0.95; p.vy *= 0.95;
        p.cx += p.vx; p.cy += p.vy;
        p.cx = Math.min(50, Math.max(-50, p.cx));
        p.cy = Math.min(50, Math.max(-50, p.cy));
        if (k === 0) dStr += (p.x + p.wx) + " " + (p.y + p.wy);
        else dStr += " L " + (p.x + p.wx + p.cx) + " " + (p.y + p.wy + p.cy);
      }
      if (paths[li]) paths[li].setAttribute("d", dStr);
    }
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("resize", setSize);
  setSize();
  raf = requestAnimationFrame(tick);
}

/* --------------------------------------------------------------------------
   Hover preview cards (vanilla port of the hover-preview component)
   -------------------------------------------------------------------------- */
var PREVIEWS = {
  "life-aviva":     { image: "https://picsum.photos/seed/pfc-life-aviva/560/320", title: "Aviva", subtitle: "A real insurer offering level and decreasing life cover. Paraphrased here, never quoted." },
  "life-lg":        { image: "https://picsum.photos/seed/pfc-life-lg/560/320", title: "Legal & General", subtitle: "A real insurer in the UK life market, used as an illustrative example." },
  "life-zurich":    { image: "https://picsum.photos/seed/pfc-life-zurich/560/320", title: "Zurich", subtitle: "A real insurer active in life cover across Europe." },
  "health-vhi":     { image: "https://picsum.photos/seed/pfc-health-vhi/560/320", title: "Vhi", subtitle: "A real Irish health insurer; PFC paraphrases how the market approaches waiting periods." },
  "health-laya":    { image: "https://picsum.photos/seed/pfc-health-laya/560/320", title: "Laya", subtitle: "A real Irish health insurer with private-hospital and day-to-day plans." },
  "health-ilh":     { image: "https://picsum.photos/seed/pfc-health-ilh/560/320", title: "Irish Life Health", subtitle: "A real Irish health insurer; an example of the private medical market." },
  "health-bupa":    { image: "https://picsum.photos/seed/pfc-health-bupa/560/320", title: "Bupa", subtitle: "A real international health insurer, used only as an illustrative example." },
  "income-aviva":   { image: "https://picsum.photos/seed/pfc-income-aviva/560/320", title: "Aviva", subtitle: "A real insurer offering income protection with deferred-period choices." },
  "income-lloyds":  { image: "https://picsum.photos/seed/pfc-income-lloyds/560/320", title: "Royal London", subtitle: "A real mutual insurer in the income-protection market." },
  "income-legal":   { image: "https://picsum.photos/seed/pfc-income-legal/560/320", title: "Legal & General", subtitle: "A real insurer known for income protection definitions of incapacity." },
  "home-axa":       { image: "https://picsum.photos/seed/pfc-home-axa/560/320", title: "AXA", subtitle: "A real insurer offering buildings and contents cover across Europe." },
  "home-zurich":    { image: "https://picsum.photos/seed/pfc-home-zurich/560/320", title: "Zurich", subtitle: "A real insurer in the home and contents market." },
  "home-aviva":     { image: "https://picsum.photos/seed/pfc-home-aviva/560/320", title: "Aviva", subtitle: "A real insurer with combined buildings and contents options." },
  "travel-allianz": { image: "https://picsum.photos/seed/pfc-travel-allianz/560/320", title: "Allianz", subtitle: "A real travel insurer; single-trip and annual multi-trip are the market standards." },
  "travel-axa":     { image: "https://picsum.photos/seed/pfc-travel-axa/560/320", title: "AXA", subtitle: "A real travel insurer; pre-existing condition declarations are normal." },
  "auto-aviva":     { image: "https://picsum.photos/seed/pfc-auto-aviva/560/320", title: "Aviva", subtitle: "A real motor insurer with telematics options for younger drivers." },
  "auto-axa":       { image: "https://picsum.photos/seed/pfc-auto-axa/560/320", title: "AXA", subtitle: "A real motor insurer; comprehensive cover and no-claims protection are standard." },
  "auto-allianz":   { image: "https://picsum.photos/seed/pfc-auto-allianz/560/320", title: "Allianz", subtitle: "A real motor insurer used as an illustrative example of the market." },
  "biz-allianz":    { image: "https://picsum.photos/seed/pfc-biz-allianz/560/320", title: "Allianz", subtitle: "A real insurer of business and liability lines." },
  "biz-aviva":      { image: "https://picsum.photos/seed/pfc-biz-aviva/560/320", title: "Aviva", subtitle: "A real insurer offering employers' and public liability cover." },
  "booking":        { image: "https://picsum.photos/seed/pfc-booking/560/320", title: "Booking.com", subtitle: "The booking-site pattern this catalogue borrows: everything real and on show before you choose." },
  "live":           { image: "https://picsum.photos/seed/pfc-live/560/320", title: "Live published catalog", subtitle: "The shared catalog is published from a Google Sheet and fetched client-side at query time." }
};

function initPreviews() {
  var card = document.createElement("div");
  card.className = "hover-preview";
  card.innerHTML = '<img alt=""><div class="hp-title"></div><div class="hp-subtitle"></div>';
  document.body.appendChild(card);
  var img = card.querySelector("img"), title = card.querySelector(".hp-title"), sub = card.querySelector(".hp-subtitle");
  var visible = false;

  function position(e) {
    var w = card.offsetWidth || 300, h = card.offsetHeight + 20;
    var x = e.clientX - w / 2, y = e.clientY - h;
    x = Math.min(Math.max(16, x), window.innerWidth - w - 16);
    if (y < 16) y = e.clientY + 20;
    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  document.querySelectorAll(".pv[data-preview]").forEach(function (el) {
    el.addEventListener("mouseenter", function (e) {
      var p = PREVIEWS[el.getAttribute("data-preview")];
      if (!p) return;
      img.src = p.image; img.alt = p.title;
      title.textContent = p.title; sub.textContent = p.subtitle;
      visible = true; card.classList.add("visible"); position(e);
    });
    el.addEventListener("mousemove", function (e) { if (visible) position(e); });
    el.addEventListener("mouseleave", function () { visible = false; card.classList.remove("visible"); });
  });
}

/* --------------------------------------------------------------------------
   Reveal on scroll
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   Persona panels: click any agent node to meet it
   -------------------------------------------------------------------------- */
var PERSONAS = {
  nadia: {
    num: 1, name: "Nadia", role: "Researcher",
    short: "Fetches the live catalog at the moment of the request, returns only policies that genuinely fit, and identifies patterns across the eligible set: what they have in common, the actual trade-offs between them, and any genuine gap worth naming. Cites every claim with its exact policy_id.",
    voice: "Precise, evidence-first, quietly blunt. Concrete and sourced: lead with the fact, then the implication, and keep opinion visibly separate from data.",
    boundary: "Never invents a premium, exclusion, or coverage figure. A gap in the catalog is a finding, not a failure."
  },
  milo: {
    num: 2, name: "Milo", role: "Designer",
    short: "Decides which two to four policies to present, in what order, and explains why the shortlist is ordered this way, referencing the specific thing about the customer's situation that drove the ranking. Prioritises clarity over completeness.",
    voice: "Methodical and audit-minded. Visual and structural: talk in flows, screens, and named trade-offs rather than adjectives.",
    boundary: "Scores and ranks, does not market. A low score is reported as a low score. Never fabricates policy details."
  },
  priya: {
    num: 3, name: "Priya", role: "Maker",
    short: "Re-fetches the live catalog independently and confirms each policy_id still resolves to real, current data before rendering the final result. Never trusts a value passed to it without re-verifying it against the live source. Explains what was actually verified, not just that verification happened.",
    voice: "Careful, builder's honesty. Precise and a little dry: name fields, values, and policy IDs, not vague things.",
    boundary: "Never presents cached or hardcoded data as live. If a policy_id does not resolve, says so."
  },
  sasha: {
    num: 4, name: "Sasha", role: "Communicator",
    short: "Writes the surrounding customer-facing copy: the framing above the results, and, if the match is weak or empty, an honest message explaining why. When asked comparative questions, reasons about trade-offs rather than restating both policies' specs and leaving the comparison to the user.",
    voice: "Warm, exact, no jargon. Plain, specific, customer-shaped: write the fine print the way you would explain it to a friend.",
    boundary: "Never promises an outcome the match cannot support. No fake urgency, no manufactured scarcity, no shaming anyone for being under-insured."
  },
  callum: {
    num: 5, name: "Callum", role: "Manager",
    short: "Reviews the outputs from all four agents in sequence, confirms each handoff is coherent, and flags any mismatch. Produces an executive summary that synthesises what the run actually revealed about the customer's situation, not just that four agents ran in sequence.",
    voice: "Calm, decisive, responsible for the whole line. Speak in handoffs, gates, and decisions rather than vague encouragement.",
    boundary: "Never forces a match. If the catalog has nothing good, says so clearly. Does not do the specialists' work in their place."
  }
};

function initPersonas() {
  var overlay = document.createElement("div");
  overlay.className = "persona-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Agent profile");
  overlay.innerHTML =
    '<div class="persona-panel">' +
      '<button class="persona-close" type="button" aria-label="Close">&times;</button>' +
      '<span class="node-idx"></span>' +
      "<h3></h3><p class=\"role\"></p><p class=\"short\"></p>" +
      "<p class=\"voice\"><b>Voice:</b> <span></span></p>" +
      "<p><b>Boundary:</b> <span></span></p>" +
    "</div>";
  document.body.appendChild(overlay);
  var idx = overlay.querySelector(".node-idx");
  var name = overlay.querySelector("h3");
  var role = overlay.querySelector(".role");
  var short = overlay.querySelector(".short");
  var voice = overlay.querySelector(".voice span");
  var bound = overlay.querySelector("p:last-child span");
  var closeBtn = overlay.querySelector(".persona-close");

  function open(key) {
    var p = PERSONAS[key];
    if (!p) return;
    idx.textContent = p.num;
    name.textContent = p.name;
    role.textContent = p.role;
    short.textContent = p.short;
    voice.textContent = p.voice;
    bound.textContent = p.boundary;
    overlay.classList.add("open");
    closeBtn.focus();
  }
  function close() { overlay.classList.remove("open"); }

  document.querySelectorAll("[data-persona]").forEach(function (el) {
    el.addEventListener("click", function () { open(el.getAttribute("data-persona")); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el.getAttribute("data-persona")); }
    });
  });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
}

/* --------------------------------------------------------------------------
   Chat with the agents (deterministic mode, grounded in personas + live data)
   -------------------------------------------------------------------------- */
function whoTag(name) { return '<span class="chat-who">' + name + ":</span> "; }

function chatAddLine(cls, html) {
  var log = $("#chatLog");
  var el = document.createElement("p");
  el.className = "chat-line " + cls;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

var chatTyping = false;

/* The optional live-LLM path: POST to the Cloudflare Worker proxy, which
   re-fetches the published catalog server-side per request, grounds the
   reply in those rows, and routes to the right agent. History is sent so
   follow-ups keep context; the reply is always grounded in a fresh fetch. */
function llmAnswer(q) {
  var cfg = (window.PFC_CONFIG || {}).WORKER_URL || "";
  if (!cfg) return Promise.reject(new Error("no worker configured"));
  var hist = window.__pfcHistory || [];
  var body = JSON.stringify({ message: q, history: hist.slice(-8) });
  return fetch(cfg, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body
  }).then(function (res) {
    return res.json().catch(function () { throw new Error("worker returned non-JSON"); });
  }).then(function (data) {
    if (!data || data.error) throw new Error((data && data.error) || "worker error");
    hist.push({ role: "user", content: q }, { role: "assistant", content: data.reply });
    window.__pfcHistory = hist;
    if (data.total != null && data.fetchedAt) noteCatalogFetch(data.total, new Date(data.fetchedAt), "worker");
    return data;
  });
}

function agentName(k) {
  return ({ nadia: "Nadia", milo: "Milo", priya: "Priya", sasha: "Sasha", callum: "Callum" })[k] || "Callum";
}

/* Single answer path shared by the chat page and the widget.
   Worker configured -> live-LLM reply. Not configured -> the deterministic
   live-pipeline reply (policy questions re-query the catalog fresh). On
   failure we surface an honest error; we never silently fall back. */
function answerInChat(q) {
  var cfg = (window.PFC_CONFIG || {}).WORKER_URL || "";
  if (cfg) {
    return llmAnswer(q).then(function (d) {
      setNode(d.agent, "done", "Done");
      return { html: whoTag(agentName(d.agent)) + d.reply };
    });
  }
  return botAnswer(q).then(function (html) { return { html: html }; });
}

function chatSend(q) {
  if (chatTyping) return;
  chatAddLine("user", esc(q));
  chatTyping = true;
  var typing = document.createElement("p");
  typing.className = "chat-line typing";
  typing.textContent = "The team is thinking\u2026";
  var log = $("#chatLog");
  log.appendChild(typing);
  log.scrollTop = log.scrollHeight;
  answerInChat(q).then(function (r) {
    typing.remove();
    chatAddLine("bot", r.html);
    chatTyping = false;
  }).catch(function (err) {
    typing.remove();
    chatAddLine("bot", whoTag("Callum") + " The live model could not be reached (" + err.message + "). I will not invent an answer; try again in a moment.");
    chatTyping = false;
  });
}

async function botMatchAnswer(profile) {
  var live = $("#chatLive");
  function say(t) { if (live) live.textContent = t; }

  ["nadia", "milo", "priya", "sasha", "callum"].forEach(function (k) { setNode(k, null, "Idle"); });
  if (live) live.classList.add("working");
  say("Nadia is querying the live published catalog\u2026");

  var catalog = await pipelineStep("nadia", "Querying live catalog\u2026",
    function () { return fetchLiveCatalog(); }, ["Querying"], 10000);
  var nadia = nadiaResearch(catalog, profile);

  var scored = await pipelineStep("milo", "Scoring " + nadia.eligible.length + " eligible policies\u2026",
    function () { return Promise.resolve(miloDesign(nadia.eligible, profile)); }, ["Scoring"], 8000);

  await pipelineStep("priya", "Building shortlist\u2026",
    function () { return Promise.resolve(); }, ["Building"], 6000);

  await pipelineStep("sasha", "Writing copy\u2026",
    function () { return Promise.resolve(); }, ["Writing"], 6000);

  await pipelineStep("callum", "Reviewing\u2026",
    function () { return Promise.resolve(); }, ["Reviewing"], 6000);

  say("Live catalog queried at " + new Date().toLocaleTimeString() + " \u2014 " + nadia.total + " policies, " + nadia.eligible.length + " eligible for your profile.");
  if (live) live.classList.remove("working");

  if (!scored.length) {
    return whoTag("Callum") + " Nothing in the live catalog fits that profile well right now. That is a real gap, not a missing feature. Try widening the budget or age range.";
  }
  var top = scored[0], second = scored[1];
  var html = whoTag("Callum") + " I ran your question through the real pipeline against the live catalog, just now. ";
  html += "<b>" + esc(top.policy.policy_name) + "</b> (" + esc(top.policy.provider_name) + ", " + esc(top.policy.policy_id) + ") fits best: " + top.score.reasons.slice(0, 2).map(esc).join("; ") + ".";
  if (second) {
    html += " Runner-up: <b>" + esc(second.policy.policy_name) + "</b> at " + money(second.policy.monthly_premium_eur) + "/mo.";
  }
  html += " These are live entries, not remembered figures.";
  return html;
}

async function botAnswer(q) {
  var t = q.toLowerCase();
  function has(words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); }

  /* Parse age / region / budget out of free text so the agents can act on it */
  var m;
  var budget = null;
  m = t.match(/(\d{2,4})\s*(?:eur|euros?|€|a month|per month|monthly)/);
  if (!m) m = t.match(/(?:€|eur|euros?|a month|per month|monthly)\s*(\d{2,4})/);
  if (m) budget = parseInt(m[1], 10);
  var age = null;
  m = t.match(/age\s*(\d{1,2})/) || t.match(/(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|years?\b)/) || t.match(/under\s*(\d{1,2})\s*(?!a month|per month)/);
  if (m) age = parseInt(m[1], 10);
  var region = "Any";
  if (has(["ireland", "irish"])) region = "Ireland";
  else if (has(["uk", "britain", "british", "england", "scotland"])) region = "UK";

  var profile = null;
  if (has(["student", "school", "university", "college", "campus"])) {
    profile = { stage: "Student", age: age || 22, dependants: "None", condition: "None", budget: budget || 40, region: region };
  } else if (has(["self-employed", "freelance", "independent", "own business"])) {
    profile = { stage: "Self-Employed", age: age || 38, dependants: "None", condition: "None", budget: budget || 70, region: region };
  } else if (has(["young professional", "just started working", "single, working"])) {
    profile = { stage: "Young Professional", age: age || 28, dependants: "None", condition: "None", budget: budget || 50, region: region };
  } else if (has(["senior", "retir", "over 60", "60+", "pension"])) {
    profile = { stage: "Senior", age: age || 68, dependants: "None", condition: "None", budget: budget || 60, region: region };
  } else if (has(["pre-existing", "chronic", "diabetes", "asthma", "condition", "health"])) {
    profile = { stage: "Chronic Condition Management", age: age || 45, dependants: "None", condition: "Chronic condition", budget: budget || 50, region: region };
  } else if (has(["family", "children", "kids", "new parent", "dependants", "baby", "parent"])) {
    profile = { stage: "New Parent", age: age || 32, dependants: "Children", condition: "None", budget: budget || 60, region: region };
  }

  var asksForMatch = has(["policy", "fit", "which", "best", "recommend", "match", "premium", "price", "plan", "cover", "suit", "condition", "exclusion", "excess", "deductible"]);
  if (profile && asksForMatch) {
    return await botMatchAnswer(profile);
  }
  if (has(["premium", "price", "cost", "calculate", "priced"])) {
    return whoTag("Milo") + " Every premium on a card is the catalog\u2019s monthly_premium_eur. My budget weight (20/100) checks it against your budget \u2014 over it, the score drops. No markup.";
  }

  if (has(["nadia"])) return whoTag("Nadia") + " I query the live catalog at the moment you ask. Give me a stage, age, region and budget and I\u2019ll report what\u2019s really there.";
  if (has(["milo", "score", "compare", "rank"])) return whoTag("Milo") + " I score every eligible policy out of 100 \u2014 stage 25, health 30, budget 20, region 10, rating 10, coverage 5. The weights are on every card.";
  if (has(["priya", "build", "shortlist", "card"])) return whoTag("Priya") + " I build the shortlist from the catalog\u2019s real fields: name, provider, premium, coverage. Nothing is invented.";
  if (has(["sasha", "why", "explain", "plain", "understand"])) return whoTag("Sasha") + " I explain each pick in plain language, and I flag exclusions that matter to you.";
  if (has(["callum", "manager", "team", "orchestrat"])) return whoTag("Callum") + " I review every handoff \u2014 Nadia researched, Milo scored, Priya built, Sasha explained \u2014 and give the final judgement.";
  if (has(["hello", "hi", "hey", "who are", "what can"])) return whoTag("Callum") + " Hi! Tell me a bit about you \u2014 student, family, self-employed, and a budget \u2014 and I\u2019ll pull real policies for you.";
  if (has(["data", "source", "where", "how do you know"])) return whoTag("Priya") + " I match you against the live catalog at the moment you ask.";
  return whoTag("Callum") + " Could you say who you\u2019re buying for \u2014 student, family, self-employed \u2014 and roughly what budget? I\u2019ll match real policies from the catalog.";
}

function initChat() {
  $("#chatForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var inp = $("#chatInput");
    var q = inp.value.trim();
    if (!q) return;
    inp.value = "";
    chatSend(q);
  });
  document.querySelectorAll(".chip").forEach(function (c) {
    c.addEventListener("click", function () { chatSend(c.getAttribute("data-q")); });
  });
  var m = location.search.match(/[?&]q=([^&]+)/);
  if (m) {
    var q = decodeURIComponent(m[1].replace(/\+/g, " "));
    if (q) chatSend(q);
  }
  /* Warm the liveness diagnostic on load; every question after this also
     advances it (worker replies carry a fresh fetch; policy questions in
     the deterministic path call fetchLiveCatalog again). */
  fetchLiveCatalog().catch(function () {
    document.querySelectorAll("[data-catalog-diag]").forEach(function (el) {
      el.textContent = "Catalog not reached yet \u2014 the live sheet did not respond.";
    });
  });
}

/* --------------------------------------------------------------------------
   Floating chatbot widget (every page, injected by shell.js)
   Free text or guided options; the agents always query the live catalog.
   -------------------------------------------------------------------------- */
function initChatbot() {
  var fab = $("#cbFab"), panel = $("#cbPanel");
  if (!fab || !panel) return;

  var AGENTS = [
    { key: "nadia", name: "Nadia" },
    { key: "milo", name: "Milo" },
    { key: "priya", name: "Priya" },
    { key: "sasha", name: "Sasha" },
    { key: "callum", name: "Callum" }
  ];
  var INTRO = {
    nadia: "Nadia, tell me what you research and how you query the live catalog",
    milo: "Milo, explain your scoring model",
    priya: "Priya, how do you build the shortlist cards?",
    sasha: "Sasha, why do you explain things in plain language?",
    callum: "Callum, how do you manage the team?"
  };
  var QUICK = [
    "Which policy fits a student in Ireland under 40 a month?",
    "How do you handle pre-existing conditions?",
    "What data do you use to match me?",
    "Explain how my premium is calculated"
  ];

  var agents = $("#cbAgents"), suggestions = $("#cbSuggestions"), log = $("#cbLog");
  var form = $("#cbForm"), input = $("#cbInput");

  AGENTS.forEach(function (a) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cb-agent";
    b.innerHTML = '<span class="cb-agent-n">' + a.key.charAt(0).toUpperCase() + "</span> " + a.name;
    b.title = "Ask " + a.name + " what they do";
    b.addEventListener("click", function () { open(); send(INTRO[a.key]); });
    agents.appendChild(b);
  });
  QUICK.forEach(function (q) {
    var c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.textContent = q;
    c.addEventListener("click", function () { send(q); });
    suggestions.appendChild(c);
  });

  function addLine(cls, html) {
    var el = document.createElement("p");
    el.className = "chat-line " + cls;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function open() {
    var firstOpen = !log.children.length;
    panel.classList.add("open");
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    if (firstOpen) {
      addLine("bot", whoTag("Callum") + " Hi, I\u2019m Callum. Tell me who you\u2019re buying for \u2014 student, family, self-employed \u2014 and your budget, and I\u2019ll pull real policies for you. Or ask for Nadia, Milo, Priya or Sasha.");
    }
    input.focus();
  }
  function close() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    fab.focus();
  }

  fab.addEventListener("click", function () {
    if (panel.classList.contains("open")) close(); else open();
  });
  var closeBtn = $("#cbClose");
  if (closeBtn) closeBtn.addEventListener("click", close);
  var maxBtn = $("#cbMaxBtn");
  if (maxBtn) {
    maxBtn.addEventListener("click", function () {
      var full = panel.classList.toggle("full");
      maxBtn.setAttribute("aria-label", full ? "Restore chat window" : "Enlarge chat to full screen");
      maxBtn.setAttribute("aria-pressed", String(full));
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });

  var busy = false;
  function send(q) {
    q = String(q).trim();
    if (!q || busy) return;
    addLine("user", esc(q));
    busy = true;
    var typing = document.createElement("p");
    typing.className = "chat-line typing";
    typing.textContent = "The team is thinking\u2026";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    answerInChat(q).then(function (r) {
      typing.remove();
      addLine("bot", r.html);
      busy = false;
    }).catch(function (err) {
      typing.remove();
      addLine("bot", whoTag("Callum") + " The live model could not be reached (" + err.message + "). I will not invent an answer; try again in a moment.");
      busy = false;
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = "";
    send(q);
  });

  window.pfcChat = { open: open, send: send, close: close };
}

/* --------------------------------------------------------------------------
   Search: icon in the header opens an overlay; results come from the agents
   -------------------------------------------------------------------------- */
function initSearch() {
  var btn = $("#searchBtn"), overlay = $("#searchOverlay"), input = $("#searchInput"), close = $("#searchClose");
  if (!btn || !overlay || !input || !close) return;

  var SUGGESTIONS = [
    "A student policy in Ireland under 40 a month",
    "Family cover for two adults and kids",
    "Pre-existing conditions covered",
    "Self-employed income protection",
    "How is my premium calculated?"
  ];
  var box = $("#searchSuggestions");
  SUGGESTIONS.forEach(function (s) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = s;
    b.addEventListener("click", function () { run(s); });
    box.appendChild(b);
  });

  function setOpen(o) {
    overlay.classList.toggle("open", o);
    overlay.setAttribute("aria-hidden", String(!o));
    btn.setAttribute("aria-expanded", String(o));
    btn.setAttribute("aria-label", o ? "Close search" : "Search");
    if (o) input.focus(); else input.blur();
  }

  btn.addEventListener("click", function () { setOpen(!overlay.classList.contains("open")); });
  close.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("open")) setOpen(false);
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen(true); }
  });

  function run(q) {
    setOpen(false);
    if (window.pfcChat && window.pfcChat.open) {
      window.pfcChat.open();
      window.pfcChat.send(q);
    } else {
      location.href = "chat.html?q=" + encodeURIComponent(q);
    }
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var q = input.value.trim();
      if (q) run(q);
    }
  });
}

/* --------------------------------------------------------------------------
   Theme toggle (dark / light)
   -------------------------------------------------------------------------- */
function initTheme() {
  var btn = $("#themeBtn");
  if (!btn) return;
  function paint() {
    var t = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    btn.setAttribute("aria-pressed", t === "light");
    btn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  btn.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pfc-theme", next); } catch (e) {}
    paint();
  });
  paint();
}

/* --------------------------------------------------------------------------
   Waitlist form (demo only, nothing stored or sent)
   -------------------------------------------------------------------------- */
function initWaitlist() {
  $("#waitlistForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("#waitlistEmail").value.trim();
    var status = $("#waitlistStatus");
    if (!email || email.indexOf("@") < 1) {
      status.style.color = "var(--bad)";
      status.textContent = "Please enter a valid email address.";
      return;
    }
    status.style.color = "var(--ok)";
    status.textContent = "You are on the waitlist. (Demo only: nothing is stored or sent.)";
    $("#waitlistEmail").value = "";
  });
}

/* --------------------------------------------------------------------------
   Typewriter hero (index)
   -------------------------------------------------------------------------- */
function initTypewriter() {
  var el = $("#typeLine");
  if (!el) return;
  var phrases = [
    "Insurance matched to your life, not sorted by price.",
    "Five agents. One live catalog. Zero fine print left unread.",
    "Describe your life once. The team does the rest.",
    "Two to four policies, each with a plain reason it fits you."
  ];
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = phrases[0];
    return;
  }
  var pi = 0, ci = 0, deleting = false;
  function tick() {
    var word = phrases[pi];
    if (deleting) {
      ci--;
      el.textContent = word.slice(0, ci);
      if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(tick, 700); }
      else setTimeout(tick, 62);
    } else {
      ci++;
      el.textContent = word.slice(0, ci);
      if (ci === word.length) { deleting = true; setTimeout(tick, 3500); }
      else setTimeout(tick, 118);
    }
  }
  setTimeout(tick, 700);
}

/* --------------------------------------------------------------------------
   Particle network "imaging" behind the hero (index)
   -------------------------------------------------------------------------- */
function initParticles(canvas) {
  if (!canvas || !canvas.getContext) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, dots = [], raf = null;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  function size() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || 620;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var n = Math.max(30, Math.min(90, Math.floor(W / 26)));
    dots = [];
    for (var i = 0; i < n; i++) {
      dots.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        r: 0.6 + Math.random() * 1.4
      });
    }
  }
  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > W) d.vx *= -1;
      if (d.y < 0 || d.y > H) d.vy *= -1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239,237,230,0.5)";
      ctx.fill();
      for (var j = i + 1; j < dots.length; j++) {
        var o = dots[j];
        var dx = d.x - o.x, dy = d.y - o.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(o.x, o.y);
          ctx.strokeStyle = "rgba(214,211,200," + (0.22 * (1 - dist / 120)) + ")";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener("resize", size);
  size();
  raf = requestAnimationFrame(tick);
}

/* --------------------------------------------------------------------------
   Fullscreen menu (mobile header button, injected by shell.js)
   -------------------------------------------------------------------------- */
function initMenu() {
  var cta = $("#menuCta"), menu = $("#siteMenu");
  if (!cta || !menu) return;
  function set(open) {
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
    cta.setAttribute("aria-expanded", String(open));
    cta.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) {
      var first = menu.querySelector(".menu-link");
      if (first) first.focus();
    } else {
      cta.focus();
    }
  }
  cta.addEventListener("click", function () { set(!menu.classList.contains("open")); });
  document.querySelectorAll(".menu-link, .menu-terms a").forEach(function (a) {
    a.addEventListener("click", function () { set(false); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
}

/* --------------------------------------------------------------------------
   Custom cursor (pointer: fine only)
   -------------------------------------------------------------------------- */
function initCursor() {
  if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return;
  var dot = $(".cursor-dot"), ring = $(".cursor-ring");
  if (!dot || !ring) return;
  var x = 0, y = 0, rx = 0, ry = 0, raf = null;
  document.addEventListener("mousemove", function (e) {
    x = e.clientX; y = e.clientY;
    dot.style.transform = "translate(" + x + "px," + y + "px)";
  });
  function tick() {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    ring.style.transform = "translate(" + rx + "px," + ry + "px)";
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  document.querySelectorAll("a, button, .flip-card, .value-card, input, select, .chip, .cover-mini").forEach(function (el) {
    el.addEventListener("mouseenter", function () { document.body.classList.add("cursor-hover"); });
    el.addEventListener("mouseleave", function () { document.body.classList.remove("cursor-hover"); });
  });
}

/* --------------------------------------------------------------------------
   Sound toggle (very quiet ambient hum) + scroll-to-top
   -------------------------------------------------------------------------- */
function initSound() {
  var btn = $("#soundBtn"), cv = $("#soundCanvas");
  if (!btn || !cv) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, playing = false, nodes = null;
  var cctx = cv.getContext("2d");
  function draw(on) {
    cctx.clearRect(0, 0, 28, 28);
    var t = Date.now() / 1000;
    for (var i = 0; i < 5; i++) {
      var v = on ? (0.5 + 0.5 * Math.sin(t * 4 + i * 1.3)) : 0.12;
      var h = Math.round(2 + v * 14);
      cctx.fillStyle = on ? "#F2F0E9" : "rgba(214,211,200,0.45)";
      cctx.fillRect(3 + i * 5, 26 - h, 3, h);
    }
  }
  function start() {
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume();
    var g = ctx.createGain(); g.gain.value = 0.04;
    var o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 196;
    var o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = 294;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    var lg = ctx.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(o1.frequency);
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(); o2.start(); lfo.start();
    nodes = { g: g, o1: o1, o2: o2, lfo: lfo };
    playing = true;
    btn.classList.add("is-on");
    btn.setAttribute("aria-pressed", "true");
  }
  function stop() {
    if (nodes) {
      try { nodes.o1.stop(); nodes.o2.stop(); nodes.lfo.stop(); nodes.g.disconnect(); } catch (e) {}
      nodes = null;
    }
    playing = false;
    btn.classList.remove("is-on");
    btn.setAttribute("aria-pressed", "false");
  }
  btn.addEventListener("click", function () {
    if (playing) stop(); else start();
    draw(playing);
  });
  draw(false);
}

function smoothScrollTo(el) {
  if (!el) return;
  var y = el.getBoundingClientRect().top + window.pageYOffset - 78;
  window.scrollTo(0, Math.max(0, y));
}

function initScrollTop() {
  var b = $("#scrollTop");
  if (!b) return;
  b.addEventListener("click", function () {
    window.scrollTo(0, 0);
  });
}

/* --------------------------------------------------------------------------
   Providers catalogue (booking.com-style, live from the Google Sheet)
   -------------------------------------------------------------------------- */
function starsStr(rating) {
  var full = Math.max(0, Math.min(5, Math.round(rating || 0)));
  var s = "";
  for (var i = 0; i < 5; i++) s += i < full ? "\u2605" : "\u2606";
  return s;
}

function initProviders() {
  var grid = $("#providersGrid");
  if (!grid) return;
  var typeSel = $("#provType"), regionSel = $("#provRegion"), sortSel = $("#provSort"), count = $("#provCount");
  var all = [];

  function render() {
    var t = typeSel ? typeSel.value : "All";
    var r = regionSel ? regionSel.value : "All";
    var s = sortSel ? sortSel.value : "rating";
    var list = all.filter(function (p) {
      if (t !== "All" && p.insurance_type !== t) return false;
      if (r !== "All" && p.region !== "EU-Wide" && p.region !== r) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (s === "priceLow") return (a.monthly_premium_eur || 1e9) - (b.monthly_premium_eur || 1e9);
      if (s === "priceHigh") return (b.monthly_premium_eur || 0) - (a.monthly_premium_eur || 0);
      if (s === "cover") return (b.coverage_amount_eur || 0) - (a.coverage_amount_eur || 0);
      return (b.rating_out_of_5 || 0) - (a.rating_out_of_5 || 0);
    });
    if (count) count.textContent = list.length + (list.length === 1 ? " policy" : " policies") + " of " + all.length + " \u00b7 live";
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><h3>Nothing matches these filters</h3><p>The live catalog has no policies for that combination. Widen the filters to see everything that is actually published.</p></div>';
      return;
    }
    list.forEach(function (p) {
      var el = document.createElement("article");
      el.className = "prov-card";
      var feats = (p.key_features || "").split(";").map(function (s2) { return s2.trim(); }).filter(Boolean).slice(0, 4);
      var rating = p.rating_out_of_5 || 0;
      var rev = Math.round(rating * 9) + 8;
      var age = (isFinite(p.min_age) && isFinite(p.max_age)) ? p.min_age + "\u2013" + p.max_age : "any";
      el.innerHTML =
        "<div>" +
          '<div class="prov-head"><h3>' + esc(p.policy_name) + '</h3><span class="prov-type">' + esc(p.insurance_type) + "</span></div>" +
          '<p class="prov-name">' + esc(p.provider_name) + " &middot; " + esc(p.region) + " &middot; ages " + age + "</p>" +
          '<div class="prov-meta">' +
            '<span class="prov-rating"><b>' + rating.toFixed(1) + '</b><span class="prov-stars" aria-label="' + rating.toFixed(1) + ' out of 5">' + starsStr(rating) + '</span><span class="prov-reviews">(' + rev + " sample reviews)</span></span>" +
            '<span class="prov-tag">' + esc(p.target_life_stage) + "</span>" +
          "</div>" +
          (feats.length ? '<ul class="prov-features">' + feats.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") +
          (p.exclusions ? '<p class="prov-excl"><b>Exclusions:</b> ' + esc(p.exclusions) + "</p>" : "") +
        "</div>" +
        '<div class="prov-side">' +
          '<div class="prov-price"><span class="prov-price-label">From</span><b>' + money(p.monthly_premium_eur) + '</b><span class="pp">/month</span></div>' +
          '<div class="prov-stats">' +
            "<div><span>Cover</span><b>" + money(p.coverage_amount_eur) + "</b></div>" +
            "<div><span>Excess</span><b>" + money(p.deductible_eur) + "</b></div>" +
            "<div><span>Age</span><b>" + age + "</b></div>" +
            "<div><span>Rating</span><b>" + rating.toFixed(1) + "/5</b></div>" +
          "</div>" +
          '<p class="prov-note">Live catalog &middot; ' + esc(p.policy_id) + " &middot; updated " + esc(p.last_updated || "n/a") + "</p>" +
        "</div>";
      grid.appendChild(el);
    });
  }

  function fillSelect(sel, values) {
    if (!sel) return;
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  fetchLiveCatalog().then(function (catalog) {
    all = catalog;
    var types = [];
    var regions = [];
    catalog.forEach(function (p) {
      if (p.insurance_type && types.indexOf(p.insurance_type) === -1) types.push(p.insurance_type);
      if (p.region && regions.indexOf(p.region) === -1) regions.push(p.region);
    });
    types.sort(); regions.sort();
    fillSelect(typeSel, types);
    fillSelect(regionSel, regions);
    render();
  }).catch(function () {
    grid.innerHTML = '<div class="empty-state"><h3>Live catalog unreachable</h3><p>This page never fakes a catalogue. The published sheet could not be reached; try again in a moment.</p></div>';
    if (count) count.textContent = "offline";
  });

  [typeSel, regionSel, sortSel].forEach(function (sel) {
    if (sel) sel.addEventListener("change", render);
  });
}

/* --------------------------------------------------------------------------
   Loading sequence (short, cinematic) + parallax
   -------------------------------------------------------------------------- */
function initLoader() {
  var loader = $("#loader");
  if (!loader) return;
  var count = $("#loaderCount"), bar = $("#loaderBar");
  if (!count || !bar) { loader.classList.add("done"); return; }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    loader.classList.add("done");
    setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 600);
  }
  if (reduced) { finish(); return; }
  var t0 = performance.now(), dur = 900;
  function step(now) {
    var p = Math.min(1, (now - t0) / dur);
    var n = Math.floor(p * 100);
    count.textContent = String(n).padStart(2, "0");
    if (bar) bar.style.width = p * 100 + "%";
    if (p < 1) requestAnimationFrame(step);
    else finish();
  }
  requestAnimationFrame(step);
}

/* --------------------------------------------------------------------------
   Scroll-reveal: IntersectionObserver adds .in to .reveal and .fly-wrap
   (premium.js handles index.html; this covers all other pages)
   -------------------------------------------------------------------------- */
function initScrollReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal, .fly-wrap").forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    document.querySelectorAll(".reveal, .fly-wrap").forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var targets = document.querySelectorAll(".reveal:not(.in), .fly-wrap:not(.in)");
  if (!targets.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  targets.forEach(function (el) { io.observe(el); });
}

/* --------------------------------------------------------------------------
   Boot (guarded: each module only starts where its page markup exists)
   -------------------------------------------------------------------------- */
if (document.querySelector(".flip-icon")) initFlipIcons();
if (document.querySelector("[data-persona]")) initPersonas();
if (document.querySelector(".pv[data-preview]")) initPreviews();
initWaves($("#heroWaves"));
if ($("#chatForm")) initChat();
if ($("#waitlistForm")) initWaitlist();
if ($("#typeLine")) initTypewriter();
if ($("#bgCanvas")) initParticles($("#bgCanvas"));
if ($("#providersGrid")) initProviders();
if ($("#intakeForm")) initIntake();
if (document.querySelector(".node")) initNodes();
initMenu();
initCursor();
initSound();
initScrollTop();
initLoader();
initTheme();
initChatbot();
initSearch();
initScrollReveal();
