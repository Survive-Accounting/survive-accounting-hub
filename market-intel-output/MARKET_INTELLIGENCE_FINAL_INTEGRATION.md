# Campus Market Intelligence — Final Integration

_Generated 2026-08-25T18:00:00Z · config v1 · IPEDS 2024 · post structural-backfill refresh_

> Structural Campus Backfill is **COMPLETE**. Distribution Strength, Outreach Priority, and Enrichment Priority were recomputed from current live Greek/council/contact data (cached IPEDS unchanged). **No deploy, no outreach sent.**

## 1. Conceptual separation (kept strict)
| Layer | Question | Fields |
|---|---|---|
| **WHO** | Is this a big/growing accounting market? | `market_opportunity_score` + `growth_momentum_score` (→ `who_score`) |
| **READINESS** | Can we actually reach & activate it? | `distribution_strength_score` + `distribution_data_completeness` |
| **WHAT** | What is the next step? | `recommended_next_action` |

**Guardrail:** Outreach Priority renormalizes over *available* components — a NOT_RUN signal is excluded, never scored 0 — so incomplete research can never make a strong market look weak. Now that the backfill is complete, a low Distribution score reflects a **real** readiness gap (researched, few contacts found), not missing research. WHO is never reduced by contact-research gaps.

## 2. Refresh impact (backfill effect on Distribution)
| Metric | Before | After |
|---|---|---|
| 4-yr institutions with a Distribution score | 488 | **664** |
| — newly scored this refresh | | 176 |
| 4-yr with Greek chapter data | | 219 |
| 4-yr with council research | | 579 |
| Avg Distribution data completeness | | 48% |

> **Key readiness finding:** Greek chapter data now covers **219/675** four-year institutions and council research found reachable contacts at 92. So even post-backfill, Distribution is *partial* for many strong markets: **84** campuses have MO ≥ 70 but Distribution < 30 (avg completeness ~41%) — councils were researched and few public contacts surfaced, and Greek is mostly still NOT_RUN. These are **not weak markets** — they are the top of the **Enrichment Priority** queue (their WHO is intact; their `recommended_next_action` is "Enrich structural data"). This is the guardrail working: a research gap routes a strong market to enrichment, it never zeroes its Outreach Priority.

## 3. Top 50 — three lenses side by side
Rank shifts show how **readiness** (Distribution) reorders a pure **market** list. `Δ` = movement from the Market-only rank to the Outreach-Priority rank.

