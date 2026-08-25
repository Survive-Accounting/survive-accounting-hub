# Morning Audit — Campus Market Intelligence

_Read-only audit of run 2026-08-25T12:00:00Z · config v1 · IPEDS 2024 (provisional). No data recalculated or mutated._

## Overall status — **PARTIAL** (ready for Growth V1 with caveats)
| | |
|---|---|
| Target universe | **829** |
| IPEDS matched (in universe) | **813** (98.1%) |
| Identity review | 16 (10 systems/districts + 6 unresolvable) |
| Unmatched (in universe) | 16 |
| Scored records / distinct 4-yr institutions | 832 / **675** |
| 2-year (separate segment) | 104 |
| Latest official data year | **2024** (provisional; earlier years revised) |
| Years of history loaded | 2015-2024 · median 10 yrs/campus · 632 with ≥9 yrs |
| Duplicate campus rows (flagged, not merged) | 108 rows / 54 groups |
| DB loaded | campus_market_intelligence=832, identity_review=124 |

## Raw market data (distinct 4-yr institutions, IPEDS 2024)
| Metric | n | min | p25 | median | p75 | p90 | max | mean |
|---|--|--|--|--|--|--|--|--|
| Undergrad enrollment | 673 | 14 | 2,551 | **5,510** | 11,859 | 23,613 | 70,991 | 9,254 |
| Business bachelor's | 675 | 0 | 61 | **166** | 426 | 895 | 2,726 | 327 |
| Accounting bachelor's | 675 | 0 | 0 | **17** | 46 | 103 | 513 | 35 |
| Business share | 665 | 0% | 13% | **18%** | 23% | 31% | 100% | 20% |
| Business 5Y growth (meaningful) | 436 | -65.0% | -23.3% | **-7.5%** | +8.3% | +28.8% | +6175.0% | +10.0% |

**Total annual business bachelor's represented: 221,024** · accounting: 23,871.

> ⚠️ **Non-authoritative legacy estimates (do NOT use):** `campus_tam_estimates` (455 rows — {"ai_estimate":140,"adoption_proxy":147,"unavailable":123,"ipeds":5,"manual_override":17,"opensyllabus_proxy":12,"public_course_schedule":1,"college_scorecard":10}; only 41 carry a source year, ~5 truly IPEDS) and `campus_intelligence` (444 rows) are AI/adoption-proxy guesses. This layer ignores them entirely; every number here is IPEDS-sourced with a preserved year.

## Intro-1 TAM
- **Total estimated annual Intro-1 opportunity: ~530,461 students/yr** — _ESTIMATED, NOT ACTUAL ENROLLMENT_.
- Method: `business_bachelors_x_multiplier` · multiplier **2.4** · confidence **low**.
- Median campus estimate: **398**/yr.

**Sensitivity to the multiplier (linear — total scales directly):**
| Multiplier | Total est. Intro-1/yr |
|--|--|
| 1.5 | 331,536 |
| 2 | 442,048 |
| 2.4 (current) | 530,458 |
| 3 | 663,072 |
| 3.5 | 773,584 |

Because TAM = Σ(business × multiplier), the **total is perfectly linear** in the multiplier: a ±0.5 change moves the headline by 110,512 students (~21%). Rankings are **unaffected** by the multiplier (monotonic), so it only matters for the absolute headline, not prioritization.

**Calibration — collect:**
- Sample 25-30 campuses stratified by business-completion size (small <200, mid 200-800, large >800).
- For each, obtain ACTUAL Intro Financial Accounting section enrollment (registrar course schedule / campus_course_sections / syllabi in course_document) for one recent term x2 (fall+spring).
- Back out realized multiplier = actual_annual_intro1_seats / business_bachelors; compare distribution vs the 2.4 default.
- Set per-campus overrides where sampled; keep 2.4 as the global prior until >=20 samples, then refit.

