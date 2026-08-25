# Campus Market Intelligence — Report

_Generated 2026-08-24T12:00:00Z · scoring config v1 · IPEDS data year 2023_

> Independent, standardized market-intelligence layer built on public IPEDS/NCES data. **No deploy, no outreach sent.** Course Readiness is **COMING_SOON** (zero weight in current priority). Distribution Strength / Outreach Priority / Enrichment Priority are computed on **current** Greek/council data and are designed to be cheaply **refreshed** after the structural Campus Backfill settles.

## 1. Coverage & identity
| Metric | Value |
|---|---|
| Target universe (US, 4-yr + 2-yr, non-research-only) | **761** campuses |
| Matched to IPEDS UNITID | **715** (94%) |
| — 4-year institutions (primary market) | **607** |
| — 2-year institutions (community colleges, separate segment) | 106 |
| Identity failures → review queue | **65** |
| Duplicate campus rows sharing a UNITID (flagged, not merged) | 50 rows / 25 groups |

Match methods: exact_name=271, name_prefix=138, name_reverse=27, alias_exact=6, existing_unitid=273.

Review-queue reasons: low_conf_or_renamed=29, high_conf_suggestion_verify=25, no_candidate=1, aggregate_system_or_district=10. Systems/districts are intentionally **not** auto-matched to a single campus (per the "do not merge system campuses" rule).

## 2. The market (4-year primary segment, IPEDS 2023)
| Metric | Value |
|---|---|
| Total annual business bachelor's completions represented | **214,471** |
| Total annual accounting bachelor's completions | 23,536 |
| **Estimated annual Intro-1 opportunity** (business × 2.4) | **~514,737 students/yr** |
| | _ESTIMATED, NOT ACTUAL ENROLLMENT — low confidence_ |

## 3. Growth (5-year business completions, meaningful markets)
| Metric | Value |
|---|---|
| Median 5-yr business growth | -5.5% |
| Mean 5-yr business growth | -3.4% |
| RAPID_GROWTH campuses | **34** |
| GROWING campuses | 171 |
| DECLINING campuses | 204 |

## 4. Score distributions
**Market Opportunity (4-yr):** 90-100: 8 · 80-89: 59 · 70-79: 73 · 60-69: 72 · 50-59: 91 · <50: 304

**Distribution Strength coverage:** 112 of 607 four-year campuses have a Distribution Strength score today (Greek and/or council data present). The remaining 495 are **PENDING_BACKFILL** — their Outreach Priority currently renormalizes over Market Opportunity + Growth Momentum and will gain Distribution Strength on refresh.