### 3a. Market Opportunity only (WHO, demand size)
| # | Campus | MO | Biz grads | GM | →OP rank |
|--:|---|---|---|---|---|
| 1 | University of Alabama (AL) | 96.3 | 1924 | 61.3 | 6 |
| 2 | University of Georgia (GA) | 95.7 | 2331 | 79.6 | 5 |
| 3 | CUNY-Baruch College New (NY) | 95 | 2497 | 40.1 | 96 |
| 4 | University of Tennessee, Knoxville (TN) | 94 | 1713 | 92.6 | 7 |
| 5 | University of Houston (TX) | 93.6 | 2279 | 64.6 | 20 |
| 6 | Auburn University (AL) | 92.6 | 1526 | 87.1 | 1 |
| 7 | Florida International University (FL) | 92.6 | 2726 | 48.3 | 32 |
| 8 | University of Arkansas (AR) | 92.3 | 1475 | 77.5 | 13 |
| 9 | Clemson University (SC) | 91.8 | 1447 | 95.8 | 2 |
| 10 | Virginia Poly Inst & St Un (VA) | 91.3 | 1723 | 82.7 | 52 |
| 11 | Utah Valley University (UT) | 90.3 | 999 | 87.8 | 51 |
| 12 | Calif State Univ, Northridge (CA) | 89.6 | 1574 | 54.6 | 92 |
| 13 | Indiana University Bloomington (IN) | 89.3 | 2444 | 90.8 | 4 |
| 14 | University of Kentucky (KY) | 89.2 | 1109 | 86.4 | 10 |
| 15 | University of North Texas (TX) | 88.9 | 1495 | 71.4 | 22 |
| 16 | University of Mississippi (MS) | 88.1 | 1058 | 54.3 | 16 |
| 17 | Penn State University Univ (PA) | 88.1 | 1790 | 69.9 | 76 |
| 18 | University of Houston - Downtown (TX) | 87.9 | 1057 | 85.5 | 14 |
| 19 | Appalachian State Univ (NC) | 87.9 | 1065 | 91.5 | 53 |
| 20 | DePaul University (IL) | 87.8 | 935 | 56.3 | 98 |
| 21 | Univ of Central Florida (FL) | 87.8 | 2290 | 44.3 | 115 |
| 22 | University of Wisconsin–Madison (WI) | 87.7 | 1414 | 90 | 3 |
| 23 | University of Cincinnati-Main Campus (OH) | 87.6 | 1248 | 75 | 25 |
| 24 | University of South Florida (FL) | 87.5 | 1704 | 79.1 | 19 |
| 25 | Florida Atlantic University (FL) | 87.3 | 1389 | 75.3 | 15 |
| 26 | Michigan State University East (MI) | 87.3 | 1469 | 52.7 | 103 |
| 27 | Temple University (PA) | 87.2 | 1143 | 16.8 | 185 |
| 28 | University of Iowa (IA) | 86.4 | 1199 | 71.4 | 18 |
| 29 | San Diego State University (CA) | 86.1 | 2332 | 92.1 | 12 |
| 30 | Texas Tech University (TX) | 86 | 1440 | 87.6 | 26 |
| 31 | University of Nevada, Las Vegas (NV) | 86 | 1068 | 47.1 | 30 |
| 32 | Grand Valley State University Allendal (MI) | 85.8 | 939 | 47.4 | 119 |
| 33 | Texas A&M University Coll (TX) | 85.7 | 1809 | 52.4 | 111 |
| 34 | Western Michigan University (MI) | 85.6 | 847 | 65.8 | 90 |
| 35 | University of Florida (FL) | 85.3 | 1284 | 76.4 | 17 |
| 36 | University of Arizona (AZ) | 85.2 | 1159 | 66.4 | 29 |
| 37 | Illinois State University (IL) | 85.2 | 973 | 53.6 | 110 |
| 38 | Kennesaw State University (GA) | 85.1 | 1112 | 63.5 | 23 |
| 39 | University of Delaware (DE) | 85 | 914 | 75.9 | 9 |
| 40 | Boise State University (ID) | 84.9 | 862 | 86.7 | 65 |
| 41 | University of Texas at Austin (TX) | 84.6 | 1220 | 66.4 | 8 |
| 42 | California State University-Fullerton (CA) | 84.5 | 2254 | 52.8 | 28 |
| 43 | University of North Carolina at Charlotte (NC) | 84.3 | 1085 | 64 | 35 |
| 44 | North Carolina State University (NC) | 84.1 | 1157 | 84.5 | 11 |
| 45 | George Mason University (VA) | 84.1 | 1163 | 61.4 | 36 |
| 46 | Wayne State University (MI) | 83.8 | 867 | 76.7 | 78 |
| 47 | Un of Massachusetts Amherst (MA) | 83.7 | 1093 | 76.2 | 79 |
| 48 | University of Tampa (FL) | 83.4 | 768 | 88.8 | 66 |
| 49 | San Jose State University San (CA) | 83.2 | 1614 | 56.2 | 114 |
| 50 | Purdue University-Main Campus (IN) | 83.1 | 1062 | 70.9 | 21 |

