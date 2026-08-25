# Campus Market Intelligence — Report

_Generated 2026-08-25T18:00:00Z · scoring config v1 · IPEDS data year 2024_

> Independent, standardized market-intelligence layer built on public IPEDS/NCES data. **No deploy, no outreach sent.** Course Readiness is **COMING_SOON** (zero weight in current priority). Distribution Strength / Outreach Priority / Enrichment Priority are computed on **current** Greek/council data and are designed to be cheaply **refreshed** after the structural Campus Backfill settles.

## 1. Coverage & identity
| Metric | Value |
|---|---|
| Target universe (US, 4-yr + 2-yr, non-research-only) | **829** campuses |
| Matched to IPEDS UNITID (in universe) | **813** (98%) |
| Scored campus records (incl. a few out-of-universe with an existing UNITID) | 832 |
| — 4-year records / **distinct institutions** | 726 / **675** |
| — 2-year records (community colleges, separate segment) | 104 |
| Identity failures → review queue | **16** (10 systems/districts, 6 unresolvable) |
| Duplicate campus rows sharing a UNITID (flagged, not merged) | 108 rows / 54 groups |

Match methods: exact_name=268, national_exact=65, name_prefix=138, review_resolved_override=18, name_reverse=26, national_rename=1, review_resolved_suggestion=37, alias_exact=6, existing_unitid=273.

Review-queue reasons: low_conf_or_renamed=3, no_candidate=2, aggregate_system_or_district=10, high_conf_suggestion_verify=1. Systems/districts are intentionally **not** auto-matched to a single campus (per the "do not merge system campuses" rule).

## 2. The market (4-year primary segment, IPEDS 2024)
| Metric | Value |
|---|---|
| Total annual business bachelor's completions represented | **221,024** |
| Total annual accounting bachelor's completions | 23,871 |
| **Estimated annual Intro-1 opportunity** (business × 2.4) | **~530,461 students/yr** |
| | _ESTIMATED, NOT ACTUAL ENROLLMENT — low confidence_ |

## 3. Growth (5-year business completions, meaningful markets)
| Metric | Value |
|---|---|
| Median 5-yr business growth | -7.5% |
| Mean 5-yr business growth | +9.1% |
| RAPID_GROWTH campuses | **51** |
| GROWING campuses | 176 |
| DECLINING campuses | 236 |

## 4. Score distributions
**Market Opportunity (4-yr):** 90-100: 11 · 80-89: 57 · 70-79: 81 · 60-69: 85 · 50-59: 96 · <50: 345

**Distribution Strength coverage:** 664 of 675 four-year campuses have a Distribution Strength score today (Greek and/or council data present). The remaining 11 are **PENDING_BACKFILL** — their Outreach Priority currently renormalizes over Market Opportunity + Growth Momentum and will gain Distribution Strength on refresh.

