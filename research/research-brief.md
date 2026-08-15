# Policy Fit Checker — Research Brief & Opportunity Analysis

**Run:** #1 · **Author:** Researcher agent · **Date:** 15 Aug 2026
**Evidence base:** Live policy database (Google Sheet `1ZzLcYTmbQ79kY4tHG52gfPWZdgsTdOs9yLBMZrFdcS8`, 60 policies) + market sources (§8). Assumptions marked **[assumption]**.

## 1. Executive summary
- **The fit problem is real and regulator-acknowledged.** Ireland's 328 private-health plans hold 2.55M customers who stay ~20 years on the same plan; 47% find plans hard to understand and 82% don't shop around — the regulator itself pushes for simpler choice (HIA, 2025).
- **Comparison sites win on price, not fit.** 67% of UK adults use a PCW for insurance, but PCWs serve commodity motor/home lines dominated by a big four (Compare the Market: 48.3% non-life share). Life-stage fit is an unserved layer above them.
- **Choice collapses where people need it most.** A 25-year-old sees 51 eligible policies in our data; a 71-year-old sees 9; an 85-year-old sees 5 — a thin, pricey shelf for those who need cover most.
- **Protection gaps are structural and widening.** UK mortality resilience fell 73%→58% (2014–24); 16.8M EU self-employed lack unemployment cover; >half of digital-platform workers lack critical cover.
- **Underserved segments = the opportunity.** Chronic-condition (4 policies) and self-employed (6) stages have the least, most expensive, lowest-rated options.

## 2. Market landscape
- **Aggregators are mature and stalling:** 67% of UK adults used a PCW for insurance last year (motor 69.5%, home 50.9% research via PCW), but PCW traffic is *falling* as premium deflation hits — growth now comes from differentiation, not price-hunting (Mintel/GlobalData 2025).
- **Protection is a small, expanding slice of life insurance:** ~9% of EU life premiums today, forecast to grow through 2028 as state safety nets shrink (BCG 2025).
- **Ireland:** €113bn premiums (2025, +3.5%). Private health insurance: 2.55M lives, avg premium €1,902 (+~9% in 2025); 34 of 328 plans hold half of all customers — a textbook "wall of near-identical products."
- **Demographic tailwind:** ~16,000 EU residents turn 65 daily; the 65+/20–64 ratio rises 36% (2022) → 59% (2070).

## 3. Target segments
- **Students / young adults** — need low-cost entry cover; young adults overestimate life-insurance cost 10–12× (LIMRA).
- **New parents / families** — income replacement and life cover; the breadwinner protection gap is the largest single exposure.
- **Self-employed & gig workers** — income protection, health, liability; 73% of solo self-employed are uninsured for income loss (ESIP); no employer safety net.
- **Chronically ill** — pre-existing-condition-friendly cover; 62% of UK advisers call finding such cover "difficult" (The Exeter 2025).
- **Seniors (60+)** — fixed-income, simplified underwriting; they face the steepest choice collapse and the highest premiums (§5).

## 4. Pain points & opportunity
1. **Complexity paralysis → inertia:** consumers stay ~20 years on the wrong plan (HIA); EIOPA flags "insurance illusion" — believing you're covered when exclusions say otherwise — as a conduct risk.
2. **Price-first comparison fails non-commodity lines:** PCW conversion is falling for life products; life-stage fit is the differentiation incumbents don't offer.
3. **Hard-to-insure people are underserved and know it:** advisers name pre-existing conditions the top challenge for PMI (37%), income protection (29%), life (26%).

**Opportunity:** an independent, life-stage-first matching layer — what to buy, why it fits, what's excluded — sitting above price aggregators and competing on trust and fit rather than the cheapest quote.

