# Policy Fit Checker (PFC)

A discovery platform, not a comparison site. Five named agents work like an advisory firm's pipeline. You answer six short questions; the agents hand your profile down the line and return a short, explained shortlist of insurance policies.

The key rule of the project: **every policy you see was pulled live from a Google Sheet at the moment you ran the pipeline. Nothing is hardcoded, cached, or faked.** If the live catalog cannot be reached, the pipeline says so honestly instead of inventing a match.

## The five agents

| # | Agent | Role |
|---|-------|------|
| 1 | Nadia (Researcher) | Runs the genuinely live query against the Google Sheets catalog, then checks your age band and region eligibility and reports gaps in the catalog honestly. |
| 2 | Milo (Designer) | Scores each eligible policy on a 100-point fit model and scans the fine print for health considerations (the stance classifier). |
| 3 | Priya (Maker) | Builds a shortlist of up to four policy cards straight from live catalog fields. Guard rails: no fabrication, never dresses up a weak match. |
| 4 | Sasha (Communicator) | Writes the plain-language reason under every recommendation, grounded in real numbers. |
| 5 | Callum (Manager) | Reviews the handoffs and synthesises a single recommendation with an honest runner-up note. |

Persona files for all five live in `agents/` and each agent's definition in `.opencode/agent/`.

## How to run

Two ways, both free and stateless:

### 1. Direct (double-click)

Open `index.html` in a browser. Live from the moment of use:

- The catalog is fetched from the live Google Sheet (CSV fetch with a JSONP fallback for `file://`).
- No server, no build step, no secrets.

> Note: some browsers restrict `file://` network calls. If the catalog fails to load on `file://`, use option 2 below.

### 2. Local server (recommended)

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Live URL

**https://mimi-obodo.github.io/policy-fit-checker/**

The site is fully static: the 8+ week visibility requirement is satisfied with zero maintenance. Push to `main` and the live site updates automatically.

## The live data source

- Google Sheet ID: `1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8` (shared "anyone with the link", export CSV enabled).
- Schema: `policy_id, provider_name, policy_name, insurance_type, target_life_stage, min_age, max_age, monthly_premium_eur, coverage_amount_eur, deductible_eur, key_features, exclusions, suitability_tags, region, rating_out_of_5, last_updated`.
- To point the site at your own sheet: open it to "anyone with the link", enable File &rarr; Share &rarr; Publish to web (CSV), copy the sheet ID, and set `SHEET_ID` in `app.js`.

## Scoring model (Milo's fit formula, max 100)

| Criterion | Weight | Notes |
|-----------|--------|-------|
| Life stage | 25 | Exact target match, else suitability-tag overlap, +5 for dependants |
| Health condition | 30 | Stance classifier result: ok 30, warn 18, bad 4, no condition 15 |
| Budget | 20 | Full marks under budget; proportionally reduced above it |
| Region | 10 | Any / EU-Wide match |
| Rating | 10 | Rating_out_of_5 scaled |
| Coverage | 5 | Coverage amount scaled to EUR 100k |

Policies outside your age band or region are filtered before scoring.

## Project structure

```
ceai_finale/
├── index.html                 # single-page site (pipeline, intake, results)
├── styles.css                 # design tokens and component styles
├── app.js                     # the five-agent pipeline, driven by live data
├── .env.example               # optional Option B (live LLM) template, no secrets
├── README.md
├── agents/                    # five persona files
├── research/research-brief.md # Run 1: Researcher output
├── design/design-spec.md      # Run 1: Designer output (score model, stance, copy)
├── prototype/pfc-app-v1.html  # Run 1: Maker's working prototype
├── marketing/                 # empty; Communicator's assignment output lives here
└── management/                # empty; Manager's assignment output lives here
```

## Optional: Option B (live LLM layer, stretch)

The submitted baseline is Option A: deterministic, persona-grounded logic over live-fetched data, so the site is fully static and secret-free. If you later want the agents to call a real language model, the wiring points are in `app.js` (each `pipelineStep` can `await` a fetch to a proxy). `.env.example` documents the variables; a serverless proxy is required because browsers cannot hold secrets.