## 5. Top 25 by Market Opportunity
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | University of Alabama | AL | 87.7 | 96.3 | 61.3 | 91.5 | 1,924 | -1.4% | 71 |
| 2 | University of Georgia | GA | 88.9 | 95.7 | 79.6 | 82.7 | 2,331 | +19.6% | 67 |
| 3 | CUNY-Baruch College New | NY | 58.4 | 95 | 40.1 | 0 | 2,497 | -13.9% | n/r |
| 4 | University of Tennessee, Knoxville | TN | 86.3 | 94 | 92.6 | 66 | 1,713 | +39.4% | 59 |
| 5 | University of Houston | TX | 77.3 | 93.6 | 64.6 | 54.7 | 2,279 | +5.5% | 34 |
| 6 | Auburn University | AL | 92 | 92.6 | 87.1 | 94.8 | 1,526 | +28.3% | 56 |
| 7 | Florida International University | FL | 73.3 | 92.6 | 48.3 | 54.7 | 2,726 | -2.3% | 34 |
| 8 | University of Arkansas | AR | 80.7 | 92.3 | 77.5 | 60.1 | 1,475 | +10.1% | 49 |
| 9 | Clemson University | SC | 90.9 | 91.8 | 95.8 | 85.2 | 1,447 | +54.3% | 57 |
| 10 | Virginia Poly Inst & St Un | VA | 65.5 | 91.3 | 82.7 | 0 | 1,723 | +23.4% | n/r |
| 11 | Utah Valley University | UT | 66 | 90.3 | 87.8 | 0 | 999 | +35.5% | n/r |
| 12 | Calif State Univ, Northridge | CA | 58.7 | 89.6 | 54.6 | 0 | 1,574 | -5.8% | n/r |
| 13 | Indiana University Bloomington | IN | 89.6 | 89.3 | 90.8 | 89.2 | 2,444 | +20.4% | 68 |
| 14 | University of Kentucky | KY | 82.3 | 89.2 | 86.4 | 65.2 | 1,109 | +19.8% | 57 |
| 15 | University of North Texas | TX | 77 | 88.9 | 71.4 | 57.8 | 1,495 | +5.3% | 40 |
| 16 | University of Mississippi | MS | 79 | 88.1 | 54.3 | 80.5 | 1,058 | -13.4% | 37 |
| 17 | Penn State University Univ | PA | 61.1 | 88.1 | 69.9 | 0 | 1,790 | +9.4% | n/r |
| 18 | University of Houston - Downtown | TX | 80.6 | 87.9 | 85.5 | 62.2 | 1,057 | +20.0% | 36 |
| 19 | Appalachian State Univ | NC | 65.5 | 87.9 | 91.5 | 0 | 1,065 | +35.3% | n/r |
| 20 | DePaul University | IL | 58.1 | 87.8 | 56.3 | 0 | 935 | -8.0% | n/r |
| 21 | Univ of Central Florida | FL | 55.5 | 87.8 | 44.3 | 0 | 2,290 | -14.5% | n/r |
| 22 | University of Wisconsin–Madison | WI | 90.1 | 87.7 | 90 | 94.8 | 1,414 | +38.6% | 60 |
| 23 | University of Cincinnati-Main Campus | OH | 76.2 | 87.6 | 75 | 54.5 | 1,248 | +12.8% | 50 |
| 24 | University of South Florida | FL | 77.7 | 87.5 | 79.1 | 57.1 | 1,704 | +28.5% | 39 |
| 25 | Florida Atlantic University | FL | 79.3 | 87.3 | 75.3 | 66.6 | 1,389 | +11.6% | 27 |

## 6. Top 25 growing meaningful markets
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | Morehouse College | GA | 44.7 | 41.8 | 97.9 | 7.9 | 150 | +74.4% | 5 |
| 2 | Southern Utah University Cedar | UT | 54.3 | 64.6 | 96.6 | 0 | 265 | +79.0% | n/r |
| 3 | Lander University | SC | 48.1 | 52.8 | 96.3 | 0 | 213 | +60.2% | n/r |
| 4 | Fayetteville State Univ | NC | 52.1 | 60.6 | 96 | 0 | 234 | +74.6% | n/r |
| 5 | Louisiana State University Alexandria | LA | 50.1 | 56.8 | 96 | 0 | 160 | +100.0% | n/r |
| 6 | Clemson University | SC | 90.9 | 91.8 | 95.8 | 85.2 | 1,447 | +54.3% | 57 |
| 7 | Univ of California San Diego La | CA | 51.7 | 60.3 | 94.8 | 0 | 429 | +114.5% | n/r |
| 8 | Indiana University Kokomo | IN | 39.9 | 38 | 94.3 | 0 | 117 | +77.3% | n/r |
| 9 | Fairfield University | CT | 58.9 | 74.4 | 93.9 | 0 | 482 | +34.3% | n/r |
| 10 | Murray State University | KY | 52.2 | 61.8 | 93.6 | 0 | 262 | +44.0% | n/r |
| 11 | University of Tennessee, Knoxville | TN | 86.3 | 94 | 92.6 | 66 | 1,713 | +39.4% | 59 |
| 12 | Norfolk State University | VA | 40.9 | 40.7 | 92.6 | 0 | 118 | +68.6% | n/r |
| 13 | San Diego State University | CA | 80.9 | 86.1 | 92.1 | 61.4 | 2,332 | +32.8% | 51 |
| 14 | Appalachian State Univ | NC | 65.5 | 87.9 | 91.5 | 0 | 1,065 | +35.3% | n/r |
| 15 | Montana State University | MT | 55.9 | 55.9 | 91.3 | 27.7 | 389 | +45.7% | 10 |
| 16 | Texas Christian University Fort | TX | 62.4 | 82.1 | 91 | 0 | 701 | +34.0% | n/r |
| 17 | Indiana University Bloomington | IN | 89.6 | 89.3 | 90.8 | 89.2 | 2,444 | +20.4% | 68 |
| 18 | Trinity University San | TX | 45.6 | 50.3 | 90.8 | 0 | 155 | +36.0% | n/r |
| 19 | Florida A&M University | FL | 43.7 | 46.8 | 90.5 | 0 | 166 | +64.4% | n/r |
| 20 | University of Wisconsin–Madison | WI | 90.1 | 87.7 | 90 | 94.8 | 1,414 | +38.6% | 60 |
| 21 | University of North Texas at Dallas | TX | 68.8 | 63.1 | 89.6 | 63.7 | 218 | +50.3% | 41 |
| 22 | University of The Cumberlands | KY | 50.2 | 59.7 | 89.1 | 0 | 247 | +157.3% | n/r |
| 23 | University of Tampa | FL | 62.6 | 83.4 | 88.8 | 0 | 768 | +30.2% | n/r |
| 24 | University of Rhode Island | RI | 56.2 | 71.2 | 88.8 | 0 | 516 | +35.8% | n/r |
| 25 | Stevens Institute of Technology | NJ | 48 | 32 | 88.1 | pending | 108 | +31.7% | n/r |