**Top 25 by estimated Intro-1:**
| # | Campus | ST | est Intro-1 | Business grads |
|--|--|--|--|--|
| 1 | Florida International University | FL | 6,542 | 2,726 |
| 2 | CUNY-Baruch College New | NY | 5,993 | 2,497 |
| 3 | Indiana University Bloomington | IN | 5,866 | 2,444 |
| 4 | San Diego State University | CA | 5,597 | 2,332 |
| 5 | University of Georgia | GA | 5,594 | 2,331 |
| 6 | Univ of Central Florida | FL | 5,496 | 2,290 |
| 7 | University of Houston | TX | 5,470 | 2,279 |
| 8 | California State University-Fullerton | CA | 5,410 | 2,254 |
| 9 | Liberty University | VA | 4,709 | 1,962 |
| 10 | University of Alabama | AL | 4,618 | 1,924 |
| 11 | Texas A&M University Coll | TX | 4,342 | 1,809 |
| 12 | Penn State University Univ | PA | 4,296 | 1,790 |
| 13 | Virginia Poly Inst & St Un | VA | 4,135 | 1,723 |
| 14 | University of Tennessee, Knoxville | TN | 4,111 | 1,713 |
| 15 | University of South Florida | FL | 4,090 | 1,704 |
| 16 | San Jose State University San | CA | 3,874 | 1,614 |
| 17 | Calif State Univ, Northridge | CA | 3,778 | 1,574 |
| 18 | Auburn University | AL | 3,662 | 1,526 |
| 19 | California State Polytechnic University-Pomona | CA | 3,634 | 1,514 |
| 20 | University of North Texas | TX | 3,588 | 1,495 |
| 21 | University of Arkansas | AR | 3,540 | 1,475 |
| 22 | Michigan State University East | MI | 3,526 | 1,469 |
| 23 | Clemson University | SC | 3,473 | 1,447 |
| 24 | Texas Tech University | TX | 3,456 | 1,440 |
| 25 | University of Wisconsin–Madison | WI | 3,394 | 1,414 |