### 3b. Market + Growth (WHO combined, 71% MO / 29% GM)
| # | Campus | WHO | MO | GM | label |
|--:|---|---|---|---|---|
| 1 | University of Tennessee, Knoxville (TN) | 93.6 | 94 | 92.6 | RAPID_GROWTH |
| 2 | Clemson University (SC) | 92.9 | 91.8 | 95.8 | RAPID_GROWTH |
| 3 | University of Georgia (GA) | 91.1 | 95.7 | 79.6 | GROWING |
| 4 | Auburn University (AL) | 91 | 92.6 | 87.1 | RAPID_GROWTH |
| 5 | Indiana University Bloomington (IN) | 89.7 | 89.3 | 90.8 | RAPID_GROWTH |
| 6 | Utah Valley University (UT) | 89.6 | 90.3 | 87.8 | RAPID_GROWTH |
| 7 | Appalachian State Univ (NC) | 88.9 | 87.9 | 91.5 | RAPID_GROWTH |
| 8 | Virginia Poly Inst & St Un (VA) | 88.8 | 91.3 | 82.7 | GROWING |
| 9 | University of Wisconsin–Madison (WI) | 88.4 | 87.7 | 90 | RAPID_GROWTH |
| 10 | University of Kentucky (KY) | 88.4 | 89.2 | 86.4 | RAPID_GROWTH |
| 11 | University of Arkansas (AR) | 88.1 | 92.3 | 77.5 | GROWING |
| 12 | San Diego State University (CA) | 87.8 | 86.1 | 92.1 | RAPID_GROWTH |
| 13 | University of Houston - Downtown (TX) | 87.2 | 87.9 | 85.5 | RAPID_GROWTH |
| 14 | Texas Tech University (TX) | 86.5 | 86 | 87.6 | RAPID_GROWTH |
| 15 | University of Alabama (AL) | 86.3 | 96.3 | 61.3 | GROWING |
| 16 | Boise State University (ID) | 85.4 | 84.9 | 86.7 | RAPID_GROWTH |
| 17 | University of Houston (TX) | 85.3 | 93.6 | 64.6 | GROWING |
| 18 | University of South Florida (FL) | 85.1 | 87.5 | 79.1 | GROWING |
| 19 | University of Tampa (FL) | 84.9 | 83.4 | 88.8 | RAPID_GROWTH |
| 20 | Texas Christian University Fort (TX) | 84.6 | 82.1 | 91 | RAPID_GROWTH |
| 21 | North Carolina State University (NC) | 84.2 | 84.1 | 84.5 | RAPID_GROWTH |
| 22 | University of Cincinnati-Main Campus (OH) | 84 | 87.6 | 75 | GROWING |
| 23 | Florida Atlantic University (FL) | 83.9 | 87.3 | 75.3 | GROWING |
| 24 | University of North Texas (TX) | 83.9 | 88.9 | 71.4 | GROWING |
| 25 | Middle Tennessee State Univ (TN) | 83.2 | 81.4 | 87.6 | RAPID_GROWTH |
| 26 | Penn State University Univ (PA) | 82.9 | 88.1 | 69.9 | GROWING |
| 27 | University of Florida (FL) | 82.8 | 85.3 | 76.4 | GROWING |
| 28 | Mississippi State University (MS) | 82.8 | 82.3 | 84.2 | RAPID_GROWTH |
| 29 | University of Illinois Chicago (IL) | 82.8 | 80.9 | 87.5 | RAPID_GROWTH |
| 30 | University of Delaware (DE) | 82.4 | 85 | 75.9 | GROWING |
| 31 | University of Iowa (IA) | 82.1 | 86.4 | 71.4 | GROWING |
| 32 | Wayne State University (MI) | 81.8 | 83.8 | 76.7 | GROWING |
| 33 | Un of Massachusetts Amherst (MA) | 81.6 | 83.7 | 76.2 | GROWING |
| 34 | Franklin University (OH) | 81.5 | 82.4 | 79.2 | GROWING |
| 35 | Minnesota St Univ Mankato (MN) | 81.3 | 79.1 | 86.7 | RAPID_GROWTH |
| 36 | Valencia College (FL) | 81.1 | 78.8 | 87 | RAPID_GROWTH |
| 37 | University of Utah Salt Lake (UT) | 80.6 | 78.5 | 85.7 | RAPID_GROWTH |
| 38 | Fairfield University (CT) | 80 | 74.4 | 93.9 | RAPID_GROWTH |
| 39 | Florida International University (FL) | 79.9 | 92.6 | 48.3 | STABLE |
| 40 | Western Michigan University (MI) | 79.9 | 85.6 | 65.8 | GROWING |
| 41 | University of Arizona (AZ) | 79.8 | 85.2 | 66.4 | GROWING |
| 42 | Purdue University-Main Campus (IN) | 79.6 | 83.1 | 70.9 | GROWING |
| 43 | Calif State Univ, Northridge (CA) | 79.6 | 89.6 | 54.6 | STABLE |
| 44 | University of Texas at Austin (TX) | 79.4 | 84.6 | 66.4 | GROWING |
| 45 | CUNY-Baruch College New (NY) | 79.3 | 95 | 40.1 | DECLINING |
| 46 | Boston College Chestnut (MA) | 79.1 | 78.3 | 81 | GROWING |
| 47 | Kennesaw State University (GA) | 78.9 | 85.1 | 63.5 | GROWING |
| 48 | DePaul University (IL) | 78.8 | 87.8 | 56.3 | STABLE |
| 49 | University of North Carolina at Charlotte (NC) | 78.5 | 84.3 | 64 | GROWING |
| 50 | University of Mississippi (MS) | 78.4 | 88.1 | 54.3 | STABLE |