## 5. Data findings (live sheet, 60 synthetic policies)
- **Shelf is balanced but stage-skewed:** 10 types × 6 policies; regions EU-Wide 22 / Ireland 21 / UK 17. Stages: Young Professional 13, General Adult 9, Family 8, New Parent 8, Student 7, Self-Employed 6, Senior 5, **Chronic Condition Management 4**.
- **Premium ranges (€/mo):** Travel €2.87–30.37 · Student €5.67–24.40 · Pet €10.91–41.15 · Home/Renters €28.86–59.34 · Critical Illness €27.70–89.54 · Life €15.24–119.35 · Auto €30.10–120.88 · Health €31.96–120.75 · Business Liability €20.23–124.57 · **Income Protection €30.70–135.52** (widest band, highest ceiling).
- **Choice cliffs by age:** eligible policies drop 51 (age 25) → 35 (41) → 27 (46) → 19 (56) → 9 (71) → 5 (85). No age 17–85 is uncovered, but the shelf thins 10×.
- **Chronic Condition Management:** only Travel ×2, Student ×1, Home/Renters ×1 — **zero Health, Life, Critical Illness or Income Protection** aimed at this stage.
- **Senior (60–85):** only 5 policies, including the two most expensive in the dataset (Income Protection €135.52, Life €119.35); no Health or Critical Illness.
- **Self-Employed:** 6 policies, no Income Protection; its Health option is the most expensive of its type (€120.75) and its Life option is the lowest-rated in the dataset (3.4/5).
- **Data realism caveats:** Income Protection "coverage" of €1,500–2,500 likely encodes *monthly benefit* **[assumption]**; Travel deductibles up to €299k and Auto cover of €15k–40k sit below real market levels (Ireland avg motor premium ~€655/yr). Synthetic quirks, not market facts.

## 6. Gaps & risks
- **Cross-border comparability:** "EU-Wide" products clash with national mandates, tax relief and risk pooling (e.g. Ireland's Lifetime Community Rating); fit logic must be region-aware.
- **Data honesty:** synthetic premiums must not read as quotes; fit is only as credible as its parsing of exclusions — "insurance illusion" risk cuts both ways.
- **Trust & economics:** incumbents hold ad budgets and 15–25% commission relationships; fit-referral economics for niche lines are unproven **[assumption]**; the least-covered segments are least able to pay, so pricing needs a fairness model.

## 7. Recommendations
1. **Lead with chronic-condition + senior fit** — surface pre-existing-condition cover, exclusions and true affordability; the most defensible, evidence-backed niche.
2. **Score on life-stage, not price** — suitability tags, age bands, exclusions and budget, with an *explain-why* panel; differentiate from PCWs explicitly.
3. **Close the self-employed income-protection gap in the catalogue** — widest price band, most acute market gap.
4. **Make the choice-collapse visible** — "only N policies fit your life" turns the age cliff into a narrative hook.
5. **Structure the data for machine-checking** — exclusions, pre-existing stance, waiting periods and benefit units must be typed fields before launch.

## 8. Sources
- HIA (Ireland) Market Report & Q4 2025 Bulletin — plans, 2.55M lives, €1,902 premium, inertia. · Central Bank of Ireland — Insurance Statistics 2025 (€113bn); NCID Motor H1-2025 (€655 avg).
- Mintel, *UK Price Comparison Sites* 2025 (67% usage; concentration). · GlobalData, *UK Insurance Aggregators* 2025 (CtM 48.3%/43.0%; research behaviour). · Mordor Intelligence, UK Motor (PCW 54.7% premium; 15–25% commissions).
- BCG, *The Growing Protection Gap in European Insurance* 2025 (resilience 70%→64%; $40bn gap; platform workers; 9% of life premiums). · Swiss Re, Mortality Resilience Index (UK 73%→58%; ~USD 7.5bn gap).
- Eurofound (16.8M self-employed uncovered); ESIP (73% solo self-employed uninsured). · The Exeter 2025 (62% advisers). · EIOPA Consumer Trends 2025 + Eurobarometer ("insurance illusion"). · LIMRA 2025 (cost misperception).
- **Primary:** PFC live policy database CSV (fetched 15 Aug 2026) — all §5 figures.
