# Campus Market Intelligence — Report

_Generated 2026-08-25T04:00:00Z · scoring config v1 · IPEDS data year 2024_

> Independent, standardized market-intelligence layer built on public IPEDS/NCES data. **No deploy, no outreach sent.** Course Readiness is **COMING_SOON** (zero weight in current priority). Distribution Strength / Outreach Priority / Enrichment Priority are computed on **current** Greek/council data and are designed to be cheaply **refreshed** after the structural Campus Backfill settles.

## 1. Coverage & identity
| Metric | Value |
|---|---|
| Target universe (US, 4-yr + 2-yr, non-research-only) | **761** campuses |
| Matched to IPEDS UNITID (in universe) | **747** (98%) |
| Scored campus records (incl. a few out-of-universe with an existing UNITID) | 766 |
| — 4-year records / **distinct institutions** | 660 / **627** |
| — 2-year records (community colleges, separate segment) | 104 |
| Identity failures → review queue | **14** (10 systems/districts, 4 unresolvable) |
| Duplicate campus rows sharing a UNITID (flagged, not merged) | 72 rows / 36 groups |

Match methods: exact_name=268, name_prefix=138, review_resolved_override=18, name_reverse=26, review_resolved_suggestion=37, alias_exact=6, existing_unitid=273.

Review-queue reasons: no_candidate=1, low_conf_or_renamed=2, aggregate_system_or_district=10, high_conf_suggestion_verify=1. Systems/districts are intentionally **not** auto-matched to a single campus (per the "do not merge system campuses" rule).

## 2. The market (4-year primary segment, IPEDS 2024)
| Metric | Value |
|---|---|
| Total annual business bachelor's completions represented | **216,448** |
| Total annual accounting bachelor's completions | 23,471 |
| **Estimated annual Intro-1 opportunity** (business × 2.4) | **~519,479 students/yr** |
| | _ESTIMATED, NOT ACTUAL ENROLLMENT — low confidence_ |

## 3. Growth (5-year business completions, meaningful markets)
| Metric | Value |
|---|---|
| Median 5-yr business growth | -7.5% |
| Mean 5-yr business growth | +9.5% |
| RAPID_GROWTH campuses | **50** |
| GROWING campuses | 161 |
| DECLINING campuses | 216 |

## 4. Score distributions
**Market Opportunity (4-yr):** 90-100: 12 · 80-89: 48 · 70-79: 78 · 60-69: 79 · 50-59: 92 · <50: 318

**Distribution Strength coverage:** 112 of 627 four-year campuses have a Distribution Strength score today (Greek and/or council data present). The remaining 515 are **PENDING_BACKFILL** — their Outreach Priority currently renormalizes over Market Opportunity + Growth Momentum and will gain Distribution Strength on refresh.

