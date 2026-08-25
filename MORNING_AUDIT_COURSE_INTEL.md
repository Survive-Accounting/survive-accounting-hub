# Morning Audit — Course Intel

_Read-only audit · 2026-08-25 · branch `overnight/course-intel-harvest`. No mutations, no mapping
approvals, no deploy, no student-facing changes were made. Figures are from the live tables._

> **One-line takeaway:** discovery worked broadly (315 campuses with a useful public document, 223
> with a syllabus, 145 with professor evidence, 152 CONFIRMED Intro-1 professors), but the
> **extraction/parse layer is the bottleneck** — Firecrawl ran out, so only **652 of 3,389 documents
> were parsed** and only **5 campuses** carry explicit Exam-1 chapter evidence. The raw material for a
> strong Exam-1 map exists; it is sitting in 2,653 discovered-but-unparsed documents awaiting a cheap,
> resumable parse pass.

---

## 1. Executive status

**Overall: PARTIAL.** SEC preflight: **PASS** (gate clean — 0% wrong-campus, 0 cross-campus dupes, 0
provenance gaps). Nationwide catch-up: **caught up to everything currently eligible, then idled out**
(upstream backfill stalled on the same Firecrawl exhaustion).

| | |
|---|---|
| Campuses total (eligible universe) | 884 |
| Campuses attempted (harvested) | **872** |
| Campuses completed (high-confidence) | 63 |
| Campuses with an intro course code | 320 |
| Professors researched (pool) | 17,636 (12,324 in Pass-B candidate pool) |

**Pass A** (campus+course): 448 COMPLETE · 436 NO_RESULT.
**Pass B** (professor+course): 81 COMPLETE · 507 NO_RESULT · 290 NOT_RUN · 6 WAITING_FOR_PROFESSORS.
**Status rollup:** 63 COMPLETE · 386 NEEDS_REVIEW · 408 NO_RESULT · 15 FAILED · 12 WAITING (11 course, 1 professors).

---

## 2. Document yield

**3,389 unique documents** (deduped on campus+URL; the unique constraint prevented duplicate rows —
the same PDF found via multiple queries collapses to one). Restricted doc-mills were never fetched
(on-domain-only attribution excludes them upstream).

| Type | Count | | Processing | Count |
|---|--:|---|---|--:|
| syllabus | 729 | | **parsed (evidence extracted)** | **652** |
| catalog | 739 | | discovered (URL captured, unparsed) | **2,653** |
| schedule | 373 | | failed fetch | 84 |
| study_guide (Exam-1 tier) | 66 | | | |
| homework | 42 | | **By value tier** | |
| lecture | 91 | | tier 1 (direct exam evidence) | 66 |
| worksheet / objectives | 72 | | tier 2 (course structure) | 1,144 |
| faculty_page | 99 | | tier 3 (topic emphasis) | 1,335 |
| unknown_pdf | 1,172 | | tier 4 (identity) | 844 |

**Read this carefully:** the 1,172 `unknown_pdf` bucket is un-classified PDFs (many are real syllabi/
schedules that keyword-classification missed) — parsing them will reclassify and likely add materially
to the syllabus/study-guide counts. **This is the single biggest untapped pile.**

---

## 3. Campus / professor coverage

| Coverage | Campuses |
|---|--:|
| ≥1 useful document (syllabus/study/review/schedule) | **315** |
| parsed course evidence (exam range or textbook) | 77 |
| professor-specific evidence | **145** |
| textbook evidence | 64 |
| **explicit Exam-1 chapter evidence** | **5** |
| exam-date evidence | **0** |
| zero documents | 435 |

**Highest coverage (by high-value docs):** Johns Hopkins (7 docs / 4 tier-1), Drexel (6/4), East
Central College MO (10/3), U Oklahoma (21/2), U Florida (20/2), Indiana U Indianapolis (18/2),
Jacksonville State (17/2), Marquette, U Louisville, UC Santa Barbara.
**Lowest coverage:** 435 campuses returned zero documents — overwhelmingly **no resolvable public
domain in the DB** (the on-domain guard then correctly returns NO_RESULT rather than guessing). This is
a *data-completeness* gap upstream, not a discovery failure.

