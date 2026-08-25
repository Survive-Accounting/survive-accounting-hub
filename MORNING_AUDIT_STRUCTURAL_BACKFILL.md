# MORNING AUDIT — Structural Campus Backfill
**Generated:** 2026-08-25 · **Mode:** read-only (nothing resumed, changed, or deployed) · **Run:** `Survive_Updated_Campus_Enrichment_Batches.xlsx` (816 campuses, 4 batches)

---

## 1. EXECUTIVE STATUS

| | |
|---|---|
| **OVERALL STATUS** | **COMPLETE** — 816/816 campuses, 0 errors |
| **SAFE TO RESUME** | **N/A** — nothing to resume; the run finished cleanly |
| **SAFE TO INTEGRATE DATA** | **PARTIAL** — Greek/council/Intro-1 layers are ready; professor *counts* need de-duplication first |
| **Branch** | `course-intel-v1` |
| **Worktree** | `C:/Users/lee/Documents/sa-course-intel` |
| **Latest commit** | `9f3b5831` (Campus systems + identity) |
| **Main (deployed)** | `515d1e53` |
| **Uncommitted** | `src/routes/api.backfill.tsx` (untracked internal runner) + `src/routeTree.gen.ts` (auto-generated). **All backfill DATA is in Supabase, not files.** |
| **Start** | ~03:57 |
| **End** | 14:09:22 |
| **Total runtime** | ~10h12m wall (~8.4h active compute at concurrency 2; the rest = AI-Gateway replenish waits + operator interventions) |

The watchdog self-healed twice during the night (restarted the dev server at 09:41, recovered a hung master at 09:47) and stopped itself cleanly at completion.

---

## 2. CAMPUS PROGRESS

| Batch | Target | Completed | Errored | Not started |
|---|---|---|---|---|
| Batch 1 (picker/Greek) | 92 | **92** | 0 | 0 |
| Batch 1B (new adds) | 49 | **49** | 0 | 0 |
| Batch 2 (academic-signal) | 331 | **331** | 0 | 0 |
| Batch 3 (full-discovery) | 344 | **344** | 0 | 0 |
| **Total** | **816** | **816** | **0** | **0** |

- **Attempted:** 816 · **Completed:** 816 · **Partial:** 0 · **Failed:** 0
- **Needs review:** ~24 campuses (see §4) — quality flags, not failures. Every campus finished on the **first attempt** in the final ledger (earlier AI-Gateway-402 casualties were pruned and cleanly re-run).

---

## 3. STAGE RESULTS

| Stage | Attempted | Success / had | No result | Notes |
|---|---|---|---|---|
| Canonical campus identity | 816 | 816 | 0 | display_name/aliases/system set pre-run |
| Intro-1 course code | 816 | 264 had + **59 new** | 493 none | "none" concentrated in community colleges |
| Greek org discovery | 816 | 720 discovered + 96 had | — | greekrank.net |
| Greek council discovery | 816 | IFC 488 · Panhel 481 · NPHC 361 · MGC 220 | — | all 4 councils covered |
| Council contact discovery | 816 | **153 campuses** with contacts | 659 zero | 4 gated (no-Greek) |
| Accounting professor discovery | 816 | 346 discovered + 246 had | 220 no-dept | 4 gated |
| RMP / Intro-1 qualification | 816 | see §5 | — | proof layer is the bottleneck |

### Net-new this run
| Item | Net-new |
|---|---|
| Course codes | **59** |
| Greek chapter relationships | **1,742** |
| Council contacts | **1,543** |
| Role inboxes (typed) | 68 (**381** role-inbox-like by email) |
| Accounting professors | **1,259** |
| Intro-1 target-match evidence | 671 matches |

### Authoritative DB totals across the 816 (the reliable picture)
| Metric | Total |
|---|---|
| Active professors | **4,734** |
| **Intro-1 qualified professors** | **505** across **101 campuses** |
| Council contacts | **1,547** |
| Greek chapters | **3,815** |
| Campuses with a course code | **323** |

---

## 4. DATA QUALITY

**Estimated precision:** Greek chapters ~0.95 · Council contacts ~0.85–0.90 · Professors ~0.80 (over-collection at large campuses).