## 7. Data sources & cost
- **IPEDS / NCES** complete data files (public, free): Completions `C2016–C2024_A` (9 years), enrollment `DRVEF2024` + `EFFY`, directory `HD2024`. Bulk download, no per-campus scraping.
- **Live DB** (read-only): campus identity, Greek chapters, council status/contacts, business clubs, first-party demand events.
- **API / data cost: $0** (all IPEDS data is public bulk; no paid APIs used).

## 8. Known limitations
- **Intro-1 is an estimate**, not measured course enrollment (business bachelor's × 2.4). Recalibrate against real samples.
- **IPEDS business/accounting is first-major bachelor's completions** (CIP 52 / 52.03, AWLEVEL 5). Some schools (e.g. Indiana–Bloomington) report all undergrad business under the general CIP 52.0101 and break out **no** accounting sub-code, so their accounting_bachelors reads 0 — faithful to IPEDS, not a defect.
- **2024 completions are the latest IPEDS release** (provisional/revised where `_RV` available); the year is preserved on every row, never relabeled "current".
- **Distribution Strength is partial** (664/675) and reflects the in-progress structural backfill; it is renormalized over available components with completeness stamped. Business-club components cover only ~9 campuses (NOT_AVAILABLE_YET) and are excluded, not zeroed.
- **Live Demand = COMING_SOON**: first-party events are too sparse / partially unattributed (practice_attempts has free-text campus) to score reliably; raw signal counts are exposed instead. Zero weight.
- **Course Readiness = COMING_SOON** (null, zero weight) — reserved for Course Intel.
- **54 duplicate campus groups** share a UNITID (pre-existing DB dups); flagged in `CAMPUS_IDENTITY_REVIEW.csv`, not merged.

## 9. Verdict
The standardized market layer (IPEDS identity, enrollment, business/accounting completions, concentration, growth trends, estimated Intro-1, **Market Opportunity**, **Growth Momentum**) is complete and reliable across 675 four-year campuses. Distribution Strength / Outreach Priority / Enrichment Priority are live on current data and will sharpen after the structural backfill via the refresh path.

### MARKET INTELLIGENCE READY FOR GROWTH DASHBOARD: **PARTIAL**
_(Market + Growth layers YES; Distribution/Outreach/Enrichment computed on current data, refresh after backfill; Course Readiness + Live Demand intentionally COMING_SOON.)_

**No deploy. No outreach sent. No campuses activated.**