### 3c. Outreach Priority (refreshed — WHO + READINESS)
| # | Campus | OP | MO | GM | Dist | compl | Next |
|--:|---|---|---|---|---|---|---|
| 1 | Auburn University (AL) | 92 | 92.6 | 87.1 | 94.8 | 50% | Greek council enrichment |
| 2 | Clemson University (SC) | 90.9 | 91.8 | 95.8 | 85.2 | 50% | Greek council enrichment |
| 3 | University of Wisconsin–Madison (WI) | 90.1 | 87.7 | 90 | 94.8 | 35% | Greek council enrichment |
| 4 | Indiana University Bloomington (IN) | 89.6 | 89.3 | 90.8 | 89.2 | 50% | Greek council enrichment |
| 5 | University of Georgia (GA) | 88.9 | 95.7 | 79.6 | 82.7 | 90% | Council outreach |
| 6 | University of Alabama (AL) | 87.7 | 96.3 | 61.3 | 91.5 | 90% | Council outreach |
| 7 | University of Tennessee, Knoxville (TN) | 86.3 | 94 | 92.6 | 66 | 50% | Greek council enrichment |
| 8 | University of Texas at Austin (TX) | 84.7 | 84.6 | 66.4 | 99.7 | 50% | Greek council enrichment |
| 9 | University of Delaware (DE) | 82.4 | 85 | 75.9 | 82.5 | 50% | Greek council enrichment |
| 10 | University of Kentucky (KY) | 82.3 | 89.2 | 86.4 | 65.2 | 50% | Greek council enrichment |
| 11 | North Carolina State University (NC) | 81.7 | 84.1 | 84.5 | 74.7 | 50% | Greek council enrichment |
| 12 | San Diego State University (CA) | 80.9 | 86.1 | 92.1 | 61.4 | 50% | Greek council enrichment |
| 13 | University of Arkansas (AR) | 80.7 | 92.3 | 77.5 | 60.1 | 50% | Greek council enrichment |
| 14 | University of Houston - Downtown (TX) | 80.6 | 87.9 | 85.5 | 62.2 | 75% | Council outreach |
| 15 | Florida Atlantic University (FL) | 79.3 | 87.3 | 75.3 | 66.6 | 50% | Greek council enrichment |
| 16 | University of Mississippi (MS) | 79 | 88.1 | 54.3 | 80.5 | 35% | Greek council enrichment |
| 17 | University of Florida (FL) | 78.9 | 85.3 | 76.4 | 68.1 | 50% | Greek council enrichment |
| 18 | University of Iowa (IA) | 78 | 86.4 | 71.4 | 66.6 | 50% | Greek council enrichment |
| 19 | University of South Florida (FL) | 77.7 | 87.5 | 79.1 | 57.1 | 50% | Greek council enrichment |
| 20 | University of Houston (TX) | 77.3 | 93.6 | 64.6 | 54.7 | 50% | Greek council enrichment |
| 21 | Purdue University-Main Campus (IN) | 77 | 83.1 | 70.9 | 69.7 | 75% | Council outreach |
| 22 | University of North Texas (TX) | 77 | 88.9 | 71.4 | 57.8 | 50% | Greek council enrichment |
| 23 | Kennesaw State University (GA) | 76.6 | 85.1 | 63.5 | 70.1 | 50% | Greek council enrichment |
| 24 | Mississippi State University (MS) | 76.4 | 82.3 | 84.2 | 58.4 | 50% | Greek council enrichment |
| 25 | University of Cincinnati-Main Campus (OH) | 76.2 | 87.6 | 75 | 54.5 | 90% | Council outreach |
| 26 | Texas Tech University (TX) | 75.7 | 86 | 87.6 | 45.5 | 50% | Greek council enrichment |
| 27 | University of Miami (FL) | 75.6 | 77.1 | 72.8 | 74.7 | 50% | Greek council enrichment |
| 28 | California State University-Fullerton (CA) | 75.4 | 84.5 | 52.8 | — | 0% | Enrich structural data |
| 29 | University of Arizona (AZ) | 75.2 | 85.2 | 66.4 | 62.2 | 50% | Greek council enrichment |
| 30 | University of Nevada, Las Vegas (NV) | 73.8 | 86 | 47.1 | 70.9 | 90% | Council outreach |
| 31 | University of Illinois Chicago (IL) | 73.7 | 80.9 | 87.5 | 48.4 | 50% | Greek council enrichment |
| 32 | Florida International University (FL) | 73.3 | 92.6 | 48.3 | 54.7 | 50% | Greek council enrichment |
| 33 | University of Southern California (CA) | 72.8 | 81.8 | 61 | 64.1 | 50% | Greek council enrichment |
| 34 | California State Polytechnic University-Pomona (CA) | 72.3 | 82.7 | 46.3 | — | 0% | Enrich structural data |
| 35 | University of North Carolina at Charlotte (NC) | 71.9 | 84.3 | 64 | 53.6 | 50% | Greek council enrichment |
| 36 | George Mason University (VA) | 71.8 | 84.1 | 61.4 | 55.5 | 50% | Greek council enrichment |
| 37 | James Madison University (VA) | 71.4 | 76.5 | 50.7 | 77.9 | 75% | Council outreach |
| 38 | University of California-Riverside (CA) | 69.2 | 69.6 | 68.1 | — | 0% | Enrich structural data |
| 39 | Binghamton University (NY) | 69.2 | 73.5 | 69.7 | 60.1 | 50% | Greek council enrichment |
| 40 | Texas A&M University (TX) | 69.1 | 73.8 | 58.6 | 68.1 | 50% | Greek council enrichment |
| 41 | University of North Texas at Dallas (TX) | 68.8 | 63.1 | 89.6 | 63.7 | 75% | Council outreach |
| 42 | College of Charleston (SC) | 68.4 | 74.5 | 57.3 | 65 | 75% | Council outreach |
| 43 | Northeastern University (MA) | 68.4 | 76.1 | 72 | 50.1 | 50% | Greek council enrichment |
| 44 | Oregon State University (OR) | 68.2 | 78.8 | 50.4 | 61.4 | 50% | Greek council enrichment |
| 45 | Syracuse University (NY) | 68.1 | 70.1 | 74.7 | 58.7 | 50% | Greek council enrichment |
| 46 | The University of Texas at San Antonio (TX) | 67.8 | 82.9 | 54.5 | 48.4 | 50% | Greek council enrichment |
| 47 | Western Kentucky University (KY) | 67.6 | 76.6 | 62.6 | 53.6 | 50% | Greek council enrichment |
| 48 | University of North Carolina at Greensboro (NC) | 66.5 | 74.5 | 62.6 | 53.6 | 35% | Research + intro outreach |
| 49 | Virginia Commonwealth University (VA) | 66.2 | 71.2 | 53.6 | — | 0% | Enrich structural data |
| 50 | The University of Texas at Dallas (TX) | 66.1 | 81 | 57.8 | 42.8 | 50% | Greek council enrichment |

