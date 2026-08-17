# Policy Fit Checker (PFC)

A discovery platform, not a comparison site. Five named agents work like an advisory firm's pipeline. You answer six short questions; the agents hand your profile down the line and return a short, explained shortlist of insurance policies.

The key rule of the project: **every policy you see was pulled live from the published Google Sheet at the moment you asked. Nothing is hardcoded, cached, or faked.** If the live catalog cannot be reached, the pipeline says so honestly instead of inventing a match. Both the match page and the chat page show a live diagnostic line, `Catalog fetched [time], [N] policies loaded`, which advances on every fetch so the live-ness is provable, not just claimed.

## The five agents

| # | Agent | Role |
|---|-------|------|
| 1 | Nadia (Researcher) | Runs the genuinely live query against the published catalog, then checks your age band and region eligibility and reports gaps in the catalog honestly. |
| 2 | Milo (Designer) | Scores each eligible policy on a 100-point fit model and scans the fine print for health considerations (the stance classifier). |
| 3 | Priya (Maker) | Builds a shortlist of up to four policy cards straight from live catalog fields, and **independently re-queries the catalog before rendering** to cross-check that every shortlisted policy still resolves. |
| 4 | Sasha (Communicator) | Writes the plain-language reason under every recommendation, grounded in real numbers. |
| 5 | Callum (Manager) | Reviews the handoffs and synthesises a single recommendation with an honest runner-up note. |

Persona files for all five live in `agents/`.

## How to run

### 1. Local server (recommended)

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. No build step, no secrets.

### 2. Direct (double-click `index.html`)

Works too. If a browser blocks the `file://` catalog fetch, use option 1.

## Live URL

**https://mimi-obodo.github.io/policy-fit-checker/**

The site is fully static: the 8+ week visibility requirement is satisfied with zero maintenance. Push to `main` and the live site updates automatically.

## The live data source (the connection the whole grade depends on)

- Sheet: **POLICY FIT CHECKER DATASET - LIVE RUN**, ID `1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8`, tab gid `1610292741`. 60 policies, one per row.
- Schema: `policy_id, provider_name, policy_name, insurance_type, target_life_stage, min_age, max_age, monthly_premium_eur, coverage_amount_eur, deductible_eur, key_features, exclusions, suitability_tags, region, rating_out_of_5, last_updated`.
- **Every read goes through one shared function, `fetchLiveCatalog()`** in `app.js` (and its server-side twin `fetchCatalog()` in `worker/engine.mjs`). Nothing caches or stores the data; a fresh CSV fetch happens at the moment of use, every time.
- Fetch chain: optional `PUBLISHED_CSV_URL` (the durable published CSV link, set it in `app.js`) → the sheet's `/export?format=csv` endpoint → a gviz JSONP fallback for `file://`. All three are keyless and CORS-open; all three are live.

### Make the endpoint durable (do this once)

1. In the sheet: **File → Share → Publish to web**.
2. Publish **the `1610292741` tab** (not the whole workbook) as **CSV**.
3. Paste the resulting link, which looks like:
   `https://docs.google.com/spreadsheets/d/e/<published-id>/pub?gid=1610292741&single=true&output=csv`
   into `PUBLISHED_CSV_URL` at the top of `app.js`.
4. Verify it loads as plain CSV in a private/incognito window with no Google account signed in, then verify it fetches from the deployed GitHub Pages origin (browser console / the diagnostic line on `match.html`).

The published link carries no API key, does not expire, and cannot be rate-limited by a key quota, which is what makes it safe for an eight-week uptime requirement.

## Live diagnostic (evidence layer)

On `match.html` and `chat.html` there is a permanently visible line:

> `Catalog fetched 12:01:04, 60 policies loaded.`

- It updates on **every** fresh fetch, including repeated questions in the same chat session.
- On the chat page it is also warmed on page load, so you can watch the timestamp advance as you ask.

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

## Optional: live-LLM chat (Cloudflare Worker + Gemini)