## Market Opportunity — top 25 (with reasons)
| # | Campus | ST | MO | Why |
|--|--|--|--|--|
| 1 | University of Alabama | AL | 96.3 | 1,924 business grads/year (2024); Business completions -1% over 5Y; 71 social Greek chapters; IFC + MGC + NPHC + PANHELLENIC contacts verified; Large undergrad population (33,435) |
| 2 | University of Georgia | GA | 95.7 | 2,331 business grads/year (2024); Business completions +20% over 5Y; 67 social Greek chapters; IFC + MGC + NPHC + PANHELLENIC contacts verified; Large undergrad population (31,514) |
| 3 | CUNY-Baruch College New | NY | 95 | 2,497 business grads/year (2024); Business completions -14% over 5Y; Large undergrad population (16,086); 513 accounting grads/year; Business-heavy (72% of bachelor's) |
| 4 | University of Tennessee, Knoxville | TN | 94 | 1,713 business grads/year (2024); Business completions +39% over 5Y; 59 social Greek chapters; Large undergrad population (28,883); 144 accounting grads/year |
| 5 | University of Houston | TX | 93.6 | 2,279 business grads/year (2024); Business completions +6% over 5Y; 34 social Greek chapters; Large undergrad population (37,946); 275 accounting grads/year |
| 6 | Auburn University | AL | 92.6 | 1,526 business grads/year (2024); Business completions +28% over 5Y; 56 social Greek chapters; Large undergrad population (26,874); 156 accounting grads/year |
| 7 | Florida International University | FL | 92.6 | 2,726 business grads/year (2024); Business completions -2% over 5Y; 34 social Greek chapters; Large undergrad population (44,363); 165 accounting grads/year |
| 8 | University of Arkansas | AR | 92.3 | 1,475 business grads/year (2024); Business completions +10% over 5Y; 49 social Greek chapters; Large undergrad population (27,472); 142 accounting grads/year |
| 9 | Clemson University | SC | 91.8 | 1,447 business grads/year (2024); Business completions +54% over 5Y; 57 social Greek chapters; Large undergrad population (22,875); 163 accounting grads/year |
| 10 | Virginia Poly Inst & St Un | VA | 91.3 | 1,723 business grads/year (2024); Business completions +23% over 5Y; Large undergrad population (30,504); 128 accounting grads/year |
| 11 | Utah Valley University | UT | 90.3 | 999 business grads/year (2024); Business completions +36% over 5Y; Large undergrad population (43,794); 146 accounting grads/year |
| 12 | Calif State Univ, Northridge | CA | 89.6 | 1,574 business grads/year (2024); Business completions -6% over 5Y; Large undergrad population (32,429); 229 accounting grads/year |
| 13 | Indiana University Bloomington | IN | 89.3 | 2,444 business grads/year (2024); Business completions +20% over 5Y; 68 social Greek chapters; Large undergrad population (36,833); Business-heavy (33% of bachelor's) |
| 14 | University of Kentucky | KY | 89.2 | 1,109 business grads/year (2024); Business completions +20% over 5Y; 57 social Greek chapters; Large undergrad population (23,930); 152 accounting grads/year |
| 15 | University of North Texas | TX | 88.9 | 1,495 business grads/year (2024); Business completions +5% over 5Y; 40 social Greek chapters; Large undergrad population (33,858); 222 accounting grads/year |
| 16 | University of Mississippi | MS | 88.1 | 1,058 business grads/year (2024); Business completions -13% over 5Y; 37 social Greek chapters; Large undergrad population (19,094); 217 accounting grads/year |
| 17 | Penn State University Univ | PA | 88.1 | 1,790 business grads/year (2024); Business completions +9% over 5Y; Large undergrad population (42,223); 219 accounting grads/year |
| 18 | Appalachian State Univ | NC | 87.9 | 1,065 business grads/year (2024); Business completions +35% over 5Y; Large undergrad population (19,405); 99 accounting grads/year |
| 19 | University of Houston - Downtown | TX | 87.9 | 1,057 business grads/year (2024); Business completions +20% over 5Y; 36 social Greek chapters; Council contacts verified; Large undergrad population (12,880) |
| 20 | DePaul University | IL | 87.8 | 935 business grads/year (2024); Business completions -8% over 5Y; Large undergrad population (14,374); 173 accounting grads/year; Business-heavy (31% of bachelor's) |
| 21 | Univ of Central Florida | FL | 87.8 | 2,290 business grads/year (2024); Business completions -14% over 5Y; Large undergrad population (59,470); 196 accounting grads/year |
| 22 | University of Wisconsin–Madison | WI | 87.7 | 1,414 business grads/year (2024); Business completions +39% over 5Y; 60 social Greek chapters; Large undergrad population (36,797); 108 accounting grads/year |
| 23 | University of Cincinnati-Main Campus | OH | 87.6 | 1,248 business grads/year (2024); Business completions +13% over 5Y; 50 social Greek chapters; IFC + MGC contacts verified; Large undergrad population (31,184) |
| 24 | University of South Florida | FL | 87.5 | 1,704 business grads/year (2024); Business completions +29% over 5Y; 39 social Greek chapters; Large undergrad population (37,269); 253 accounting grads/year |
| 25 | Florida Atlantic University | FL | 87.3 | 1,389 business grads/year (2024); Business completions +12% over 5Y; 27 social Greek chapters; Large undergrad population (24,614); 205 accounting grads/year |

**Ordering sanity:** the top is dominated by large business-heavy flagships (Alabama, UGA, Tennessee, Auburn, Clemson) — sane. Checks:
- **Large-market false negatives** (business ≥ p90 but MO < median): none.
- **Small-school false positives** (business ≤ p25 but MO ≥ p75): none — the business anchor + community-college segmentation prevent this.
- **Outliers:** Community colleges are segmented out; liberal-arts colleges with 0 CIP-52 business majors (Yale/Barnard/Occidental) correctly score low.

## Growth Momentum
Labels: RAPID_GROWTH 51 · GROWING 176 · STABLE 200 · DECLINING 236 · INSUFFICIENT_DATA 12.

**Top meaningful growers:**
| Campus | ST | GM | Business 5Y |
|--|--|--|--|
| Morehouse College | GA | 97.9 | 86→150 (+74.4%) |
| Southern Utah University Cedar | UT | 96.6 | 148→265 (+79.0%) |
| Lander University | SC | 96.3 | 133→213 (+60.2%) |
| Fayetteville State Univ | NC | 96 | 134→234 (+74.6%) |
| Louisiana State University Alexandria | LA | 96 | 80→160 (+100.0%) |
| Clemson University | SC | 95.8 | 938→1447 (+54.3%) |
| Univ of California San Diego La | CA | 94.8 | 200→429 (+114.5%) |
| Indiana University Kokomo | IN | 94.3 | 66→117 (+77.3%) |
| Fairfield University | CT | 93.9 | 359→482 (+34.3%) |
| Murray State University | KY | 93.6 | 182→262 (+44.0%) |
| University of Tennessee, Knoxville | TN | 92.6 | 1229→1713 (+39.4%) |
| Norfolk State University | VA | 92.6 | 70→118 (+68.6%) |

**Steepest decliners (meaningful markets):**
| Campus | ST | Business 5Y |
|--|--|--|
| University of Pennsylvania | PA | 609→213 (-65.0%) |
| Lindenwood University St. | MO | 632→279 (-55.9%) |
| Southern Illinois Univ | IL | 342→157 (-54.1%) |
| Northeastern Illinois Univ | IL | 326→151 (-53.7%) |
| Salem State University | MA | 359→169 (-52.9%) |
| St. Cloud State University Saint | MN | 436→216 (-50.5%) |
| University of La Verne | CA | 511→256 (-49.9%) |
| Wright State University | OH | 552→278 (-49.6%) |
| Central Michigan University Mt. | MI | 1071→540 (-49.6%) |
| Indiana University of Pennsylvania | PA | 548→277 (-49.5%) |

**Small-base audit:** 8 institutions had a 5Y baseline < 25 (rate gated out, not allowed to distort), 18 flagged new-program (0-baseline, capped below RAPID_GROWTH). The min-denominator gate + meaningful-market label are doing their job — no 2→10 schools in the growers list.

**Useful growth signals:** 5Y business CAGR (size-gated), 3Y business growth, business share change (direction of program mix), undergrad enrollment trend (context). **Weak:** accounting-only growth (many schools report all business under CIP 52.0101 so accounting reads 0/noisy).

## Distribution Strength
- **Intentionally deferred: yes.** It was computed early on current data for completeness, but ⚠️ **treat as PROVISIONAL/possibly stale** — Greek/council data was still being populated by the structural backfill + Growth Contact runners.
- Coverage: **488/675** four-year institutions scored (72%); the rest are PENDING_BACKFILL. Data completeness among scored: median 40%.
- **Cheap refresh (run today after backfill settles):**
```bash
cd C:/Users/lee/Documents/sa-market-intel && node scripts/market-intel/run-all.mjs && node scripts/market-intel/import.mjs
```
  run-all re-reads live campus_greek_chapters + campus_council_status/contacts + growth_business_clubs and recomputes Distribution Strength, Outreach Priority, Enrichment Priority (and the market/growth layer) from the cached IPEDS JSON — no IPEDS re-download. Then import reloads the DB.

## Outreach Priority (NOT final)
Top-25 overlap with the current Outreach Priority ranking:
| Alternative ordering | shares of current OP top-25 |
|--|--|
| Market only | 15/25 |
| Market + Growth | 19/25 |
| Market + current Distribution | 19/25 |

**Biggest movers (Market-only rank vs current OP rank):**
| Campus | ST | OP rank | Market rank | Δ | DS | GM |
|--|--|--|--|--|--|--|
| Vanderbilt University | TN | 276 | 536 | +260 | 76.2 | 57.9 |
| Indiana University Kokomo | IN | 183 | 437 | +254 | pending | 94.3 |
| Rice University | TX | 311 | 565 | +254 | pending | 92.1 |
| Western Nevada College | NV | 215 | 467 | +252 | pending | 95.7 |
| City Vision University | MO | 320 | 572 | +252 | pending | 89.9 |
| University of South Carolina | SC | 90 | 334 | +244 | 98 | 74.7 |
| Norfolk State University | VA | 170 | 409 | +239 | pending | 92.6 |
| Texas A&M Univ-Texarkana | TX | 196 | 428 | +232 | pending | 88.7 |
| Central Michigan University Mt. | MI | 327 | 97 | -230 | 0 | 8.6 |
| Erskine College | SC | 286 | 515 | +229 | 38.7 | 96.2 |
| Columbia International University | SC | 287 | 516 | +229 | 40.7 | 92.6 |
| Nelson University | TX | 294 | 523 | +229 | 56.3 | 69.4 |

**Weighting problems:**
- Distribution carries 25% but is only present for ~72% of institutions, so for most campuses OP renormalizes to Market+Growth — DS currently rewards campuses that happen to be researched, not necessarily the best markets. Keep DS out of the headline rank until coverage is broad, or show a DS-known vs DS-pending split.
- Live Demand (5%) is null everywhere → effectively Market 52.6% / Distribution 26.3% / Growth 21.1% after renormalization.
- Course Readiness is 0% (correct for now) but reserved.

## Identity quality
Match methods: exact_name=268, national_exact=65, name_prefix=138, review_resolved_override=18, name_reverse=26, national_rename=1, review_resolved_suggestion=37, alias_exact=6, existing_unitid=273.

**Systems/districts held out of scoring (correct):** San Mateo County Community College District, Houston Community College System, University of Minnesota System, North Dakota University System, California State University System, San Diego Community College District, Los Angeles Community College District, Coast Community College District, Dallas County Community College District, University of Hawaii System.

**Cases needing a human decision:**
- Trinity College [?] — low_conf_or_renamed (suggestion: ambiguous national (2 candidates) — needs state (null) j=0)
- Alamo Colleges [TX] — low_conf_or_renamed (suggestion: Alamo City Barber College (482981) j=0.2)
- Thunderbird Sch Global Mgt [AZ] — no_candidate
- Test University [?] — no_candidate
- Lindenwood University Belleville [IL] — low_conf_or_renamed (suggestion: Adler University (142832) j=0.25)
- Arkansas State University Technical Center [AR] — high_conf_suggestion_verify (suggestion: Arkansas State University (106458) j=0.6)
- **54 duplicate-UNITID groups** — pick a canonical campus row per institution and retire the messy re-import. Examples: University of Tennessee, Knoxville / University of Tennessee · Indiana University Bloomington / Indiana University · San Diego State University / San Diego State University San · University of Texas at Austin / The University of Texas at Austin · University of Iowa Iowa / University of Iowa · Purdue University W / Purdue University-Main Campus.

## King / algorithmic marketing — WHO vs WHEN vs WHAT (do not conflate)
**WHO to target** (market attractiveness — stable, IPEDS-driven):
- `market_opportunity_score`, `estimated_intro1_annual`, `business_bachelors`, `business_share_of_bachelors`, `undergrad_enrollment`, `growth_momentum_score`/`growth_label`, `greek_chapters`.

**WHEN to target** (timing — NOT in this layer yet; sources to add):
- Academic calendar (term start, Intro-1 offering term, add/drop, exam windows) from campus_context/campus_exams; Greek recruitment windows; first-party demand seasonality (landing/exam-open events). Today these are absent → WHEN is unmodeled.

**WHAT action to take** (readiness + guardrails — operational):
- `recommended_next_action`, `distribution_strength_score`/`distribution_data_completeness` (can we reach students?), `enrichment_priority_score` (research first?), `council_available`/`councils_present`, `action_suppressed`/`action_suppress_reason`, `course_readiness_status`.

_Keep WHO (market) separate from WHAT (our readiness): a high-WHO campus with pending Distribution is an **enrichment** action, not an outreach action yet._

## Innovative signals (simple, explainable, non-prestige)
- **Business intensity per capita** = business_bachelors / undergrad_enrollment — finds business-dense campuses regardless of size (a cleaner "concentration" than share-of-bachelor's).
- **Accounting pipeline ratio** = accounting_bachelors / business_bachelors — where accounting is a real track (skip schools reporting all business under CIP 52.0101).
- **Sustained-growth flag** = business up in ≥4 of last 5 year-over-year steps (consistency beats a single 5Y endpoint; robust to one-year blips).
- **Acceleration** = 3Y CAGR − 5Y CAGR (is growth speeding up or fading?).
- **Greek-per-1k-undergrad** = greek_chapters / (undergrad/1000) — distribution density, comparable across sizes.
- **Data-confidence score** = market_data_completeness × (years_with_data/10) — surfaces where to trust the model vs collect more.
- **Momentum×Size product** = growth_momentum × log(business) — flags *large* markets that are *also* growing (best expansion bets) without letting small bases win.

## FINAL

**MARKET INTELLIGENCE READY FOR GROWTH V1: PARTIAL** — the standardized market layer (identity, IPEDS enrollment/completions, concentration, growth, estimated Intro-1, Market Opportunity, Growth Momentum) is **ready and reliable** across 675 institutions. Distribution Strength / Outreach Priority are **provisional** (refresh after backfill); Course Readiness + Live Demand are COMING_SOON; 54 duplicate campus groups + 6 identity items need a human pass. Use WHO/market fields now; hold outreach ordering as draft.

**TOP 25 CAMPUS OPPORTUNITIES (by Market Opportunity):**
1. **University of Alabama** (AL) — MO 96.3; 1,924 biz grads, 71 Greek, 33,435 undergrad
2. **University of Georgia** (GA) — MO 95.7; 2,331 biz grads, 67 Greek, 31,514 undergrad
3. **CUNY-Baruch College New** (NY) — MO 95; 2,497 biz grads, n/r Greek, 16,086 undergrad
4. **University of Tennessee, Knoxville** (TN) — MO 94; 1,713 biz grads, 59 Greek, 28,883 undergrad
5. **University of Houston** (TX) — MO 93.6; 2,279 biz grads, 34 Greek, 37,946 undergrad
6. **Auburn University** (AL) — MO 92.6; 1,526 biz grads, 56 Greek, 26,874 undergrad
7. **Florida International University** (FL) — MO 92.6; 2,726 biz grads, 34 Greek, 44,363 undergrad
8. **University of Arkansas** (AR) — MO 92.3; 1,475 biz grads, 49 Greek, 27,472 undergrad
9. **Clemson University** (SC) — MO 91.8; 1,447 biz grads, 57 Greek, 22,875 undergrad
10. **Virginia Poly Inst & St Un** (VA) — MO 91.3; 1,723 biz grads, n/r Greek, 30,504 undergrad
11. **Utah Valley University** (UT) — MO 90.3; 999 biz grads, n/r Greek, 43,794 undergrad
12. **Calif State Univ, Northridge** (CA) — MO 89.6; 1,574 biz grads, n/r Greek, 32,429 undergrad
13. **Indiana University Bloomington** (IN) — MO 89.3; 2,444 biz grads, 68 Greek, 36,833 undergrad
14. **University of Kentucky** (KY) — MO 89.2; 1,109 biz grads, 57 Greek, 23,930 undergrad
15. **University of North Texas** (TX) — MO 88.9; 1,495 biz grads, 40 Greek, 33,858 undergrad
16. **University of Mississippi** (MS) — MO 88.1; 1,058 biz grads, 37 Greek, 19,094 undergrad
17. **Penn State University Univ** (PA) — MO 88.1; 1,790 biz grads, n/r Greek, 42,223 undergrad
18. **Appalachian State Univ** (NC) — MO 87.9; 1,065 biz grads, n/r Greek, 19,405 undergrad
19. **University of Houston - Downtown** (TX) — MO 87.9; 1,057 biz grads, 36 Greek, 12,880 undergrad
20. **DePaul University** (IL) — MO 87.8; 935 biz grads, n/r Greek, 14,374 undergrad
21. **Univ of Central Florida** (FL) — MO 87.8; 2,290 biz grads, n/r Greek, 59,470 undergrad
22. **University of Wisconsin–Madison** (WI) — MO 87.7; 1,414 biz grads, 60 Greek, 36,797 undergrad
23. **University of Cincinnati-Main Campus** (OH) — MO 87.6; 1,248 biz grads, 50 Greek, 31,184 undergrad
24. **University of South Florida** (FL) — MO 87.5; 1,704 biz grads, 39 Greek, 37,269 undergrad
25. **Florida Atlantic University** (FL) — MO 87.3; 1,389 biz grads, 27 Greek, 24,614 undergrad

**TOP 10 MODEL IMPROVEMENTS:**
1. Calibrate the Intro-1 multiplier against real course-enrollment samples (biggest headline-accuracy lever).
2. Refresh Distribution Strength after the structural backfill; until coverage is broad, rank on Market+Growth and show Distribution as a separate readiness lane.
3. Resolve the 54 duplicate campus rows (canonical-row decision) so a school appears once.
4. Add the WHEN layer: academic calendar / Intro-1 offering term / Greek recruitment windows for timing.
5. Connect first-party demand (landing/exam-open/waitlist by campus_id) to replace Live Demand COMING_SOON.
6. Add "sustained-growth" and "acceleration" signals; de-emphasize single-endpoint 5Y growth.
7. Fix accounting-share for schools reporting all business under CIP 52.0101 (flag as "business-general reporter", don't score accounting=0 as a negative).
8. Add per-capita business intensity so mid-size business-dense schools surface next to giants.
9. Backfill missing states on draft campuses so ambiguous national names (Trinity College) resolve.
10. Wire Course Readiness from Course Intel when ready (it is designed in at 0 weight).

**EXACT FIELDS THE GROWTH DASHBOARD SHOULD CONSUME** (from `campus_market_intelligence_card`):
```
campus_id, campus, state, ipeds_unitid, segment
market_opportunity_score, growth_momentum_score, growth_label   // WHO
estimated_intro1_annual, business_bachelors, business_growth_5y, undergrad_enrollment, greek_chapters, councils_present  // WHO drivers
distribution_strength_score, distribution_data_completeness, enrichment_priority_score  // WHAT (readiness)
outreach_priority_score (DRAFT), recommended_next_action, action_suppressed  // WHAT (action)
course_readiness_status, live_demand_status  // COMING_SOON badges
market_data_completeness, top_drivers, generated_at  // trust + explainability
```

_Read-only audit — no data was recalculated or written. Source run 2026-08-25T12:00:00Z._