## 4. Major movers (Outreach Priority work-queue rank: pre-refresh → post-refresh)
**Read this first:** completing the backfill gave a Distribution score to **176** campuses that previously had none. Distribution is 25% of Outreach Priority, so every strong market that lacked contact data saw its *absolute* OP compress **down** toward the readiness-adjusted level — 233 fell, 442 unchanged, 0 rose. That compression is uniform and expected, so absolute OP is **not** the mover signal. **Rank in the work queue is** — a campus with real readiness now ranks higher even though its number fell, because weaker-readiness peers fell further. WHO (MO/GM) is untouched by the backfill.

### 4a. Biggest rank risers (readiness data promoted them up the queue)
| # | Campus | rank b→a | Δrank | Dist | Greek | council | MO |
|--:|---|---|---|---|---|---|---|
| 1 | University of Southern Indiana (IN) | 202 → 139 | +63 | 49.3→49.3 | 12→12 | 3→3 | 55.3 |
| 2 | Loyola Marymount Univ Los (CA) | 198 → 136 | +62 | 0→0 | —→— | 0→0 | 72.6 |
| 3 | University of Wisconsin–Oshkosh (WI) | 199 → 137 | +62 | 49→49 | 17→17 | 3→3 | 59.7 |
| 4 | Univ of Hawaii at Manoa (HI) | 203 → 142 | +61 | 0→0 | —→— | 0→0 | 78.7 |
| 5 | Univ of Nebraska-Lincoln (NE) | 189 → 129 | +60 | 0→0 | —→— | 0→0 | 83 |
| 6 | Georgia Southern University (GA) | 190 → 131 | +59 | 0→0 | —→— | 0→0 | 80.5 |
| 7 | Seminole State College of Florida (FL) | 191 → 132 | +59 | 67.1→67.1 | 54→54 | 3→3 | 55.9 |
| 8 | East Carolina University (NC) | 193 → 134 | +59 | 1.8→1.8 | 1→1 | 0→0 | 71.8 |
| 9 | Sacred Heart University (CT) | 205 → 146 | +59 | 0→0 | —→— | 0→0 | 72.4 |
| 10 | Tennessee at Chattanooga (TN) | 206 → 147 | +59 | 0→0 | —→— | 0→0 | 72.5 |
| 11 | Indiana University Indianapolis (IN) | 207 → 148 | +59 | 50.9→50.9 | 19→19 | 3→3 | 63.2 |
| 12 | Murray State University (KY) | 208 → 149 | +59 | 0→0 | —→— | 0→0 | 61.8 |
| 13 | Fayetteville State Univ (NC) | 209 → 150 | +59 | 0→0 | —→— | 0→0 | 60.6 |
| 14 | Montclair State University (NJ) | 160 → 102 | +58 | 0→0 | —→— | 0→0 | 82.3 |
| 15 | Texas A&M - Corpus Christi Corp (TX) | 186 → 128 | +58 | 0→0 | —→— | 0→0 | 69.9 |

