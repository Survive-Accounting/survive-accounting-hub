# Morning Audit — Competitive Market Intelligence

_Read-only audit of the overnight run. No ads created, no prices changed, no new searches. All figures come from public search results + public marketing pages captured overnight and stored in `competitive-intel-output/` + `scripts/competitive-intel/data/`._

---

## 1. Coverage

| Metric | Value |
|---|---|
| Campuses researched | **766** (full target universe, ranked by Market Opportunity) |
| Live SERP searches (main discovery) | **3,629** (~$29) |
| Unique successful searches cached | 3,636 |
| Study Edge deep-dive live searches | 14 (+15 page scrapes) |
| Competitor × campus observations | **4,825** |
| Unique competitors | **653** |
| Campuses with a paid academic-support business | **619 (81%)** |
| Campuses with a paid Intro-Accounting competitor | **579 (76%)** |
| Campuses with a course-specific competitor site | **312 (41%)** |
| Campuses with observed sponsored ads | **32** |

> ~500–1,000 additional query attempts were **rate-limited (empty)** by the concurrently-running growth SERP job sharing the same SerpAPI account. I did not pause that job. Re-running `discover.mjs --force` when it idles will fill the gap cheaply (cache + fresh calls).

---

## 2. Study-Edge-like businesses

**The Study Edge model** (UF): campus-specific + course-specific + video/exam reviews + practice/mock exams + subscription. Counting businesses that match that shape (excluding pure national notes-marketplaces, which are a different category):

| Model cluster | Count |
|---|---|
| STUDY_EDGE_MODEL (course-code site, video + practice) | **24** |
| COURSE_SPECIFIC_TUTORING_PLATFORM | 6 |
| MULTI_CAMPUS_REGIONAL (campus/course-specific tutoring co.) | 4 |
| **Total campus/course-specific paid businesses** | **~34** |

### The single biggest finding: a nationwide course-code site network
A cluster of near-identical **course-code domains** — each a campus/course-specific site with **video walkthroughs + practice exams + study guides** — blankets a large share of the target universe. Same template, different course code:

| Site | Campus footprint (named) | Accounting | Format | Pricing | Adoption evidence |
|---|---|---|---|---|---|
| **acct2301.com** | 22 (UH, UT-Dallas, Texas State, SFA, UTA, SHSU, UTRGV, SMU…) | YES (ACCT 2301 Financial) | video + practice exams + study guides | gated (not public) | Ranks organically across 22 TX campuses' course queries |
| **acct201a.com** | 20 (Montclair, Old Dominion, Towson, Louisville, Loyola-Chicago…) | YES | video + practice + guides | gated | 20-campus footprint |
| **acct2001.com** | 14 (UGA, UT-Knoxville, Clemson, UNT, Temple, SDSU, Iowa, Kennesaw, NC State, GSU, Arizona, LSU…) | YES | video + practice + guides | gated | 14 high-MO campuses |
| **acc201uky.com** | 14–20 (Kentucky, UCF, UNLV, Missouri State, UNC-Greensboro, Ball State, TCNJ…) | YES (adds exam reviews) | video + practice + exam reviews + guides | gated | Strongest single "strongest-competitor" across the dataset |
| **acg2021fiu.com** | UF, USF, FIU (FL ACG 2021) | YES (ACG 2021 Financial) | video + practice | gated | The Florida ACG-2021 analog — competes with Study Edge directly |
| **acct2300.com / acct2100.com / acct2110.com / acct200ku.com / acct229.com / busa201.com** | 8–11 each | YES | video + practice | gated | Course-code sites spanning TX, OH, KS, AL, NY, etc. |

**Other campus/course-specific platforms (branded):**

| Competitor | Model | Footprint (campuses seen) | Accounting | Format | Pricing |
|---|---|---|---|---|---|
| **Wize Prep** | Multi-campus exam-prep platform (closest branded Study-Edge analog) | 89 | YES | video reviews + practice exams + exam reviews | subscription (gated) |
| **FrogTutoring** | Multi-campus 1-on-1 tutoring | 258 | YES | one-on-one, campus pages | quote/hourly |
| **Knack** | University-partnered peer tutoring | 41 | YES | one-on-one, campus-branded | per-session |
| **Skoolers Tutoring** | Multi-campus tutoring | 15 | YES | one-on-one + course pages | quote |

**Study Edge itself** (UF): ACG2021 + ACG2071, **7-day free trial**, **~$50–90/mo**, campus-specific pages, **15 named tutors/professors**, full stack (video, mock exams, exam reviews, live reviews, 1-on-1, study guides).

