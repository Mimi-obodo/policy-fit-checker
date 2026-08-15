# Policy Fit Checker — Design Specification (Run #1)

**Author:** Designer agent · **Date:** 15 Aug 2026
**Inputs:** `research/research-brief.md` (Researcher, Run #1) · `app.html` (existing prototype) · live policy sheet `1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8`
**Build target:** a single self-contained HTML file that works from `file://` (no build step), using the existing sheet loader (gviz JSONP → CSV fallback) from `app.html`.

---

## 1. Problem reframe — in the users' words

> "I'm 71 with type-2 diabetes. Every comparison site shows me a wall of identical-looking policies, but none of them will tell me straight whether they'll cover *my* condition. And when they finally say 'exclusions apply', the fine print is written for lawyers. I've been refused before. I don't need 200 products — I need the 4 that will actually say yes, and I need to know *why* before I hand over a penny."

> "My adviser told me income protection is 'possible but expensive' since my heart diagnosis. I have no idea if the €135/month option even covers a relapse, or if I'm paying for something that excludes me on page 12."

> "Every travel policy I find either excludes pre-existing conditions or doubles the price. I just want a policy that says 'covered' in plain words I can trust."

**The reframe:** PFC is not competing with price-comparison sites on *price*. It competes on the thing they structurally cannot do: **explaining fit**. The deepest unmet need is not "which policy is cheapest" — it is **"will they actually cover me, and why is this one for me?"** People with chronic conditions and people over 60 face the steepest version of this: the fewest eligible policies (51 eligible at 25 → 9 at 71 → 5 at 85), the highest prices, the most exclusions — and a regulator-acknowledged "insurance illusion" where people believe they're covered when exclusions say otherwise (EIOPA 2025).

**Design consequence:** every scoring number must ship with a *reason*. A fit score without a "why" is a black box — and black boxes are exactly what this user group has been burned by.

---

## 2. Concept & value proposition

**One sentence:** Policy Fit Checker is the insurance discovery layer that tells people exactly **which policies fit their life, which conditions they'll actually cover, what's excluded, what it truly costs — and *why***, instead of ranking a wall of near-identical products.

### Three pillars

1. **Condition-first coverage clarity** — the app asks about your health condition up front, then shows, per policy, a plain-language stance: ✅ "designed for pre-existing conditions", ⚠️ "doesn't say — verify before you buy", ❌ "exclusion risk". Exclusions are surfaced *before* the price, not buried in fine print.

2. **Explain, don't just score** — every policy card shows its fit score *broken into parts* (life stage, condition, affordability, region, rating, coverage), each part carrying one human sentence. The user always knows *why* policy A beats policy B.

3. **True affordability, not sticker price** — premium is the price of entry. Deductible burden, coverage amount and exclusion risk define the real value. PFC shows "what this actually means for your money" and labels over-budget honestly instead of hiding it.

### Position vs. the incumbent (the wall of near-identical products)

| | Typical PCW / insurer site | PFC |
|---|---|---|
| Orders by | Price | Fit |
| Asks about your health | No | Yes (condition disclosure) |
| Shows exclusions | Small print / PDF | Big, plain-language, up front |
| Explains the match | Star rating only | Per-component "why this fits" |
| Tells you how thin your shelf is | Hides it | Shows it ("only 4 policies fit your life") |
| Affordability | Monthly premium | Premium + deductible + coverage value |

---

## 3. Personas

All personas are intentionally chronic-condition / senior heavy — the #1 opportunity the Researcher identified. Each has a *core need* and *blocker* the UI must overcome.

### 3.1 Mairead — "Refused once, now I don't trust the wall" (Primary)
- **Profile:** 72, retired primary-school teacher, Cork (Ireland). Lives with type-2 diabetes and arthritis. Fixed pension income ~€1,600/mo. Has been refused travel cover before; finds her private health plan's exclusions incomprehensible.
- **Needs:** know which policies accept her condition *before* applying; know the real monthly cost on a fixed income; zero jargon; an honest "yes / maybe / no" on her diabetes.
- **Blockers:** insurance illusion (believed she was covered, wasn't); terminology (underwriting, excess, moratorium); fear of being rejected again.
- **Moment of success:** reads one card that says "✅ This policy is designed for people managing ongoing conditions — your diabetes is the *reason* this fits, not the reason it won't."

### 3.2 David — "My heart condition just changed everything" (Primary)
- **Profile:** 58, London (UK), mid-career, mortgage, still working. Newly diagnosed with atrial fibrillation. Currently has group life cover but it ends at retirement.
- **Needs:** which life/health policies won't exclude his AFib; what waiting periods actually mean; affordability *after* the exclusions are stripped away.
- **Blockers:** adviser said cover is "possible but expensive and full of exclusions"; can't tell which of two similar prices is the honest one; worried the policy he buys won't pay out.
- **Moment of success:** sees an ❌ "exclusion risk" flag save him from wasting money on the wrong policy, and a ✅ policy with the reasons spelled out.

### 3.3 Priya — "I'm self-employed and nobody insures my asthma" (Bridge persona → Researcher's gap #3)
- **Profile:** 41, Dublin (Ireland), consultant, solid but variable income, mild asthma, no employer safety net.
- **Needs:** income protection that doesn't exclude her asthma or demand €135/mo; the self-employed stage's most expensive/lowest-rated options explained honestly.
- **Blockers:** no employer to ask; the catalogue's income-protection gap; wide price band with no explanation of what you get for the money.
- **Moment of success:** an honest "this type has no income-protection option at your stage — here's the closest fit and why" rather than a fake ranking of nothing.

### 3.4 Lukas — "I just want travel cover that says 'covered'" (Secondary)
- **Profile:** 68, German (EU-Wide), wants to travel with a chronic condition; was denied once, now avoids buying cover and hopes for the best.
- **Needs:** travel policies that explicitly name pre-existing-condition coverage; simple yes/no stance; confidence his diabetes won't void a claim mid-trip.
- **Blockers:** denial trauma; exclusions in legalese; can't compare because every site words it differently.
- **Moment of success:** a card with ✅ + "travel cover that names pre-existing conditions in plain English."

### 3.5 Aidan — "I'm 34 and I've been told I'm uninsurable" (Secondary, literacy case)
- **Profile:** 34, Cork, recently diagnosed with Crohn's disease. First-ever insurance buyer. Overestimates cost 10–12× (LIMRA) and assumes nothing will cover him.
- **Needs:** proof that affordable, condition-aware cover exists; a glossary that doesn't feel like a lecture; a reason to believe the score.
- **Blockers:** belief he's "uninsurable"; comparison-site fatigue; no vocabulary to search correctly.
- **Moment of success:** "We found cover for you at €31/mo" with a clear ✅ stance — the price surprise *in his favour* for once.

---

## 4. User journeys

### Journey A — Mairead, from "I'll be refused again" to "I understand why these 4 fit"
| Step | What Mairead does | What the UI must do | Emotion |
|---|---|---|---|
| 1. Arrives | Lands on PFC (dark, calm, no price wall) | Say what it's for in one line: "Find cover that fits your health, your budget, your life." | Cautious |
| 2. Tells her life | Picks Senior, age 72, Ireland, budget €60/mo | Age slider + stage chips already present; *new:* condition disclosure appears contextually | Engaged |
| 3. Tells her truth | Selects "Diabetes / endocrine" from condition list | Store it; never ask twice; reassure "we never share this" | Guarded |
| 4. Sees her shelf | "Only 4 policies fit your life at 72." | Choice-collapse banner: honest count, no fake padding; "Widen budget" and "remove age filter" affordances | Surprised (10× cliff made visible) |
| 5. Reads the why | Opens "Why this fits" on the #1 card | Per-component reasons + ✅ diabetes stance + exclusion preview | Understanding |
| 6. Checks money | Sees premium, deductible, "over budget" honesty | True-affordability block; "€59/mo — €1 under your €60" and what the deductible means | Empowered |
| 7. Decides | Shortlists 3, notes "verify with provider" | One-tap shortlist; repeated verify-with-provider cue | Trusting |

### Journey B — David, from "my adviser said expensive" to "I know which one excludes my AFib"
| Step | David does | UI must do | Emotion |
|---|---|---|---|
| 1. Profile | Life stage Senior? No — *General Adult* is wrong for him; he's working with a chronic condition | This is the key tension: a 58-year-old with AFib isn't "Senior". **Condition disclosure must dominate over stage for scoring.** Add a "working age + managing a condition" path. | Anxious |
| 2. Condition | Selects "Heart / cardiovascular" | ✅/⚠️/❌ stance computed for every policy; ⚠️ and ❌ shown as cards, not hidden | Relief (he sees the risk *before* paying) |
| 3. Compare | Sees two life policies at €49 vs €119 | Reason bullets show the €119 one earns its price (better stance, lower excess, coverage) OR that it's over-budget and over-sold | Clarity |
| 4. Verify | Taps "Why this fits" | Per-component bars: life stage 18/25, condition 30/30, affordability 8/20, etc. — *the score is transparent and reversible* | Conviction |
| 5. Act | Saves shortlist, exports/notes | Shortlist persists in-session; clear "call the provider, quote policy ID" step | Ready |

**Design principle extracted:** *age ≠ life stage.* A 58-year-old with a condition and a 72-year-old retiree both need pre-existing-friendly cover, but their life stages differ. **Condition stance is scored for anyone who declares a condition, independent of stage.** (In data terms: we can't re-tag the sheet, so the *condition disclosure + tag/exclusion heuristics* must do the work.)

---

## 5. Information architecture & wireframes (ASCII)

### 5.1 Top-level IA

```
Policy Fit Checker (single page)
│
├── Header — brand + "Live · synced from Google Sheets" + "Plain-language glossary" toggle
│
├── STEP 1 · Profile sidebar (left, 340px)
│   ├── Life stage (select)   ── existing
│   ├── Age (slider 17–85)    ── existing (hard gate)
│   ├── Region (select)       ── existing
│   ├── Condition disclosure  ── NEW (hero element)
│   │    └─ "Does a health condition affect what cover you need?"
│   │       [Common: Diabetes/endocrine · Heart/cardiovascular · Cancer history ·
│   │        Asthma/COPD · Mental health · Mobility/arthritis · Other · None]
│   │       → chooses stance classifier path
│   ├── Max monthly budget €  ── existing
│   ├── Insurance types chips ── existing
│   └── [Check my fit]
│
└── STEP 2 · Results column (right, fluid)
    ├── Choice-collapse banner ── NEW: "Only N policies fit your life at age X."
    ├── Policy cards (ranked)  ── each card = score badge + stance chip + price + why
    │    └── "Why this fits" expandable panel  ── NEW (per-component breakdown)
    └── (below fold) Live context panel ── existing, demoted to optional market context
```

### 5.2 Choice-collapse banner (the "10× cliff" made visible)

```
┌────────────────────────────────────────────────────────────────┐
│   Only 4 policies fit your life at 72                            │
│   Age narrows the shelf 10× (51 at 25 → 4 at 72). We won't pad  │
│   it with policies that will reject you.                         │
│   [Widen budget] [I'm not 72 yet — lower my age]  ▸ 4 fit        │
└────────────────────────────────────────────────────────────────┘
```
Honest, calm, and *actionable*: it turns the Researcher's scariest statistic into a trust moment and two escape hatches.

### 5.3 Policy card (the core artifact)

```
┌──────────────────────────────────────────────────────────────┐
│  [BEST FIT]                                        ┌────────┐ │
│  WellBeing Senior Care Health                      │  86    │ │  ← score badge
│  SHIELD LIFE · Ireland                             │ strong │ │
│  ┌──────────────────────────────────────────────┐  └────────┘ │
│  │ ✅ Pre-existing friendly                     │              │  ← condition stance chip
│  └──────────────────────────────────────────────┘              │
│  €42.50/mo  ·  €800/yr excess  ·  €20,000 cover                │
│  ✓ Designed for ongoing-condition management                   │
│  ✓ Simplified underwriting (fewer health questions)            │
│  ✓ Specialist care network                                     │
│  ✗ Preexisting *diabetes* exclusions: NONE found — verify      │
│  ─────────────────────────────────────────────────────────     │
│  ▸ Why this fits (score breakdown)                             │  ← expandable
│  [Shortlist]                                  [See on provider]│
└──────────────────────────────────────────────────────────────┘
```

### 5.4 "Why this fits" expandable panel — *the* central explainer

```
┌──────────────────────────────────────────────────────────────┐
│  WHY THIS FITS · score 86/100                                 │
│                                                               │
│  Life stage      ▓▓▓▓▓▓▓▓▓▓░░░  18/25  "Built for Senior     │
│                                       (age 60–85) — you're 72"│
│  Condition       ▓▓▓▓▓▓▓▓▓▓▓▓▓  30/30  "✅ Pre-existing-      │
│                                       friendly: ongoing-care +│
│                                       simplified-underwriting │
│                                       tags; no diabetes       │
│                                       exclusion found"        │
│  Affordability   ▓▓▓▓▓▓▓▓▓▓▓░░  18/20  "€42.50 ≤ your €60     │
│                                       budget · €800/yr excess │
│                                       = you pay first ~€67/mo │
│                                       spread"                 │
│  Region          ▓▓▓▓▓▓▓▓░░░░░   8/10  "Ireland policy, you   │
│                                       live in Ireland"        │
│  Rating          ▓▓▓▓▓▓▓▓░░░░░   7/10  "4.2/5 from customers" │
│  Coverage        ▓▓▓▓▓▓░░░░░░░   5/5   "€20,000 is strong for │
│                                       senior health"          │
│  ⚠ Remember: this is indicative. Confirm your condition with  │
│    SHIELD LIFE before you buy. Quote policy ID `HEL-014`.     │
└──────────────────────────────────────────────────────────────┘
```
Every bar carries a *sentence*. No unexplained numbers. That is the whole product.

### 5.5 Condition-stance chips (legend shown once, top of results)

```
✅ Pre-existing friendly   — tags/features mention pre-existing cover,
                             ongoing care, or simplified underwriting
⚠️ Not clearly stated      — no exclusion found AND no pre-existing
                             mention; verify before you buy
❌ Exclusion risk          — exclusions text overlaps your condition;
                             shown anyway (with price) so you don't waste
                             money learning the hard way
```

### 5.6 Thin-shelf / empty state (Priya's honest moment)

```
┌──────────────────────────────────────────────────────────────┐
│  No Income Protection policies fit your life at 41.           │
│  The data is blunt: this category has no option for           │
│  self-employed people with asthma. We won't fake a match.     │
│  · Closest fit instead → [Pet/Home/Travel card…]              │
│  · [Widen budget] · [Show all Income Protection anyway]       │
│  · This is a known gap we're tracking.                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Fit-scoring model — improved weights + the "why"

### 6.1 The problem with the current model (from `app.html`)
- Current: life-stage 30 · tags 25 · budget 25 · region 10 · rating 10; age = hard gate.
- **No condition dimension at all** — a diabetic sees the same scores as a healthy user.
- Budget is a linear premium ratio: a €2,000 deductible policy is scored the same as a €0 deductible policy at the same premium.
- Score is a black number with no per-component reason; nothing *explains* a match.
- `target_life_stage === user stage` gives full 30 or 0 — no partial/near-stage credit (e.g. Senior vs Chronic Condition Management).

### 6.2 Proposed 100-point model

| Component | Weight | Measures | Example reason sentence |
|---|---|---|---|
| Life-stage fit | 25 | exact stage match = full; near-stage (e.g. Senior ↔ Chronic Condition Management, New Parent ↔ Family) = partial; else 0 | "Built for people over 60 — you're 72." |
| **Condition compatibility** | **30** | stance from disclosure × tags/exclusions heuristics | "✅ Pre-existing-friendly: no diabetes exclusion found." |
| True affordability | 20 | premium vs budget (as now) **corrected by deductible burden + coverage value** | "€42.50 fits your €60 budget; €800/yr excess is fair." |
| Region fit | 10 | Any / EU-Wide / exact match (unchanged) | "Available where you live." |
| Rating | 10 | rating/5 (unchanged) | "4.2/5 from other customers." |
| Coverage adequacy | 5 | coverage amount vs type-specific benchmark | "€20,000 is strong for this category." |
| **Total** | **100** | | |

**Why 30 for condition:** it's the #1 opportunity, it's the layer incumbents don't have, and it directly attacks the "insurance illusion." Life-stage + condition = 55/100 = "this fits *me*"; price is 20, not 25 — a deliberate tilt away from price-first PCWs (Researcher §7.2).

### 6.3 Hard vs soft gates
- **Hard gate (unchanged):** age outside `min_age–max_age` → policy dropped.
- **Soft gate (new honesty):** over-budget policies are *kept and ranked lower*, but wear a clear **"€X over your budget"** red badge — never silently hidden, never silently inflated. The thin shelf means removing them is worse than showing them honestly.
- **Region (unchanged soft):** EU-Wide always eligible; otherwise must match.
- **Condition:** never a hard gate that hides a card. ❌ policies are *shown* with their risk chip — the Researcher's data says exclusions are where illusion lives, so we surface them.

### 6.4 Condition stance classifier (buildable with the sheet as-is)
The sheet has free-text `suitability_tags`, `key_features`, `exclusions` — enough for honest *heuristics* (clearly labelled as indicative, per Researcher §6 data-honesty risk):
1. **Stance keyword scan** over `suitability_tags` + `key_features`: `pre-existing`, `pre-existing-condition-friendly`, `ongoing-care`, `specialist-cover`, `simplified-underwriting` → **✅**.
2. **Exclusion overlap scan** over `exclusions`: match against the declared condition's keyword family (e.g. Diabetes → `diabetes, pre-existing, chronic`; Heart → `cardiac, heart, cardiovascular, pre-existing`; Cancer → `cancer, malignancy`; Asthma → `respiratory, asthma, lung`; Mental → `mental, psychiatric`; Mobility → `mobility, arthritis`). Any hit → **❌ exclusion risk**.
3. **Neither → ⚠️** "not clearly stated — verify."

This is honest with synthetic data, ships today, and becomes more precise once exclusions are typed fields (Researcher §7.5). The classifier must live in one small, commented function so Maker can tune keyword tables without touching the renderer.

### 6.5 Surfacing the "why" per policy — the render contract
Every rendered card MUST emit, at minimum:
- Score badge (colored by threshold: ≥70 strong, 45–69 mid, <45 weak — reuse existing classes).
- **Condition stance chip** (✅/⚠️/❌ + one-line reason).
- Premium + deductible + coverage line (existing), plus **over-budget badge** when applicable.
- Up to 3 feature bullets (existing) and **up to 2 exclusion previews**, with any keyword-overlapping exclusion *highlighted*.
- Expandable **"Why this fits"** panel: 6 component bars, each with label/weighted-score + one reason sentence, plus the verify-with-provider reminder and policy ID.

---

## 7. UX copy tone

**Tone: a trustworthy friend who knows insurance — warm, direct, zero jargon, zero hype.** We never pressure, never pad, and we say "we don't know" when the data can't tell us.

### Phrase swaps (jargon → plain English)
| Don't say | Say |
|---|---|
| Deductible / excess | "You pay the first €X of any claim yourself" |
| Underwriting | "The health questions they ask before they accept you" |
| Moratorium | "A waiting period — conditions you've had recently aren't covered at first" |
| Pre-existing condition exclusion | "This policy won't cover a condition you already have" |
| Suitability | "Why this fits you" |
| "Only X policies" (guilt) | "Only X policies fit your life" (empowerment) |

### Copy rules
1. **One idea per sentence.** Insurance sentences compound confusion.
2. **Always state the caveat, once, in the same words** ("verify with the provider before you buy") — consistency builds trust.
3. **Never shame a thin shelf** — celebrate the honesty ("We won't pad it with policies that will reject you").
4. **Numbers are friendly:** "€1 under your budget", "€800/yr excess = about €67/mo you pay before cover kicks in".
5. **No exclamation marks on claims; only on relief.** "You found a fit!" is earned; "Cheapest ever!" is not.

### A mini glossary (tooltip-style, file://-safe — plain `<details>`/tooltip, no framework)
excess, premium, cover amount, pre-existing condition, simplified underwriting, waiting period, moratorium, indemnity vs pay-out.

---

## 8. Success metrics

**Fit quality (primary)**
- **M1 · Stance accuracy:** share of policies where the ✅/⚠️/❌ chip matches a hand-checked review of the sheet's exclusions (target ≥ 80% on a 15-policy sample). *Correctness gate before anything else.*
- **M2 · Explanation usage:** % of chronic/senior users who open "Why this fits" (target ≥ 40%); % who then rate it "clear" via a 2-tap 👍/👎 (target ≥ 70%).

**Behaviour change**
- **M3 · Shelf transparency:** % of users in the 60+ band who adjust budget/age *after* seeing the choice-collapse banner (target ≥ 25%) — proves the cliff is being understood, not ignored.
- **M4 · Shortlist conversion:** % of chronic/senior users who shortlist ≥2 policies in a session (target ≥ 30%).

**Trust / illusion reduction (qualitative)**
- **M5 · "I saw an exclusion I would have missed"** — share of users confirming the ❌/⚠️ chip changed their decision (survey in prototype demo, target ≥ 50%).

**Process (Run #1 demo observables)**
- Average eligible-policy count per profile shown honestly (thin shelf visibility).
- Time from "Check my fit" to first readable "why this fits" (target < 5s, no build step → instant).

---

## 9. Handoff notes for Maker (prioritized build list for Run #1)

**Constraints:** single self-contained HTML file, works from `file://`, no build step. Reuse `app.html`'s sheet loader (gviz JSONP → CSV fallback), the existing dark theme/CSS system, chips, and age-gate logic. Do NOT add libraries. All new logic is vanilla JS.

### P0 — Must build (the product is these 6 things)
1. **Condition disclosure input** in the sidebar: select of condition families (Diabetes/endocrine · Heart/cardiovascular · Cancer history · Asthma/COPD · Mental health · Mobility/arthritis · Other · None). Default "None" preserves today's behaviour for the demo.
2. **Condition stance classifier** — one keyword-table function over `suitability_tags`/`key_features`/`exclusions` → ✅/⚠️/❌ + reason string (spec §6.4). Output the chip on every card.
3. **New 100-point scoring** (spec §6.2): life-stage 25 (add near-stage partial credit), condition 30, affordability 20 (premium ratio *corrected by deductible+coverage*), region 10, rating 10, coverage adequacy 5. Keep age hard gate; add **over-budget badge** as soft gate.
4. **"Why this fits" expandable panel** — 6 component bars + one reason sentence each + verify-with-provider reminder + policy ID (spec §5.4). This is the non-negotiable core.
5. **Choice-collapse banner** — "Only N policies fit your life at age X" + widen-budget / lower-age affordances (spec §5.2).
6. **Thin-shelf & empty states** — honest copy for chronic/senior/self-employed gaps; never fabricate matches (spec §5.6).

### P1 — Should build (make it trustworthy & legible)
7. **Exclusion previews** on cards (top 2 exclusions; highlight any overlapping your declared condition).
8. **Plain-language glossary** — `<details>`/tooltip on key terms (excess, pre-existing, simplified underwriting, moratorium).
9. Keep the **live context panel** but move below results; reuse existing fetch/JSONP infra untouched.

### P2 — If time allows / next run
10. Shortlist tray + in-session persistence + "call provider, quote policy ID".
11. **"Try Mairead's profile"** demo persona buttons (one-click populated form) — ideal for the demo run.
12. Over-budget "what's the premium for my budget?" hint (nearest policy below budget, even if score is low).

### Scope risks (flag honestly)
- **Free-text exclusions → heuristics are indicative, not guarantees.** The ✅/⚠️/❌ chips MUST carry "verify with the provider" — this is both honest and a trust feature.
- **Chronic stage has zero Health/Life/Critical Illness/Income Protection in the sheet** — do not invent them; the thin-shelf and empty states are the product here, not a bug.
- **Don't over-smooth the score.** Keep component weights in one clearly-commented object so the Researcher's next run can re-tune without refactoring.

---

*End of design spec (Run #1). Handing to Maker.*