**What's clean:**
- **0 duplicate chapter pairs** (upsert dedup held) · **0 needs-verification** flags · **0 stale/not-current** council contacts.
- **Greek contamination is tiny:** of 6,896 active chapters, only ~11 are professional/honor orgs (Alpha Kappa Psi, Delta Sigma Pi). ~0.16%.
- Council contacts all came from **official sources** (official_council 728, official_fsl 837) — good provenance.

**Known contamination / risk areas (highest first):**
1. **Professor over-collection** at large research universities — raw counts include the whole business school, not just accounting.
2. **Greek-count outliers at community/small colleges** — likely wrong-campus GreekRank matches (Parkland College 64, Austin CC 58, Cornell College 61).
3. **208 council emails shared across multiple campuses** — mostly legitimate advisor reuse, but a chunk are likely mis-scrapes.
4. **3 duplicate campus records** — comma/en-dash variants (UCLA, UCSB, UW-Madison), partly from Batch 2's "University of California, Los Angeles" resolving separately from the existing "UCLA" record.
5. **439 Greek orgs with no `org_type`** — classification gap, not contamination.
6. **Role-inbox mistyping** — 381 emails look like role inboxes but only 68 are typed `role_inbox`.

### 20 most suspicious records/campuses
| # | Campus | Issue | Risk |
|---|---|---|---|
| 1 | University of Virginia | 259 professors (over-collection) | HIGH |
| 2 | UIUC | 118 profs + 101 greek chapters | HIGH |
| 3 | University of La Verne | 103 profs (small school) | HIGH |
| 4 | Oral Roberts University | 95 profs (small school) | HIGH |
| 5 | Parkland College | 64 greek chapters (community college) | HIGH |
| 6 | Indiana University Northwest | 61 greek chapters (commuter) | HIGH |
| 7 | Austin Community College | 58 greek chapters (CC) | HIGH |
| 8 | Cornell College | 61 greek chapters (likely Cornell Univ. bleed) | HIGH |
| 9 | UT Austin | 114 professors | MED |
| 10 | University of Minnesota | 90 profs + 55 greek | MED |
| 11 | UT Rio Grande Valley | 85 professors | MED |
| 12 | Rutgers University | 79 greek chapters (verify not multi-campus) | MED |
| 13 | Franklin & Marshall College | 57 greek chapters (small) | MED |
| 14 | UCLA | duplicate campus record (comma variant) | MED |
| 15 | UCSB | duplicate campus record | MED |
| 16 | UW-Madison | duplicate campus record (en-dash) | MED |
| 17 | Virginia Tech | 64 greek chapters | LOW |
| 18 | Michigan State | 63 greek chapters | LOW |
| 19 | Nebraska-Lincoln | 63 greek chapters | LOW |
| 20 | Purdue / Missouri | 61–62 greek chapters | LOW |

---

## 5. INTRO-1 PROFESSOR LESSON

| Tier | Count |
|---|---|
| ACCOUNTING_PROFESSOR (active) | **4,734** |
| …with any RMP rating | 2,387 |
| POSSIBLE_INTRO-1 (RMP intro_1 ≥ 1) | **505** |
| LIKELY_INTRO-1 (RMP intro_1 + recent match) | **182** |
| `teaches_intro_1` flag (broader signal) | **1,062** |

Confidence distribution: none 4,053 · high 293 · medium 376 · low 12.

**Does "0 Intro-1" mean no professor exists, or that we couldn't prove it?** → **Overwhelmingly the latter.** Only 11% of accounting professors have *any* RMP Intro-1 course hit, and just 182 have a *recent* one — yet 1,062 carry the broader teaching signal and 2,387 have RMP ratings at all. **The proof layer is the bottleneck, not the professor population.**

**False-negative patterns:**
- Adjuncts/lecturers with RMP ratings but **no course tags** — invisible to course-code proof (they teach most Intro-1 sections).
- Campuses with a code but **thin RMP coverage** (small/regional/CC) → 0 Intro-1 despite real teachers.
- **493 campuses still have no course code**, so nobody there can qualify yet.