---

## 4. Intro-1 professor evidence

**502 evidence rows across 410 distinct professors**, all newly discovered this run (there was no prior
document-derived professor layer):

| State | Rows |
|---|--:|
| CONFIRMED_INTRO1 | **152** |
| LIKELY_INTRO1 | 289 |
| POSSIBLE_INTRO1 | 61 |

- **Newly discovered:** all 502 (first document-based professor→course evidence).
- **Strengthened:** 9 professors carry multiple evidence rows across states (e.g. a POSSIBLE upgraded by
  a parsed syllabus to LIKELY/CONFIRMED).
- **Contradicted:** none material — no professor was tied to Intro-1 by one source and refuted by
  another; RMP was deliberately not used as a gate.
- **Most effective source for CONFIRMED:** **100% of the 152 CONFIRMED came from HIGH-quality
  (on-campus-domain) sources** — official department syllabus/schedule pages naming the instructor on a
  recent Intro-1 course. That is exactly the intended, defensible path, and it is **stronger than RMP**
  for this purpose.

---

## 5. Exam 1 intelligence  ⚠ evidence still thin — read the confidence labels

Only **5 campuses** have explicit "Exam 1 = Ch a–b" statements parsed so far (Firecrawl capped the
parse). Across those 5:

| Chapter | Campuses (of 5) |
|---|--:|
| **Ch 1** | 5 (100%) |
| **Ch 2** | 4 (80%) |
| **Ch 3** | 4 (80%) |
| Ch 4 | 1 |
| Ch 7 / 8 / 14 / 18 | 1 each (outliers, incl. one full-course/vocational doc) |

Most common range: **Ch 1–3** (3 of 5 campuses); also 1–4 (1). Sequencing where seen: 1→2→3 (financial
statements → accounting equation/transaction analysis → recording & adjusting entries).

**Confidence separation (honest):**
- **STRONG cross-campus pattern:** *none yet* — n=5 is too small to call strong.
- **MODERATE pattern:** **Exam 1 centers on Chapters 1–3** (financial statements; the accounting
  equation & transaction analysis; recording journal entries / adjusting entries). Consistent across the
  parsed sample *and* with Survive's existing Exam-1 spine (Ch 1,2,3,6–9) and with the universal
  intro-financial sequence — but corroborate before treating as fact.
- **WEAK / anecdotal:** anything beyond Ch 4 for Exam 1 (single-campus outliers).
- **Problem-type recurrence:** *insufficient evidence* — the extractor captured chapter ranges, textbook,
  and instructor, **not** problem types. Do not infer problem types from this run.

**What to prioritize filming — strictly by evidence:** the parsed signal points at the **Chapter 1–3
core**: (1) the four financial statements & the accounting equation, (2) transaction analysis /
debits-credits / journal entries, (3) adjusting entries & accrual basis. This also matches where the
*discovered-but-unparsed* study guides cluster. **Caveat:** this is a MODERATE call on n=5; the single
highest-leverage action is to parse the backlog (below) and re-run this section before committing a
film slate to it.

---

## 6. Exam timing

- **Usable Exam-1 dates: 0. Estimated windows: 0.**
- The AI extraction schema this run captured **term/year** (freshness) but **not specific exam dates**,
  so there is currently **no basis for a real `days_until_exam_1` signal**.
- **% of high-priority campuses with a real timing signal: 0%** today.
- To get timing: extend the extractor to pull dated schedule rows ("Exam 1 — Oct 3") from the
  course-calendar/schedule documents (373 already discovered). Source reliability there would be HIGH
  (official on-domain schedules), so this is a tractable, high-value add — just not done yet.

---

## 7. Textbook intelligence