### 4b. Biggest rank fallers (real readiness gap now visible — still strong WHO)
| # | Campus | rank b→a | Δrank | Dist | compl | MO | GM |
|--:|---|---|---|---|---|---|---|
| 1 | Penn Western Univ-Clarion (PA) | 201 → 384 | -183 | —→0 | 40% | 53 | — |
| 2 | Commonweath Univ - Bloomsb (PA) | 86 → 242 | -156 | —→0 | 40% | 68.1 | — |
| 3 | Chipola College (FL) | 310 → 448 | -138 | —→0 | 40% | 28.7 | 79.1 |
| 4 | Rice University (TX) | 312 → 449 | -137 | —→0 | 40% | 23.4 | 92.1 |
| 5 | Augustana College IL Rock (IL) | 315 → 452 | -137 | —→0 | 40% | 41.1 | 46.3 |
| 6 | City Vision University (MO) | 320 → 456 | -136 | —→0 | 40% | 23.1 | 89.9 |
| 7 | Weatherford College (TX) | 325 → 461 | -136 | —→0 | 40% | 31.3 | 68 |
| 8 | The Citadel (SC) | 303 → 438 | -135 | —→0 | 40% | 47.6 | 34 |
| 9 | SUNYat New Paltz New (NY) | 319 → 454 | -135 | —→0 | 40% | 49.6 | 24.2 |
| 10 | Stetson University (FL) | 300 → 434 | -134 | —→0 | 40% | 49.9 | 28.8 |
| 11 | St. Mary's University San (TX) | 299 → 432 | -133 | —→0 | 40% | 39.1 | 56.6 |
| 12 | Kutztown Univ of Penn (PA) | 304 → 437 | -133 | —→0 | 40% | 49.7 | 28.5 |
| 13 | Harding University (AR) | 330 → 463 | -133 | —→0 | 40% | 41.9 | 40.9 |
| 14 | Saint Xavier University (IL) | 337 → 469 | -132 | —→0 | 40% | 43 | 35.5 |
| 15 | University of Portland (OR) | 343 → 475 | -132 | —→0 | 40% | 37.5 | 47.4 |