> National notes/Q&A marketplaces (Course Hero 445 campuses, Studocu 310, Quizlet 301, Scribd, Stuvia) also have course-specific pages but are a **different model** (user-generated documents, not taught review) — tracked separately.

---

## 3. Market validation

| Classification | Campuses | Meaning |
|---|---|---|
| **CROWDED** | 302 | Multiple paid competitors incl. a local/course-specific one — demand strongly proven |
| **VALIDATED_PAID_MARKET** | 127 | A local/course-specific paid competitor exists — demand proven |
| **WHITE_SPACE** | 56 | Strong fundamentals (MO ≥ 55), no local paid competitor detected — first-mover lane |
| **LOW_EVIDENCE** | 281 | Thin search evidence (usually no course code / small school) |

Proven-paid-market: **HIGH 479 · MEDIUM 33 · LOW 107 · UNKNOWN 147.** Intro-accounting paid-market: **STRONG 475 · MODERATE 110 · WEAK 34 · UNKNOWN 147.**

**Strongest demonstrated willingness to pay** = the CROWDED + high-MO campuses where the course-code network + Wize Prep + marketplaces all appear: University of Houston, University of North Texas, Clemson, UCF, USF, UNLV, University of Florida, University of Arizona, Auburn, Kennesaw State, Georgia State. (Full ranked list: `TOP_VALIDATED_PAID_CAMPUSES.csv` / §Final below.)

---

## 4. Pricing

Most campus/course-specific sites **gate pricing behind sign-in**, so public price coverage is partial (46 sites with any public price). Where observable:

| Bucket | n | Range (min–median–max) | Read |
|---|---|---|---|
| Monthly subscription | 3 public | $29 – $34 – ($359 outlier) | Study Edge $50–90/mo is the anchor |
| 1-on-1 / hourly | 10 | $14 – $19 – $100 /hr | Marketplace tutor rates (Wyzant/Varsity/Preply) |
| One-time / bundle / unlabeled | 178 | ~$20 – $33 – (noisy) | Course-site bundles + mixed page numbers |
| Per-exam / semester | — | not publicly posted | Gated |

**Study Edge observed:** $25, $50/mo, $60, $75/mo, $90/mo + 7-day free trial.

### How Survive's intended pricing sits (from `src/lib/terms.ts` — not changed)
- **$100/seat** ($90/seat at the 30-pack), **10-seat chapter minimum**, group/chapter model.
- Covers the **full exam series (Exam 1/2/3/Final) for the term**, plus a **free Exam-1 / starter map**.
- **One-time, not recurring.**

