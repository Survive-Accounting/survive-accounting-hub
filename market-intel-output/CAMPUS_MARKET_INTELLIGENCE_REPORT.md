# Campus Market Intelligence — Report

_Generated 2026-08-25T02:00:00Z · scoring config v1 · IPEDS data year 2024_

> Independent, standardized market-intelligence layer built on public IPEDS/NCES data. **No deploy, no outreach sent.** Course Readiness is **COMING_SOON** (zero weight in current priority). Distribution Strength / Outreach Priority / Enrichment Priority are computed on **current** Greek/council data and are designed to be cheaply **refreshed** after the structural Campus Backfill settles.

## 1. Coverage & identity
| Metric | Value |
|---|---|
| Target universe (US, 4-yr + 2-yr, non-research-only) | **761** campuses |
| Matched to IPEDS UNITID | **713** (94%) |
| — 4-year institutions (primary market) | **610** |
| — 2-year institutions (community colleges, separate segment) | 101 |
| Identity failures → review queue | **67** |
| Duplicate campus rows sharing a UNITID (flagged, not merged) | 48 rows / 24 groups |

Match methods: exact_name=268, name_prefix=138, name_reverse=28, alias_exact=6, existing_unitid=273.

Review-queue reasons: low_conf_or_renamed=29, high_conf_suggestion_verify=27, no_candidate=1, aggregate_system_or_district=10. Systems/districts are intentionally **not** auto-matched to a single campus (per the "do not merge system campuses" rule).

## 2. The market (4-year primary segment, IPEDS 2024)
| Metric | Value |
|---|---|
| Total annual business bachelor's completions represented | **214,454** |
| Total annual accounting bachelor's completions | 22,516 |
| **Estimated annual Intro-1 opportunity** (business × 2.4) | **~514,691 students/yr** |
| | _ESTIMATED, NOT ACTUAL ENROLLMENT — low confidence_ |

## 3. Growth (5-year business completions, meaningful markets)
| Metric | Value |
|---|---|
| Median 5-yr business growth | -6.7% |
| Mean 5-yr business growth | +10.6% |
| RAPID_GROWTH campuses | **49** |
| GROWING campuses | 161 |
| DECLINING campuses | 210 |

## 4. Score distributions
**Market Opportunity (4-yr):** 90-100: 11 · 80-89: 52 · 70-79: 77 · 60-69: 73 · 50-59: 90 · <50: 307

**Distribution Strength coverage:** 112 of 610 four-year campuses have a Distribution Strength score today (Greek and/or council data present). The remaining 498 are **PENDING_BACKFILL** — their Outreach Priority currently renormalizes over Market Opportunity + Growth Momentum and will gain Distribution Strength on refresh.

