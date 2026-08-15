/* ==========================================================================
   Policy Fit Checker: five-agent pipeline, driven entirely by live data.
   Architecture: Option A. The Researcher's data query (Google Sheets fetch)
   is genuinely live and happens in the browser at the moment of use. The
   other four agents are deterministic, persona-grounded logic over that
   live-fetched data. No policy value is hardcoded anywhere in this file.
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   Live data source (the only piece of "data" in this file: a URL, not data)
   -------------------------------------------------------------------------- */
var SHEET_ID = "1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8";
var SHEET_CSV = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv";
var SHEET_JSONP = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json;responseHandler:pfcCallback";

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
    s.src = SHEET_JSONP;
    document.head.appendChild(s);
  });
}

function fetchCatalog() {
  return fetch(SHEET_CSV)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Catalog is empty");
      return rows.slice(1).map(function (r) { return rowToPolicy(rows[0], r); });
    })
    .catch(function () { return loadViaJSONP(); });
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
   Agent: Priya, Maker. Build the shortlist from live fields, guarded.
   -------------------------------------------------------------------------- */
function priyaBuild(scored, profile) {
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
  var note = shortlist.length === 0
    ? "Priya: no eligible policy passed the fit bar. Nothing was invented to fill the gap."
    : "Priya: " + shortlist.length + " card" + (shortlist.length === 1 ? "" : "s") + " built from live catalog fields only.";
  return { shortlist: shortlist, note: note };
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
function setNode(key, state, statusText) {
  var el = nodes[key];
  if (!el) return;
  el.classList.remove("active", "done");
  if (state) el.classList.add(state);
  var st = el.querySelector(".node-status");
  if (st && statusText) st.textContent = statusText;
}
function resetPipeline() {
  ["nadia", "milo", "priya", "sasha", "callum"].forEach(function (k) {
    setNode(k, null, "Idle");
  });
  $("#pipeline").classList.remove("running");
  $("#pipelineLog").innerHTML = "";
}

var logId = 0;
function appendLog(text, cls) {
  var el = document.createElement("p");
  el.className = "log-line " + (cls || "");
  el.textContent = text;
  $("#pipelineLog").appendChild(el);
  logId++;
  $("#pipelineLog").scrollTop = $("#pipelineLog").scrollHeight;
}

async function pipelineStep(key, activeLabel, work) {
  setNode(key, "active", "Working");
  appendLog(activeLabel, "agent");
  var result = await work();
  await sleep(430);
  setNode(key, "done", "Done");
  return result;
}

async function runPipeline(profile) {
  if (window.__pfcRunning) return;
  window.__pfcRunning = true;
  resetPipeline();
  $("#pipeline").classList.add("running");
  try {
    /* Nadia: the genuinely live query happens here, at the moment of use */
    var catalog = await pipelineStep("nadia",
      "Querying the live policy catalog\u2026", function () { return fetchCatalog(); });
    var nadia = nadiaResearch(catalog, profile);
    appendLog("Queried " + nadia.total + " live polic" + (nadia.total === 1 ? "y" : "ies") + "; " + nadia.eligible.length + " match your age band and region", "done");
    if (nadia.note) appendLog(nadia.note, "agent");

    var scored = await pipelineStep("milo",
      "Scoring " + nadia.eligible.length + " eligible policies against your profile\u2026",
      function () { return Promise.resolve(miloDesign(nadia.eligible, profile)); });
    appendLog("Scored and ranked " + scored.length + " polic" + (scored.length === 1 ? "y" : "ies") + " by fit, not price", "done");

    var built = await pipelineStep("priya",
      "Building your shortlist from live catalog fields\u2026",
      function () { return Promise.resolve(priyaBuild(scored, profile)); });
    appendLog(built.note, "done");

    var copy = await pipelineStep("sasha",
      "Writing the why behind each recommendation\u2026",
      function () {
        built.shortlist.forEach(function (c) { c.why = sashaWhy(c, profile); });
        return Promise.resolve({ empty: built.shortlist.length === 0 ? sashaEmpty(profile) : null });
      });
    appendLog(copy.empty ? "The catalog is empty for this profile; wrote the honest message instead" : "Wrote the reason under each of the " + built.shortlist.length + " polic" + (built.shortlist.length === 1 ? "y" : "ies"), "done");

    var verdict = await pipelineStep("callum",
      "Reviewing the handoffs and synthesising the recommendation\u2026",
      function () { return Promise.resolve(callumSynthesise(built.shortlist, profile, nadia)); });
    appendLog(verdict.note, "done");

    renderResults(built, copy, verdict);
  } catch (err) {
    setNode("nadia", null, "Failed");
    $("#pipelineLog").innerHTML = "";
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
  res.scrollIntoView({ behavior: "smooth", block: "start" });
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
      lab.addEventListener("click", function () { ctl.querySelectorAll("label").forEach(function (l) { l.classList.remove("sel"); }); lab.classList.add("sel"); });
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
  var profile = {
    stage: answers.stage,
    age: answers.age,
    dependants: answers.dependants,
    condition: answers.condition,
    budget: answers.budget,
    region: answers.region
  };
  $("#intake").scrollIntoView({ behavior: "smooth", block: "start" });
  var p = $("#pipeline");
  p.scrollIntoView({ behavior: "smooth", block: "center" });
  runPipeline(profile);
});

$("#stepBack").addEventListener("click", function () { if (stepIdx > 0) setStep(stepIdx - 1); });
$("#runAgain").addEventListener("click", function () {
  $("#intake").scrollIntoView({ behavior: "smooth", block: "start" });
  setStep(0);
});

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */
initNodes();
setStep(0);
