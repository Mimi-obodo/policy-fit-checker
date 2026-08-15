# Policy Fit Checker — Prototype v1 (Run #1)

**File:** `prototype/pfc-app-v1.html` · single self-contained HTML file · no build step · no external JS/CSS deps · works from `file://`.

## What was built

Implements the full P0 list from `design/design-spec.md`, reusing `app.html`'s proven patterns (gviz JSONP loader → CSV fetch fallback, CSV parser, dark theme, age hard gate).

1. **Condition disclosure input** — hero-styled select in the sidebar (Diabetes/endocrine · Heart/cardiovascular · Cancer history · Asthma/COPD · Mental health · Mobility/arthritis · Other · None). Defaults to "None" to preserve old behaviour.
2. **Stance classifier** — one keyword-table function (`classifyStance`) scanning `suitability_tags` + `key_features` + `exclusions` → ✅ / ⚠️ / ❌ with a plain-English reason. Tuned to the live data:
   - "Undeclared pre-existing conditions excluded" (travel) → ✅ if policy names pre-existing cover, else ⚠️.
   - "Pre-existing conditions excluded for first 6 months" (health) → ⚠️ waiting period.
   - "Pre-existing conditions excluded" / "Conditions diagnosed pre-policy excluded" → ❌.
3. **100-point scoring** — life-stage 25 (exact / near-stage 60% / else 0) · condition 30 (✅ 30 / ⚠️ 18 / ❌ 4) · affordability 20 (budget ratio × deductible burden) · region 10 · rating 10 · coverage 5. Age stays a hard gate; budget is a soft gate — over-budget policies are kept and wear a red **"€X over your budget"** badge. Weights live in one commented `WEIGHTS` object.
4. **"Why this fits" panel** — `<details>` on every card: 6 component bars, each with score/max **and** a reason sentence, plus the verify-with-provider reminder and policy ID. No unexplained numbers.
5. **Choice-collapse banner** — appears when ≤6 eligible or ≤1 within budget: "Only N policies fit your life at age X", honest no-padding line, plus **[Widen budget to €Y]** (set to the next over-budget premium) and **[I'm not X yet — see age Z]** affordances.
6. **Thin-shelf / empty states** — reachable, e.g. Health at 72 = 0 matches; honest copy, "we won't fake a match", lower-age + show-all-types escape hatches, known-gap note.

**P1 (bonus):** top-2 exclusion previews with the condition-overlapping clause highlighted · plain-language glossary `<details>` · live context panel (weather/GDP/country) demoted below results, infra reused untouched.

**P2 (bonus, demo-ready):** Mairead / David / Priya persona buttons · in-session shortlist with "call provider, quote policy ID" · over-budget nearest-premium hint.

## How to run

- Double-click the file (works from `file://` — data loads via JSONP; CSV fetch is the HTTP fallback).
- Or serve: `python -m http.server 8000` → `http://localhost:8000/prototype/pfc-app-v1.html`.
- Try the persona buttons (Mairead/David/Priya) for instant demo narratives.

## Known limitations (honest)

- Free-text exclusions mean stances are **heuristics, not guarantees** — every card carries the verify-with-provider caveat.
- Condition keywords are tuned to this sheet; a new exclusion phrasing could mis-classify (M1 stance accuracy should be hand-checked on a sample).
- "Pet/Auto/Home pre-existing conditions excluded" refers to the pet/thing, not the user — the classifier still flags them ❌ (transparent, but noisy).
- Near-stage credit covers only the two spec pairs (Senior↔Chronic, New Parent↔Family).
- Shortlist is in-session only (no persistence across reloads).

## What Run #2 should fix

1. **Typed exclusions + condition fields in the sheet** (Researcher §7.5) — replaces keyword heuristics with deterministic stances; biggest accuracy lever.
2. **M1 stance-accuracy audit** — hand-check ✅/⚠️/❌ on a 15-policy sample; tune keyword tables.
3. **Scope-aware condition scoring** — only apply condition stance to person-insured types (Health/Life/CI/IP/Travel) to cut Pet/Auto noise.
4. **Shortlist persistence** (`localStorage`) + "Try Mairead's profile" already covered; add export/share note.