## 5. Top 25 by Market Opportunity
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | University of Alabama | AL | 87.6 | 96.4 | 60.7 | 91.5 | 1,924 | -1.4% | 71 |
| 2 | University of Georgia | GA | 88.7 | 95.6 | 79.1 | 82.5 | 2,331 | +19.6% | 67 |
| 3 | University of Tennessee, Knoxville | TN | 91.4 | 93 | 92.3 | 87.5 | 1,713 | +39.4% | 51 |
| 4 | Auburn University | AL | 91.8 | 92.6 | 86.7 | 94.4 | 1,526 | +28.3% | 55 |
| 5 | University of Houston | TX | 80.6 | 92.4 | 64.8 | 69.6 | 2,279 | +5.5% | 34 |
| 6 | University of Arkansas | AR | 85.9 | 91.6 | 77.2 | 81.3 | 1,475 | +10.1% | 47 |
| 7 | Virginia Poly Inst & St Un | VA | 88.6 | 91.3 | 82 | pending | 1,723 | +23.4% | n/r |
| 8 | Florida International University | FL | 76.6 | 91.3 | 48.7 | 69.6 | 2,726 | -2.3% | 34 |
| 9 | Liberty University | VA | 84.6 | 90.7 | 69.4 | pending | 1,962 | +5.7% | n/r |
| 10 | Clemson University | SC | 89.6 | 90.3 | 95.7 | 83.5 | 1,447 | +54.3% | 48 |
| 11 | Utah Valley University | UT | 89.4 | 90.2 | 87.4 | pending | 999 | +35.5% | n/r |
| 12 | University of Iowa Iowa | IA | 84.6 | 89.9 | 71.2 | pending | 1,199 | +9.2% | n/r |
| 13 | Calif State Univ, Northridge | CA | 79.6 | 89.6 | 54.5 | pending | 1,574 | -5.8% | n/r |
| 14 | Indiana University Bloomington | IN | 92 | 89.2 | 90.5 | 98.7 | 2,444 | +20.4% | 68 |
| 15 | University of Kentucky | KY | 89.6 | 89.1 | 86 | 93.3 | 1,109 | +19.8% | 57 |
| 16 | University of Houston - Downtown | TX | 87.9 | 89 | 85 | pending | 1,057 | +20.0% | n/r |
| 17 | University of North Texas | TX | 81.1 | 88 | 71 | 75.4 | 1,495 | +5.3% | 40 |
| 18 | Appalachian State Univ | NC | 88.8 | 87.8 | 91.2 | pending | 1,065 | +35.3% | n/r |
| 19 | Penn State University Univ | PA | 82.5 | 87.8 | 69.1 | pending | 1,790 | +9.4% | n/r |
| 20 | DePaul University | IL | 78.6 | 87.6 | 56 | pending | 935 | -8.0% | n/r |
| 21 | Univ of Central Florida | FL | 75 | 87.3 | 44.4 | pending | 2,290 | -14.5% | n/r |
| 22 | Michigan State University East | MI | 77.3 | 87 | 52.9 | pending | 1,469 | -7.7% | n/r |
| 23 | Temple University | PA | 67.2 | 87 | 17.8 | pending | 1,143 | -32.7% | n/r |
| 24 | University of Wisconsin–Madison | WI | 88.4 | 86.9 | 89.6 | 90.6 | 1,414 | +38.6% | 54 |
| 25 | University of Mississippi | MS | 76.2 | 86.9 | 53.9 | 72.8 | 1,058 | -13.4% | 37 |

## 6. Top 25 growing meaningful markets
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | Morehouse College | GA | 44.2 | 40.6 | 97.8 | 8.4 | 150 | +74.4% | 5 |
| 2 | Southern Utah University Cedar | UT | 72.9 | 63.4 | 96.5 | pending | 265 | +79.0% | n/r |
| 3 | Lander University | SC | 64 | 51.1 | 96.1 | pending | 213 | +60.2% | n/r |
| 4 | Fayetteville State Univ | NC | 69.6 | 59.1 | 95.8 | pending | 234 | +74.6% | n/r |
| 5 | Louisiana State University Alexandria | LA | 67 | 55.5 | 95.8 | pending | 160 | +100.0% | n/r |
| 6 | Clemson University | SC | 89.6 | 90.3 | 95.7 | 83.5 | 1,447 | +54.3% | 48 |
| 7 | Univ of California San Diego La | CA | 69.5 | 59.5 | 94.6 | pending | 429 | +114.5% | n/r |
| 8 | Indiana University Kokomo | IN | 52.8 | 36.3 | 94.1 | pending | 117 | +77.3% | n/r |
| 9 | Fairfield University | CT | 79.3 | 73.6 | 93.6 | pending | 482 | +34.3% | n/r |
| 10 | Murray State University | KY | 69.8 | 60.3 | 93.4 | pending | 262 | +44.0% | n/r |
| 11 | Norfolk State University | VA | 53.9 | 38.5 | 92.4 | pending | 118 | +68.6% | n/r |
| 12 | University of Tennessee, Knoxville | TN | 91.4 | 93 | 92.3 | 87.5 | 1,713 | +39.4% | 51 |
| 13 | San Diego State University San | CA | 87.5 | 85.8 | 91.8 | pending | 2,332 | +32.8% | n/r |
| 14 | San Diego State University | CA | 84.9 | 84.8 | 91.8 | 79.5 | 2,332 | +32.8% | 46 |
| 15 | Appalachian State Univ | NC | 88.8 | 87.8 | 91.2 | pending | 1,065 | +35.3% | n/r |
| 16 | Montana State University | MT | 54.7 | 53.4 | 90.8 | 28.5 | 389 | +45.7% | 10 |
| 17 | Indiana University Bloomington | IN | 92 | 89.2 | 90.5 | 98.7 | 2,444 | +20.4% | 68 |
| 18 | Texas Christian University Fort | TX | 84.3 | 81.8 | 90.5 | pending | 701 | +34.0% | n/r |
| 19 | Florida A&M University | FL | 57.8 | 44.7 | 90.5 | pending | 166 | +64.4% | n/r |
| 20 | Trinity University San | TX | 60.6 | 48.7 | 90.4 | pending | 155 | +36.0% | n/r |
| 21 | University of Wisconsin–Madison | WI | 88.4 | 86.9 | 89.6 | 90.6 | 1,414 | +38.6% | 54 |
| 22 | University of The Cumberlands | KY | 67.1 | 58.2 | 89.5 | pending | 247 | +157.3% | n/r |
| 23 | University of North Texas at Dallas | TX | 67 | 58.1 | 89.3 | pending | 218 | +50.3% | n/r |
| 24 | University of Rhode Island | RI | 75.5 | 70.4 | 88.4 | pending | 516 | +35.8% | n/r |
| 25 | University of Tampa | FL | 84.4 | 82.8 | 88.3 | pending | 768 | +30.2% | n/r |