The baseline chat is the deterministic, persona-grounded pipeline over live-fetched data (still a fresh catalog fetch per question). To upgrade the chat to a real language model:

1. Get a free **Gemini API key** (Google AI Studio, Gemini 2.5 Flash).
2. Deploy the worker (`worker/`): `npm i -g wrangler`, then `cd worker && wrangler deploy worker.mjs --name pfc-agent-proxy`.
3. Give the worker the key: `wrangler secret put GEMINI_API_KEY` (the key lives only in Cloudflare, never in this repo).
4. Set the proxy URL in `config.js`:

```js
window.PFC_CONFIG.WORKER_URL = "https://pfc-agent-proxy.<your-subdomain>.workers.dev";
```

How it works:

- `config.js` is loaded before `app.js` on every page; `app.js` reads `PFC_CONFIG.WORKER_URL`.
- The Worker is the **only** holder of the model key. Each request makes the worker **re-fetch the published catalog server-side**, select the relevant rows, route to the correct agent (by name or by inference), build that agent's persona prompt, and call Gemini. The reply is grounded in the freshly fetched rows, never invented from memory.
- The frontend never sees or stores the key. No messages are stored by the site. If the worker is unreachable, the chat shows an honest error and never falls back to a canned answer.
- If `WORKER_URL` is empty, the chat uses the built-in live pipeline (still catalog-fresh per question).

Verify locally with the offline test:

```bash
node worker/test.mjs
```

> Note: `worker/test.mjs` contains **fabricated sample rows** that only mimic the live sheet's column shape so routing/grounding can be verified offline. It is a dev-only Node test — never loaded by any page, never deployed, never served. It is not the real catalog.

## Project structure

```
ceai_finale/
├── index.html                 # premium landing page
├── *.html                     # about, cover, education, chat, match, home, mobile, principles, providers, how
├── styles.css                 # design tokens and component styles
├── app.js                     # the five-agent pipeline, driven by live data
├── config.js                  # client config: WORKER_URL for the optional live-LLM chat
├── shell.js                   # shared chrome (header, footer, widget)
├── .env.example               # template for the worker secrets (never commit a filled one)
├── README.md
├── agents/                    # five persona files
├── worker/                    # Cloudflare Worker: live-LLM proxy (engine.mjs, worker.mjs, test.mjs)
├── research/research-brief.md # Run 1: Researcher output
├── design/design-spec.md      # Run 1: Designer output (score model, stance, copy)
├── prototype/pfc-app-v1.html  # Run 1: Maker's prototype (dev-only, not in the nav)
├── marketing/                 # empty; Communicator's assignment output lives here
└── management/                # empty; Manager's assignment output lives here
```

## Eight-week dependency audit

| Dependency | Why it still works in eight weeks |
|-----------|-----------------------------------|
| GitHub Pages (`mimi-obodo.github.io/policy-fit-checker`) | Static hosting; stays up as long as the public repo exists. No renewal, no expiry. |
| Published Google Sheet CSV (`/pub?output=csv`) | Keyless published link; does not expire and has no API quota. Only breaks if someone unpublishes the tab or deletes the sheet — don't. |
| Sheet `/export?format=csv` fallback | Same sheet, same sharing; keyless. |
| Google Fonts (Inter / JetBrains Mono) | Standard public CDN; cached heavily. |
| picsum.photos (hover-preview images) | Public placeholder CDN; if it ever goes down, only decorative preview thumbnails are affected, not the catalog or the matching. |
| Optional: Cloudflare Worker (live-LLM chat) | Free tier is persistent (no scheduled sleep), but it **does** depend on the Gemini key you provision and on `wrangler secret put GEMINI_API_KEY` staying set; if you deploy the worker, confirm Gemini free-tier quotas are not exhausted by demo/grading traffic. If you do not deploy the worker, the chat still works via the deterministic live pipeline. |
| Optional: Google Gemini API | Free tier can have per-minute/day quota limits that demo traffic could plausibly hit; if the worker is deployed, watch for 429s. The rest of the site is unaffected. |