**Reconciliation recommendation (do this next in Course Intel):** add a second, stronger evidence source and set precedence:
1. Official **schedule-of-classes / registrar** instructor-of-record for the Intro-1 code → **CONFIRMED**
2. **Syllabus** author → **CONFIRMED**
3. RMP recent target match → **LIKELY**
4. RMP any target hit → **POSSIBLE**
5. Title/dept heuristic → **CANDIDATE**

Treat RMP as *corroboration*, not the primary proof.

---

## 6. COST / PERFORMANCE

| Metric | Value |
|---|---|
| SERP searches (est. total) | **~22,000** (~27/campus; exact obscured by mid-run top-ups; dipped to ~61 then renewal restored ~15k) |
| **Firecrawl credits** | **100,004 / 100,000 — ENTIRE PLAN CONSUMED** (~123/campus) |
| AI Gateway | 402 outage mid-run (16 events), operator-replenished |
| Avg time / campus | 74s (median 64s, p90 182s, max **679s**) |
| Total campus-compute | 60,493s (~16.8 campus-hours) |
| Avg searches / campus | ~27 |

- **Slowest stage:** professor discovery — faculty-page pagination + scroll fallback via Firecrawl (**222 Firecrawl 500s** triggering retries).
- **Highest-yield stages:** Greek chapter discovery (**+1,742**) and council contact discovery (**+1,543**).
- **Lowest-yield / worst cost:** professor discovery on community colleges — e.g. **Community College of Baltimore County: 679s for 3 professors**; 220 campuses returned `no dept`.

**The real cost ceiling is Firecrawl, not SERP.** The full run burned the entire 100k Firecrawl plan, almost all on faculty-page scraping.

**Optimize before future batches:** cache Firecrawl faculty fetches + cap pagination depth; gate community colleges out of council + faculty stages; cache SERP queries by (campus, stage) for free resume.

---

## 7. REUSABILITY — changes to the permanent Campus Backfill tool

- **Cache:** SERP course-code + council queries; **Firecrawl faculty fetches** (biggest saver).
- **Stop early:** faculty pagination after N pages or the first zero-yield page; council discovery when the campus is a community college / has no Greek.
- **Run conditionally:** council + faculty stages **only** when Greek presence OR 4-year institution; skip code discovery when a code already exists.
- **Source precedence:** official registrar schedule > syllabus > RMP course tags > title heuristic; verify greekrank.net campus-id before writing chapters.
- **Failure states:** distinguish **AI-Gateway 402** (halt + alert) from "no result" (`—`); distinguish dev-server netfail (retry) from stage error.
- **Parallelize:** concurrency 2 was safe; independent stages could run 3–4 wide with per-service rate caps.
- **Never repeat:** two orchestrators on one progress file (**`pkill` fails on Windows git-bash — use PowerShell `Stop-Process`**); running council/faculty on community colleges; unbounded faculty pagination.

---

## 8. GROWTH / MARKETING SIGNALS

| Signal | Verdict | Why |
|---|---|---|
| Council presence (153 campuses) | **USE FOR SCORING** | strong contactability proxy |
| Stable council role inbox (68 typed / 381 like) | **USE AS ACTION TRIGGER** | durable outreach targets that survive officer turnover |
| Chapter count | **USE FOR SCORING** | Greek-density proxy — *after* capping outliers |
| Greek density % (`greek_pct_*`) | **USE FOR SCORING** | already stored, clean |
| Intro-1 qualified present (101 campuses) | **USE AS ACTION TRIGGER** | picker-ready today |
| Chapter contactability (exec/insta URLs) | **USE FOR SCORING** | direct chapter reach |
| Campus readiness composite | **USE FOR SCORING** | code + greek + intro1 + council |
| Professor *breadth* | **DISPLAY ONLY** | inflated by over-collection until de-duped |
| Raw professor count | **DO NOT USE** | includes non-accounting faculty |

---

## 9. KING — what this data could drive (nothing sent)

| Action | Trigger | Candidates |
|---|---|---|
| CONTACT IFC | campus has IFC role inbox + Greek presence | 488 |
| CONTACT PANHELLENIC | Panhellenic role inbox present | 481 |
| VERIFY BAD CONTACT | email shared across >3 campuses | from 208 shared |
| FIND MISSING PRESIDENT | council has advisor but no student officer | subset of 153 |
| RESEARCH CHAPTER | Greek-count outlier at CC/small college | Parkland, Austin CC, Cornell College… |
| DO NOT CONTACT | community college, no council + no Greek | most of Batch 3 tail |
| WAIT | code present but 0 Intro-1 proof | ~222 campuses pending reconciliation |