_A rank faller with high MO/GM is **not** a weak market — it is a strong market with a readiness gap. Route it to **Enrichment Priority** (find contacts) rather than dropping it._

## 5. Dashboard-ready view
A Growth dashboard consumes **`campus_market_intelligence_card`** (Postgres view, joined to `campuses`). Exact fields:

```
campus_id, campus, state, ipeds_unitid, segment, outreach_priority_score, market_opportunity_score, growth_momentum_score, growth_label, distribution_strength_score, distribution_data_completeness, course_readiness_status, course_readiness_score, live_demand_status, estimated_intro1_annual, business_bachelors, business_growth_5y, greek_chapters, councils_present, enrichment_priority_score, recommended_next_action, action_suppressed, top_drivers, market_data_completeness, generated_at
```

Order by `outreach_priority_score desc nulls last` for the work queue; `enrichment_priority_score desc` for the research queue. `action_suppressed=true` rows should be held out of the live queue (opt-out / recent-touch / active convo).

### Scoring versions (all configurable in `src/lib/market-intel/scoring-config.json`)
| Score | Version | Weights |
|---|---|---|
| Market Opportunity | market_opportunity_v1 | 40% biz/Intro-1 · 20% undergrad · 15% biz concentration · 15% Greek · 10% accounting |
| Growth Momentum | growth_momentum_v1 | 40% 5Y CAGR · 25% 3Y growth · 15% share change · 10% undergrad trend · 10% accounting trend |
| Distribution Strength | distribution_strength_v1 | 35% Greek · 25% council contacts · 15% role inboxes · 10% chapter contacts · 10% WIB · 5% finance (renormalized over researched) |
| Outreach Priority | outreach_priority_v1 | 50% Market · 25% Distribution · 20% Growth · 5% Live Demand (renorm.) · **0% Course Readiness** |
| Enrichment Priority | enrichment_priority_v1 | Market Opportunity × missing structural intelligence |
| Course Readiness | course_readiness_v1 | **COMING_SOON — score null, weight 0** |
| Live Demand | live_demand_v1 | **COMING_SOON / NOT_CONNECTED — excluded via renormalization** |

_Intro-1 estimate: business bachelor's × 2.4 (confidence: low). ESTIMATED, NOT ACTUAL ENROLLMENT._