- **171 textbook rows, 94 with a confirmed edition, 37 TOC chapter rows** (a small existing TOC layer).
- **114 textbook-reference evidence rows across 64 campuses.**
- **Repeatedly used (by mention):** "Financial Accounting" (9), "Financial & Managerial Accounting" (4),
  OpenStax "Principles of Accounting, Vol 1: Financial Accounting" (4), Wild "Financial & Managerial"
  (4). This concentration matches the prior audit's finding that a handful of titles cover ~99% of the
  market — **the reuse engine is real.**
- **Noise to note:** a few non-intro titles leaked in ("Bookkeeping for Dummies" ×4, "Canadian Income
  Taxation", "Small Business…") from mis-parsed docs — modest, flagged for review, not yet cleaned.
- **Could textbook/chapter intelligence materially improve mapping? YES** — this is the highest-leverage
  layer: map each dominant edition's TOC → Survive topics *once*, and it covers hundreds of campuses via
  reuse, independent of whether each campus's own syllabus is public.

---

## 8. Search performance

| | |
|---|--:|
| SERP searches | 3,237 |
| Firecrawl fetches | 833 |
| AI parses | 745 |
| Est. spend | $53.53 |
| Useful (tier 1–2) docs | 1,210 |
| Useful-doc yield / SERP | **0.37** |

- **Best query families:** `site:{domain} "{code}" syllabus` and `site:{domain} "{code}" "exam 1"`/
  `"study guide"` — code-scoped, on-domain; these produced essentially all the tier-1/2 hits with no
  cross-campus contamination.
- **Worst:** broad code-less queries on code-less campuses (`site:{domain} accounting syllabus`) — they
  returned catalog/major-map noise; the relevance gate caught most, but yield was low. The old
  off-domain name fallback was **removed** after preflight (it caused cross-campus contamination).
- **Searches skipped via cache/skip:** per-pass skip + early-stop (halt a campus at ~6 tier-1/2 docs)
  meant the follow-behind re-paid **~0** discovery on already-covered campuses.
- **Make permanent:** the **parent-domain + code-scoped** query family, on-domain-only attribution, the
  continuing-ed/vocational blocklist, and the college-accounting relevance gate. These are the difference
  between clean intel and contamination.

---

## 9. Mapping safety

- **Proposed Exam-range signals:** 70 total exam-range evidence rows; **Exam-1-specific proposals: 6, all
  Medium confidence** (none High yet). Textbook→topic mappings: 60, all `state=proposed` (seed layer).
- **Nothing should be auto-applied.** Every signal is PROPOSED / NEEDS_REVIEW; the pipeline never writes
  a student-facing map.
- **False-positive risks to watch on review:**
  1. Textbook titles from mis-parsed docs (the Dummies/tax leakage) → verify before trusting an edition.
  2. Single-source Exam-1 ranges (n=1 per campus) — do not generalize one syllabus to a whole campus.
  3. The "1–18" style ranges — usually a full-course schedule or vocational doc, not a real Exam-1 range.
  4. LIKELY_INTRO1 names from schedule pages listing multiple instructors — HIGH-source but confirm the
     specific section.

---

## 10. Marketing signals — recommended usage

| Signal | Availability now | Recommendation |
|---|---|---|
| Course confirmed (public code + doc) | 320 codes, 315 w/ useful doc | **USE FOR PRIORITY SCORE** |
| Professor confirmed (Intro-1) | 152 CONFIRMED, 145 campuses | **USE FOR PRIORITY SCORE** (stronger than RMP) |
| Textbook match | 64 campuses, concentrated titles | **USE FOR PRIORITY SCORE** (via reuse) |
| Document freshness (term/year) | on parsed docs | **DISPLAY ONLY** (dashboard confidence chip) |
| Topic-coverage confidence | 5 campuses Exam-1 | **DISPLAY ONLY** until parse backlog cleared |
| Exam-map confidence | 6 Medium proposals | **DISPLAY ONLY** (never a trigger yet) |
| **Exam 1 date** | **0** | **DO NOT USE** (not extracted) |
| **days_until_exam_1** | **0** | **DO NOT USE** yet — needs the schedule-date extractor |

---

## 11. What King's queue could say (enabled by this data; no outreach executed)

- **"COURSE CONFIRMED — professor <name> teaches <code>"** — for the 145 campuses with professor
  evidence (152 CONFIRMED). Defensible, personal, RMP-independent.
- **"COURSE INTEL NEEDS REVIEW"** — 386 NEEDS_REVIEW campuses have docs but no High-confidence map yet.
- **"CAMPUS CONTENT NOT READY"** — 408 NO_RESULT + 435 zero-doc campuses (mostly missing a public domain).
- **"TEXTBOOK MATCH — <title>"** — 64 campuses; supports a "we know your book" message.
- **Not yet possible:** anything time-based ("EXAM IN 12 DAYS") — no exam dates were captured. That
  requires the schedule-date extractor.

---

## 12. New / surprising discoveries

1. **Document evidence confirms Intro-1 professors more reliably than RMP** — 152 CONFIRMED, all from
   official on-domain syllabi/schedules. Survive can build a professor→course truth layer that doesn't
   depend on RMP at all. (**Defensible + personalized.**)
2. **The bottleneck is parsing, not finding.** 315 campuses already have useful public docs and 1,172
   unknown-PDFs are unparsed — the expensive SERP layer is done; a cheap parse pass unlocks most value.
   (**Scalable.**)
3. **Business-school subdomains hid the good stuff** — UT Austin's real ACC 311 syllabi live on
   `utdirect.utexas.edu`, not the mccombs subdomain. The parent-domain fix was decisive; generalize it.
4. **Textbook concentration is extreme** — a handful of titles recur; mapping ~20-30 editions' TOCs once
   covers most campuses regardless of syllabus availability. (**Scalable + defensible.**)
5. **Schedules are an untapped timing goldmine** — 373 course-calendar/schedule docs already discovered;
   they contain dated exam rows that, once extracted, become a *real* `days_until_exam_1` — the most
   valuable marketing trigger Survive could have. (**Timely.**)

---

## Final

**COURSE INTEL READY FOR GROWTH V1: PARTIAL.**
The professor-confirmation, course-confirmation, and textbook layers are dashboard-ready now. The
Exam-1 topic map and any exam-timing signal are **not** ready — they need the parse backlog cleared and
a date extractor added. Ship the ready layers; label the rest COMING_SOON.

**Top 5 data elements for the Growth dashboard:**
1. `course_intel_status` (COMPLETE / NEEDS_REVIEW / NO_RESULT / WAITING) per campus.
2. `confirmed_intro1_prof_count` + the professor names/evidence (the RMP-independent truth layer).
3. `documents_found` + `recent_syllabus_found` (proof we have real material).
4. `textbook_identified` (title/edition) — high reuse value.
5. `course_intel_last_updated` + freshness. **(`course_readiness_status = COMING_SOON`,
   `course_readiness_score = null` — as specified.)**

**Top 5 things to film/build next (evidence-based):**
1. **Clear the parse backlog first** (build a "parse pending docs" pass) — turns 2,653 discovered docs
   into real Exam-1 + textbook evidence. Do this *before* committing a film slate to a topic map.
2. **Film the Chapter 1–3 core** — financial statements & the accounting equation; transaction analysis
   / journal entries; adjusting entries & accrual — the MODERATE-confidence Exam-1 signal and Survive's
   existing spine agree here.
3. **Build the schedule-date extractor** → `days_until_exam_1`. Highest-value marketing trigger; the
   source docs already exist.
4. **Map the top ~20 textbook editions' TOCs → Survive topics once** — the reuse engine that scales the
   Exam-1 map to hundreds of campuses.
5. **Resolve missing campus domains** (435 zero-doc campuses) — a small upstream data fix that would
   unlock the largest block of currently-dark campuses for the next harvest.