## 5. Top 25 by Market Opportunity
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | University of Alabama | AL | 87.2 | 96.7 | 57.9 | 91.5 | 1,960 | -1.1% | 71 |
| 2 | University of Georgia | GA | 87.6 | 95.5 | 74.1 | 82.5 | 2,238 | +10.7% | 67 |
| 3 | University of Tennessee, Knoxville | TN | 90.8 | 92.5 | 90.8 | 87.5 | 1,564 | +38.8% | 51 |
| 4 | University of Houston | TX | 80.6 | 92.5 | 64.8 | 69.6 | 2,209 | +5.5% | 34 |
| 5 | Auburn University | AL | 91.1 | 92 | 84.6 | 94.4 | 1,426 | +32.2% | 55 |
| 6 | University of Arkansas | AR | 86.7 | 91.8 | 80.7 | 81.3 | 1,401 | +21.7% | 47 |
| 7 | Virginia Poly Inst & St Un | VA | 90.9 | 91.3 | 90 | pending | 1,756 | +40.0% | n/r |
| 8 | Florida International University | FL | 76.8 | 90.6 | 51.2 | 69.6 | 2,556 | +3.1% | 34 |
| 9 | University of Iowa Iowa | IA | 87.9 | 89.8 | 83.2 | pending | 1,206 | +25.1% | n/r |
| 10 | Liberty University | VA | 84.3 | 89.7 | 70.7 | pending | 1,810 | +12.7% | n/r |
| 11 | Indiana University Bloomington | IN | 92.6 | 89.3 | 93 | 98.7 | 2,484 | +28.7% | 68 |
| 12 | University of Houston - Downtown | TX | 89.2 | 89 | 89.7 | pending | 1,003 | +21.3% | n/r |
| 13 | Clemson University | SC | 88 | 88.9 | 91.4 | 83.5 | 1,224 | +42.0% | 48 |
| 14 | Calif State Univ, Northridge | CA | 77.9 | 88.9 | 50.5 | pending | 1,574 | -6.5% | n/r |
| 15 | Univ of Central Florida | FL | 77.4 | 88.6 | 49.3 | pending | 2,397 | -11.7% | n/r |
| 16 | Penn State University Univ | PA | 78.4 | 88.1 | 54 | pending | 1,792 | -5.1% | n/r |
| 17 | Utah Valley University | UT | 86.6 | 88 | 83.2 | pending | 887 | +29.5% | n/r |
| 18 | Temple University | PA | 67.3 | 87.8 | 16.1 | pending | 1,197 | -27.1% | n/r |
| 19 | University of Kentucky | KY | 86.6 | 87.7 | 75.3 | 93.3 | 1,074 | +13.8% | 57 |
| 20 | University of North Texas | TX | 81.7 | 87.4 | 75.1 | 75.4 | 1,454 | +10.1% | 40 |
| 21 | University of Mississippi | MS | 75.5 | 87.4 | 49.2 | 72.8 | 1,058 | -7.3% | 37 |
| 22 | DePaul University | IL | 72.7 | 87.3 | 36.2 | pending | 892 | -16.1% | n/r |
| 23 | Univ of Nebraska-Lincoln | NE | 82.4 | 86.9 | 71.1 | pending | 994 | +5.4% | n/r |
| 24 | Western Michigan University | MI | 85.9 | 86.2 | 85.2 | pending | 895 | +9.7% | n/r |
| 25 | Michigan State University East | MI | 70.7 | 86 | 32.3 | pending | 1,432 | -14.7% | n/r |

## 6. Top 25 growing meaningful markets
| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |
|--|--|--|--|--|--|--|--|--|--|
| 1 | Valencia College | FL | 83.7 | 77.2 | 99.9 | pending | 466 | — | n/r |
| 2 | Indiana University Kokomo | IN | 52.9 | 35 | 97.8 | pending | 113 | +54.8% | n/r |
| 3 | Prairie View A&M University | TX | 64.8 | 51.6 | 97.7 | pending | 209 | +88.3% | n/r |
| 4 | Fayetteville State Univ | NC | 68.6 | 57.4 | 96.7 | pending | 213 | +65.1% | n/r |
| 5 | Louisiana St in Shreveport | LA | 63.2 | 49.8 | 96.7 | pending | 171 | +111.1% | n/r |
| 6 | Texas Christian University Fort | TX | 86.2 | 82.1 | 96.5 | pending | 693 | +46.8% | n/r |
| 7 | University of Rochester | NY | 55.5 | 39.4 | 95.8 | pending | 189 | +71.8% | n/r |
| 8 | Lander University | SC | 61.5 | 48 | 95.1 | pending | 187 | +49.6% | n/r |
| 9 | Southeastern Oklahoma St | OK | 57.5 | 42.6 | 94.6 | pending | 124 | +36.3% | n/r |
| 10 | Southeastern Oklahoma State University | OK | 57.5 | 42.6 | 94.6 | pending | 124 | +36.3% | n/r |
| 11 | Utah Tech University | UT | 71 | 61.7 | 94.3 | pending | 228 | +72.7% | n/r |
| 12 | Lamar University | TX | 57.9 | 56.2 | 94.2 | 32.1 | 289 | +41.0% | 16 |
| 13 | Southern Utah University Cedar | UT | 69.4 | 59.8 | 93.4 | pending | 231 | +69.8% | n/r |
| 14 | Murray State University | KY | 68.8 | 59 | 93.2 | pending | 259 | +28.9% | n/r |
| 15 | Indiana University Bloomington | IN | 92.6 | 89.3 | 93 | 98.7 | 2,484 | +28.7% | 68 |
| 16 | University of Illinois | IL | 84 | 80.9 | 91.8 | pending | 878 | +43.9% | n/r |
| 17 | University of Illinois Chicago | IL | 66.5 | 73.6 | 91.8 | 32.1 | 878 | +43.9% | 16 |
| 18 | Clemson University | SC | 88 | 88.9 | 91.4 | 83.5 | 1,224 | +42.0% | 48 |
| 19 | Wayne State University | MI | 85.8 | 83.7 | 90.9 | pending | 830 | +29.5% | n/r |
| 20 | University of Tennessee, Knoxville | TN | 90.8 | 92.5 | 90.8 | 87.5 | 1,564 | +38.8% | 51 |
| 21 | San Diego State University San | CA | 86.5 | 85 | 90.4 | pending | 2,159 | +28.8% | n/r |
| 22 | San Diego State University | CA | 84.2 | 84.1 | 90.4 | 79.5 | 2,159 | +28.8% | 46 |
| 23 | Virginia Poly Inst & St Un | VA | 90.9 | 91.3 | 90 | pending | 1,756 | +40.0% | n/r |
| 24 | University of Houston - Downtown | TX | 89.2 | 89 | 89.7 | pending | 1,003 | +21.3% | n/r |
| 25 | Auburn Univ, Montgomery | AL | 56.9 | 43.9 | 89.5 | pending | 137 | +25.7% | n/r |