## 7. Data sources & cost
- **IPEDS / NCES** complete data files (public, free): Completions `C2016–C2024_A` (9 years), enrollment `DRVEF2024` + `EFFY`, directory `HD2024`. Bulk download, no per-campus scraping.
- **Live DB** (read-only): campus identity, Greek chapters, council status/contacts, business clubs, first-party demand events.
- **API / data cost: $0** (all IPEDS data is public bulk; no paid APIs used).

## 8. Known limitations
- **Intro-1 is an estimate**, not measured course enrollment (business bachelor's × 2.4). Recalibrate against real samples.
- **IPEDS business/accounting is first-major bachelor's completions** (CIP 52 / 52.03, AWLEVEL 5). Some schools (e.g. Indiana–Bloomington) report all undergrad business under the general CIP 52.0101 and break out **no** accounting sub-code, so their accounting_bachelors reads 0 — faithful to IPEDS, not a defect.
- **2024 completions are the latest IPEDS release** (provisional/revised where `_RV` available); the year is preserved on every row, never relabeled "current".
- **Distribution Strength is partial** (112/610) and reflects the in-progress structural backfill; it is renormalized over available components with completeness stamped. Business-club components cover only ~9 campuses (NOT_AVAILABLE_YET) and are excluded, not zeroed.
- **Live Demand = COMING_SOON**: first-party events are too sparse / partially unattributed (practice_attempts has free-text campus) to score reliably; raw signal counts are exposed instead. Zero weight.
- **Course Readiness = COMING_SOON** (null, zero weight) — reserved for Course Intel.
- **24 duplicate campus groups** share a UNITID (pre-existing DB dups); flagged in `CAMPUS_IDENTITY_REVIEW.csv`, not merged.

## 9. Verdict
The standardized market layer (IPEDS identity, enrollment, business/accounting completions, concentration, growth trends, estimated Intro-1, **Market Opportunity**, **Growth Momentum**) is complete and reliable across 610 four-year campuses. Distribution Strength / Outreach Priority / Enrichment Priority are live on current data and will sharpen after the structural backfill via the refresh path.

### MARKET INTELLIGENCE READY FOR GROWTH DASHBOARD: **PARTIAL**
_(Market + Growth layers YES; Distribution/Outreach/Enrichment computed on current data, refresh after backfill; Course Readiness + Live Demand intentionally COMING_SOON.)_

**No deploy. No outreach sent. No campuses activated.**