## 5. Top 25 by Market Opportunity
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | University of Alabama | AL | 87.5 | 96.1 | 61.1 | 91.5 | 1,924 | -1.4% | 71 |
| 2 | University of Georgia | GA | 88.5 | 95.3 | 79.2 | 82.5 | 2,331 | +19.6% | 67 |
| 3 | CUNY-Baruch College New | NY | 79.5 | 95 | 40.7 | pending | 2,497 | -13.9% | n/r |
| 4 | University of Tennessee, Knoxville | TN | 91.3 | 92.7 | 92.4 | 87.5 | 1,713 | +39.4% | 51 |
| 5 | Auburn University | AL | 91.7 | 92.3 | 86.9 | 94.4 | 1,526 | +28.3% | 55 |
| 6 | University of Houston | TX | 80.5 | 92.1 | 64.9 | 69.6 | 2,279 | +5.5% | 34 |
| 7 | University of Arkansas | AR | 85.8 | 91.4 | 77.3 | 81.3 | 1,475 | +10.1% | 47 |
| 8 | Florida International University | FL | 76.6 | 91.1 | 48.9 | 69.6 | 2,726 | -2.3% | 34 |
| 9 | Virginia Poly Inst & St Un | VA | 88.4 | 90.9 | 82.3 | pending | 1,723 | +23.4% | n/r |
| 10 | Liberty University | VA | 84.4 | 90.4 | 69.5 | pending | 1,962 | +5.7% | n/r |
| 11 | Clemson University | SC | 89.5 | 90.1 | 95.7 | 83.5 | 1,447 | +54.3% | 48 |
| 12 | Utah Valley University | UT | 89.3 | 90 | 87.4 | pending | 999 | +35.5% | n/r |
| 13 | Calif State Univ, Northridge | CA | 79.4 | 89.2 | 54.8 | pending | 1,574 | -5.8% | n/r |
| 14 | University of Houston - Downtown | TX | 88 | 89.1 | 85.3 | pending | 1,057 | +20.0% | n/r |
| 15 | Indiana University Bloomington | IN | 91.9 | 89 | 90.6 | 98.7 | 2,444 | +20.4% | 68 |
| 16 | University of Kentucky | KY | 89.5 | 88.9 | 86.1 | 93.3 | 1,109 | +19.8% | 57 |
| 17 | Appalachian State Univ | NC | 88.7 | 87.6 | 91.3 | pending | 1,065 | +35.3% | n/r |
| 18 | Penn State University Univ | PA | 82.4 | 87.6 | 69.5 | pending | 1,790 | +9.4% | n/r |
| 19 | University of North Texas | TX | 80.9 | 87.6 | 71.1 | 75.4 | 1,495 | +5.3% | 40 |
| 20 | DePaul University | IL | 78.7 | 87.6 | 56.6 | pending | 935 | -8.0% | n/r |
| 21 | Univ of Central Florida | FL | 75 | 87.1 | 44.9 | pending | 2,290 | -14.5% | n/r |
| 22 | Michigan State University East | MI | 77.2 | 86.8 | 53.2 | pending | 1,469 | -7.7% | n/r |
| 23 | Temple University | PA | 67 | 86.8 | 17.4 | pending | 1,143 | -32.7% | n/r |
| 24 | University of Mississippi | MS | 76.3 | 86.7 | 54.5 | 72.8 | 1,058 | -13.4% | 37 |
| 25 | University of Wisconsin–Madison | WI | 88.3 | 86.6 | 89.7 | 90.6 | 1,414 | +38.6% | 54 |

## 6. Top 25 growing meaningful markets
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | Morehouse College | GA | 44.1 | 40.5 | 97.9 | 8.4 | 150 | +74.4% | 5 |
| 2 | Southern Utah University Cedar | UT | 72.8 | 63.4 | 96.4 | pending | 265 | +79.0% | n/r |
| 3 | Lander University | SC | 64 | 51.1 | 96.1 | pending | 213 | +60.2% | n/r |
| 4 | Fayetteville State Univ | NC | 69.5 | 58.9 | 95.9 | pending | 234 | +74.6% | n/r |
| 5 | Louisiana State University Alexandria | LA | 66.7 | 55 | 95.8 | pending | 160 | +100.0% | n/r |
| 6 | Clemson University | SC | 89.5 | 90.1 | 95.7 | 83.5 | 1,447 | +54.3% | 48 |
| 7 | Univ of California San Diego La | CA | 69.4 | 59.3 | 94.6 | pending | 429 | +114.5% | n/r |
| 8 | Indiana University Kokomo | IN | 52.6 | 35.9 | 94.2 | pending | 117 | +77.3% | n/r |
| 9 | Fairfield University | CT | 79.3 | 73.6 | 93.7 | pending | 482 | +34.3% | n/r |
| 10 | Murray State University | KY | 69.8 | 60.3 | 93.5 | pending | 262 | +44.0% | n/r |
| 11 | University of Tennessee, Knoxville | TN | 91.3 | 92.7 | 92.4 | 87.5 | 1,713 | +39.4% | 51 |
| 12 | Norfolk State University | VA | 53.7 | 38.2 | 92.4 | pending | 118 | +68.6% | n/r |
| 13 | San Diego State University | CA | 84.7 | 84.5 | 91.9 | 79.5 | 2,332 | +32.8% | 46 |
| 14 | Appalachian State Univ | NC | 88.7 | 87.6 | 91.3 | pending | 1,065 | +35.3% | n/r |
| 15 | Montana State University | MT | 54.8 | 53.4 | 91 | 28.5 | 389 | +45.7% | 10 |
| 16 | Texas Christian University Fort | TX | 84.3 | 81.7 | 90.7 | pending | 701 | +34.0% | n/r |
| 17 | Indiana University Bloomington | IN | 91.9 | 89 | 90.6 | 98.7 | 2,444 | +20.4% | 68 |
| 18 | Trinity University San | TX | 60.4 | 48.3 | 90.5 | pending | 155 | +36.0% | n/r |
| 19 | Florida A&M University | FL | 57.7 | 44.6 | 90.5 | pending | 166 | +64.4% | n/r |
| 20 | University of Wisconsin–Madison | WI | 88.3 | 86.6 | 89.7 | 90.6 | 1,414 | +38.6% | 54 |
| 21 | University of The Cumberlands | KY | 67 | 58.1 | 89.4 | pending | 247 | +157.3% | n/r |
| 22 | University of North Texas at Dallas | TX | 67 | 58.1 | 89.4 | pending | 218 | +50.3% | n/r |
| 23 | University of Tampa | FL | 84.5 | 82.9 | 88.6 | pending | 768 | +30.2% | n/r |
| 24 | University of Rhode Island | RI | 75.5 | 70.3 | 88.6 | pending | 516 | +35.8% | n/r |
| 25 | Oral Roberts University | OK | 57.2 | 45 | 87.7 | pending | 134 | +22.9% | n/r |