## 7. Data sources & cost
- **IPEDS / NCES** complete data files (public, free): Completions `C2015–C2023_A` (9 years), enrollment `DRVEF2023` + `EFFY`, directory `HD2023`. Bulk download, no per-campus scraping.
- **Live DB** (read-only): campus identity, Greek chapters, council status/contacts, business clubs, first-party demand events.
- **API / data cost: $0** (all IPEDS data is public bulk; no paid APIs used).

## 8. Known limitations
- **Intro-1 is an estimate**, not measured course enrollment (business bachelor's × 2.4). Recalibrate against real samples.
- **IPEDS business/accounting is first-major bachelor's completions** (CIP 52 / 52.03, AWLEVEL 5). Some schools (e.g. Indiana–Bloomington) report all undergrad business under the general CIP 52.0101 and break out **no** accounting sub-code, so their accounting_bachelors reads 0 — faithful to IPEDS, not a defect.
- **2023 completions are the latest IPEDS release** (provisional/revised where `_RV` available); the year is preserved on every row, never relabeled "current".
- **Distribution Strength is partial** (112/607) and reflects the in-progress structural backfill; it is renormalized over available components with completeness stamped. Business-club components cover only ~9 campuses (NOT_AVAILABLE_YET) and are excluded, not zeroed.
- **Live Demand = COMING_SOON**: first-party events are too sparse / partially unattributed (practice_attempts has free-text campus) to score reliably; raw signal counts are exposed instead. Zero weight.
- **Course Readiness = COMING_SOON** (null, zero weight) — reserved for Course Intel.
- **25 duplicate campus groups** share a UNITID (pre-existing DB dups); flagged in `CAMPUS_IDENTITY_REVIEW.csv`, not merged.

## 9. Verdict
The standardized market layer (IPEDS identity, enrollment, business/accounting completions, concentration, growth trends, estimated Intro-1, **Market Opportunity**, **Growth Momentum**) is complete and reliable across 607 four-year campuses. Distribution Strength / Outreach Priority / Enrichment Priority are live on current data and will sharpen after the structural backfill via the refresh path.

### MARKET INTELLIGENCE READY FOR GROWTH DASHBOARD: **PARTIAL**
_(Market + Growth layers YES; Distribution/Outreach/Enrichment computed on current data, refresh after backfill; Course Readiness + Live Demand intentionally COMING_SOON.)_

**No deploy. No outreach sent. No campuses activated.**