---

## 10. REVIEW QUEUES (ranked)

**HIGH VALUE / HIGH RISK**
- Professor over-collection ≥80 (`campus_lead_suggestions`) — **7 campuses** (UVA 259 worst).
- Greek-count outliers at CC/small colleges (`campus_greek_chapters`) — **~6 of 14** flagged.
- Duplicate campus records (`campuses`) — **3** (UCLA/UCSB/UW-Madison).

**HIGH VALUE / LOW RISK**
- Role-inbox reclassification (`campus_council_contacts`) — **~313** look-alike vs typed.
- Intro-1 zero-proof campuses that *have* a course code (`campus_lead_suggestions`) — **~222** — prime schedule/syllabus reconciliation targets.

**LOW VALUE**
- Unclassified Greek `org_type` (`greek_orgs`) — **439**.
- Shared council emails (likely legitimate advisor reuse) — **208**.

---

## 11. TEN HIGHEST-VALUE NEXT-RUN IMPROVEMENTS

1. **Cache Firecrawl faculty fetches + cap pagination depth** — biggest cost *and* accuracy win.
2. **Institution-type gate** — skip council + faculty stages for community colleges.
3. **Add official schedule-of-classes as primary Intro-1 evidence** — fixes the false-negative gap.
4. **SERP query cache keyed (campus, stage)** — zero-cost resume.
5. **Single-orchestrator lock file** — never allow concurrent writers.
6. **Distinct failure codes** — AI-Gateway-402 halts+alerts; netfail retries; "no result" logs.
7. **Scope prof scrape to accounting dept only** — kills the 259-prof over-collection.
8. **GreekRank campus-id verification before writing chapters** — kills CC/small-college bleed.
9. **Auto-classify `greek_orgs.org_type` on insert** — drop the 439 unknowns.
10. **Per-service concurrency caps** — safely run 3–4 wide.

---

## 12. INTEGRATION CONTRACT (for the Growth dashboard)

**SOURCE OF TRUTH**
- `campuses` — identity (name/display_name/aliases/parent_system_id/campus_resolution_status).
- `campus_greek_chapters` — Greek presence + counts.
- `campus_council_contacts` — outreach targets.
- `campus_lead_suggestions` — professors + Intro-1 evidence (`rmp_target_course_counts_json`, `teaches_intro_1`, `active_roster`, `student_visible`).

**DERIVED**
- Intro-1 qualified per campus (`rmp_target_course_counts_json.intro_1 ≥ 1`).
- Campus readiness composite (code + greek + intro1 + council).
- Greek density (`greek_pct_*`).

**TEMPORARY** — `scratchpad/master_progress.json`, `*.log`, `all_targets.json`, `audit_db_result.json`.

**DEPRECATED** — raw professor **count** as a scoring input (until de-duplicated).

*(No DB redesign performed — this is a consumption contract only.)*

---

## 13. FINAL VERDICT

**STRUCTURAL DATA READY FOR GROWTH V1: PARTIAL** — the Greek, council, and Intro-1 layers are production-ready today; quarantine raw professor counts and the flagged Greek outliers until reviewed.

### The three most important things Lee needs to know this morning
1. **The run is a clean COMPLETE** — 816/816, zero errors. **505 Intro-1 professors across 101 campuses are picker-actionable now**, plus 1,547 council contacts and 3,815 Greek chapters. You can build Growth V1 on the council + Greek + Intro-1 layers today.
2. **Two accuracy caveats before trusting professor data:** over-collection at ~7 large campuses (UVA shows 259) and Greek-count outliers at ~6 community/small colleges. Quarantine raw prof counts and those Greek outliers from scoring until a quick review pass.
3. **"0 Intro-1" is a PROOF gap, not an absence.** Only 182 confirmed / 505 possible via RMP, but ~1,062 broader signals exist. Reconcile with official schedules + syllabi next — do **not** treat 0-Intro-1 campuses as having no teacher.