**Relative position:** Study Edge at $50–90/**month** ≈ **$200–450 per student over a semester**; marketplace 1-on-1 runs $15–100/**hour**. Survive at **~$90–100 per student, once, for the whole course** is **materially cheaper per student per term** and removes recurring-subscription friction — while the **free Exam-1** undercuts every gated competitor at the top of funnel. Pricing is a genuine advantage; the gap to close is **format depth** (see §6).

---

## 5. UF / Study Edge

**What Study Edge offers UF:** expert-led sessions, mock exams, video reviews, exam reviews, live reviews, 1-on-1, study guides for **ACG2021 Financial** + **ACG2071 Managerial**; **campus-specific pages**; **15 named tutors**; **7-day free trial**; **~$50–90/mo**.

**Most strategically relevant:** UF is **CROWDED / proven-HIGH** (21 paid competitors incl. the `acg2021fiu.com` course-code analog) — this is a **validated paying market**, not a gamble. Study Edge has trained UF students to pay for supplemental accounting help; the buying behavior already exists.

**What makes Study Edge strong:**
1. **Exact course + professor mapping** (named instructors) — feels bespoke to the student's section.
2. **Full format stack** — video + mock exams + live + 1-on-1 under one subscription.
3. **Free-trial funnel** (7 days, all features) lowers first-touch risk.
4. **Local brand equity** at UF/FSU/UCF built over years.

**Where Survive is meaningfully differentiated:**
- **Price/structure:** one-time ~$90–100 for the whole course vs $50–90/**month**; free Exam-1 vs 7-day trial.
- **Exam-outcome focus:** CEQ practice + exam maps target the exact thing students pay for (passing the exam), not general GPA support.
- **Chapter/group distribution** (Greek + business clubs) — a channel Study Edge doesn't use, lowering CAC.
- **No recurring-billing friction** — a frequent student complaint about subscriptions.

_(Full brief: `UF_STUDY_EDGE_COMPETITIVE_BRIEF.md`. Positioning stays honest — lead with what Survive does for the UF course, no comparative claims.)_

---

## 6. Paid search (observed)

**32 campuses** showed sponsored results. By query type:

| Query type | Ads observed | Advertisers |
|---|---|---|
| **Course-code** (`ACC 201 tutoring`, `ACCT 2301 tutoring`…) | **38** | **Varsity Tutors (17)**, Preply (11), Wyzant |
| **Generic accounting** (`ACCT 200 accounting`) | 7 | Intuit (QuickBooks), Northwestern (SPS) |
| **Competitor-brand** (Study Edge, etc.) | **0 observed** | — (no advertiser bid on competitor brands in our snapshots) |

**Key read:** the only sustained paid-search competitor on **course-code + tutoring intent** is **Varsity Tutors** (and Preply), across UT-Austin ACC 311, UCF/UNLV/Missouri State ACC 201, MTSU ACTG 2110, Lehigh ACCT 151, etc. The **course-code network sites rank organically, not via ads** — so paid search on course-code terms is comparatively **uncontested by the exam-prep players**.

**Promising future experiments (research only — no campaigns created):**
- **NON-BRAND HIGH-INTENT:** `<course_code> exam 1`, `<course_code> practice exam`, `<course_code> exam review` on the top validated + high-MO campuses — high intent, thin paid competition.
- **BRAND CONQUEST (research):** understand SERP structure/demand around Study Edge, Wize Prep — **do NOT place competitor trademarks in ad copy.**

---

## 7. Search yield (what to search next time)

| Best families (competitors/search) | Wasteful families |
|---|---|
| `course_exam_review` **2.68** | `ad_probe_course_acct` **0.15** (generic `<code> accounting`) |
| `course_tutoring` **2.14** | `school_review_videos` 0.43 |
| `ad_probe_course_tutoring` **2.02** | `fin_acct_tutoring` 0.49 |
| `school_acct_tutoring` 1.39 | `school_practice_exam` 0.51 |

**Recommendation for nationwide refreshes:** lead with **course-code queries** (`<code> exam review`, `<code> tutoring`, `<code> practice exam`) — they find 2–3× more competitors per search **and** surface the course-code network + course ads. Keep one school-level query (`<school> accounting tutoring`) for campuses without a known code. **Drop** generic `<code> accounting` and school-level video/practice-exam families — low yield. This roughly **halves** the searches needed per campus at similar coverage.

---

## 8. Algorithmic marketing — how to use each signal

| Signal | Recommendation | Why |
|---|---|---|
| **Paid competitor present** | **MARKET SCORE (positive input)** | Presence proves willingness to pay. Feed it as a positive validation factor into the Growth market score — *not* a penalty. |
| **Competitor price** | **DISPLAY ONLY** (for now) | Coverage is partial/gated and noisy; useful context on a campus card, but too sparse to drive an algorithm. Promote to a score input once enrichment coverage improves. |
| **Local paid-market evidence** (course-specific site / campus platform) | **ACTION TRIGGER** | The strongest, most specific signal. A course-code site or Wize-Prep/Study-Edge presence = a campus where the exact product wins → trigger a prioritized, course-specific landing page + outreach. |
| **Competition intensity** (# competitors / CROWDED vs WHITE_SPACE) | **MARKET SCORE (nuanced)** | CROWDED = validated demand (positive); WHITE_SPACE at high MO = first-mover (also positive, different play). Use as a *segmentation* input, never a simple negative. |

_Guardrail: none of these should silently create ads or campaigns; they inform prioritization and landing-page/outreach decisions a human approves._

---

## 9. New opportunities revealed

- **Campuses we'd underestimated:** the **course-code network** proves paid demand at many **mid-MO** schools (Toledo, Tarleton, SUNY Oneonta, Univ of Nebraska-Kearney, Mississippi College) that structural scoring alone would rank lower — paid competition is a *demand* signal the IPEDS model can't see.
- **Course categories students routinely pay for:** **Intro Financial Accounting (Exam 1) is the anchor** — every course-code site and Study Edge lead with it. **Managerial (ACG2071/ACC 202)** is the natural attach. Confirms Survive's Intro-1 focus is exactly where the money is.
- **Business models worth learning from:** (1) **One course code = one domain**, ranking organically (the network) — cheap SEO, hyper-specific; (2) **Study Edge's free-trial + full-stack subscription**; (3) **Knack's university-partnership** distribution.
- **Channels/positioning not yet considered:** **course-code SEO landing pages** (`survive… /acg2021`, `/acct2301`) to compete with the network organically; **"one-time, whole-course, free Exam-1"** as the anti-subscription wedge; **chapter/club group-buy** as a CAC advantage none of the competitors use.

---

## 10. Final

### COMPETITIVE INTELLIGENCE READY FOR GROWTH V1: **YES**
Per-campus signals (`proven_paid_market`, `intro_accounting_paid_market_status`, `market_validation`, keyword candidates) are complete and transparent in `CAMPUS_COMPETITIVE_SUMMARY.csv` — ready to feed the Growth dashboard as a market-validation input. (Caveat: ~13% of queries were rate-limited by the concurrent growth job; a cheap refresh will top it up.)

### TOP 25 VALIDATED PAID MARKETS
_(strongest third-party paid evidence, then Market Opportunity — a market-validation signal, not the final outreach order)_

| # | Campus | ST | Course | MktOpp | Strongest competitor |
|---|---|---|---|---|---|
| 1 | University of Nevada, Las Vegas | NV | ACC 201 | 83.7 | acc201uky.com |
| 2 | University of South Florida | FL | ACG 2021 | 85.9 | acg2021fiu.com |
| 3 | UNC Greensboro | NC | ACC 201 | 71.8 | acc201uky.com |
| 4 | University of North Texas | TX | ACCT 2010 | 87.6 | acct2001.com |
| 5 | University of Houston | TX | ACCT 2301 | 92.1 | acct2301.com |
| 6 | Univ of Central Florida | FL | ACC 201 | 87.1 | acc201uky.com |
| 7 | University of Florida | FL | ACG 2021 | 84.6 | acg2021fiu.com |
| 8 | University of Miami | FL | ACC 211 | 75.4 | Course Hero |
| 9–25 | _see `TOP_VALIDATED_PAID_CAMPUSES.csv`_ (incl. Clemson, Auburn, Kennesaw State, Georgia State, U. Arizona, Toledo, Tarleton, SMU, Missouri State, UNLV, SUNY Oneonta, Liberty, Texas State, Middle Tennessee State) | | | | |

### TOP 25 STRONG WHITE-SPACE MARKETS
_(high Market Opportunity, no local paid accounting competitor detected — first-mover lanes)_

| # | Campus | ST | MktOpp |
|---|---|---|---|
| 1 | CUNY-Baruch College | NY | 95.0 |
| 2 | Cal State Northridge | CA | 89.2 |
| 3 | Michigan State University | MI | 86.8 |
| 4 | Grand Valley State University | MI | 85.5 |
| 5 | Cal State Fullerton | CA | 84.1 |
| 6 | Cal State Poly-Pomona | CA | 82.2 |
| 7 | CUNY-Brooklyn College | NY | 82.0 |
| 8 | Franklin University | OH | 81.9 |
| 9–25 | _see `MORNING_AUDIT…json` → `top_25_white_space`_ (CSU/CUNY systems, Purdue, Minnesota State-Mankato feature heavily) | | |

> Many white-space campuses lack a stored **course code**, so discovery was name-only — some "white space" is really "we couldn't run course-code queries." Filling course codes (Course-Intel) then re-running would reclassify a portion of these.

### TOP 10 FUTURE SEARCH-AD EXPERIMENTS
_(candidates only — no campaigns created; do NOT use competitor trademarks in ad copy)_

**Non-brand high-intent (course-code, thin paid competition, high MO):**
1. `ACCT 2301 exam 1 / practice exam / exam review` → University of Houston (MO 92)
2. `ACCT 2010 practice exam / exam review` → University of North Texas (MO 88)
3. `ACC 201 exam 1 / practice exam` → UCF (MO 87)
4. `ACG 2021 practice exam / exam review` → University of Florida + USF (MO 86)
5. `ACCT 2110 exam review` → Auburn (MO 92)
6. `ACC 201 exam 1 / practice exam` → UNLV (MO 84)
7. `<school> financial accounting exam` → CUNY-Baruch (MO 95, white-space, no code yet)

**Brand-conquest research (understand demand/SERP only, no trademark ad copy):**
8. Study Edge (UF/FSU/UCF) — measure branded search volume + SERP structure
9. Wize Prep — multi-campus exam-prep demand
10. Course Hero / Studocu — course-page demand (marketplace substitution)

---

_Method: public search results + public marketing pages only. No accounts, paywalls, purchases, or fake identities. Pricing/offerings extracted verbatim from public pages; gated prices left blank ("verify manually", not "free"). Competitor presence framed as **positive** demand evidence, by design._