## 7. Data sources & cost
- **IPEDS / NCES** complete data files (public, free): Completions `C2016–C2024_A` (9 years), enrollment `DRVEF2024` + `EFFY`, directory `HD2024`. Bulk download, no per-campus scraping.
- **Live DB** (read-only): campus identity, Greek chapters, council status/contacts, business clubs, first-party demand events.
- **API / data cost: $0** (all IPEDS data is public bulk; no paid APIs used).

## 8. Known limitations
- **Intro-1 is an estimate**, not measured course enrollment (business bachelor's × 2.4). Recalibrate against real samples.
- **IPEDS business/accounting is first-major bachelor's completions** (CIP 52 / 52.03, AWLEVEL 5). Some schools (e.g. Indiana–Bloomington) report all undergrad business under the general CIP 52.0101 and break out **no** accounting sub-code, so their accounting_bachelors reads 0 — faithful to IPEDS, not a defect.
- **2024 completions are the latest IPEDS release** (provisional/revised where `_RV` available); the year is preserved on every row, never relabeled "current".
- **Distribution Strength is partial** (112/627) and reflects the in-progress structural backfill; it is renormalized over available components with completeness stamped. Business-club components cover only ~9 campuses (NOT_AVAILABLE_YET) and are excluded, not zeroed.
- **Live Demand = COMING_SOON**: first-party events are too sparse / partially unattributed (practice_attempts has free-text campus) to score reliably; raw signal counts are exposed instead. Zero weight.
- **Course Readiness = COMING_SOON** (null, zero weight) — reserved for Course Intel.
- **36 duplicate campus groups** share a UNITID (pre-existing DB dups); flagged in `CAMPUS_IDENTITY_REVIEW.csv`, not merged.

## 9. Verdict
The standardized market layer (IPEDS identity, enrollment, business/accounting completions, concentration, growth trends, estimated Intro-1, **Market Opportunity**, **Growth Momentum**) is complete and reliable across 627 four-year campuses. Distribution Strength / Outreach Priority / Enrichment Priority are live on current data and will sharpen after the structural backfill via the refresh path.

### MARKET INTELLIGENCE READY FOR GROWTH DASHBOARD: **PARTIAL**
_(Market + Growth layers YES; Distribution/Outreach/Enrichment computed on current data, refresh after backfill; Course Readiness + Live Demand intentionally COMING_SOON.)_

**No deploy. No outreach sent. No campuses activated.**
