# Course Intel — Post-Parse Report

_Read-only analysis after the parse pass · 2026-08-25 · branch `overnight/course-intel-harvest`.
No student-facing maps were changed. Nothing deployed._

> **Headline:** parsing the discovered corpus turned a thin 5-campus Exam-1 sample into a **strong
> 46-campus cross-campus pattern**: Exam 1 is **Chapters 1–4** almost everywhere (Ch 1: 96%, Ch 2: 91%,
> Ch 3: 87%, Ch 4: 65%, Ch 5: 35%). Professor confirmations rose to **211**, textbook coverage to
> **101 campuses**. A working exam-date extractor was built; it confirms a clear **timing pattern**
> (Exam 1 ≈ week 5–6 of term) but only **1 currently-future date** exists because most public syllabi
> are historical.

---

## 0. What happened in this pass (full transparency)

The parse pass hit a real defect first: heterogeneous evidence rows were sent as one PostgREST batch,
which 400s (`PGRST102`) and silently dropped every row for any mixed-evidence document. It was caught
by cross-checking script counters against the DB, **fixed** (union keys + null-fill), and the corrupted
state was reset. The bug also cost **~23k Firecrawl credits** before detection (PDFs bill per page,
~24 credits each — far higher than estimated). After the fix, a **focused salvage parsed all 319
discovered syllabi + study guides** (the highest-value docs) down to the remaining credits. This report
is built on that corrected data. **2,254 lower-value docs remain unparsed** (schedules, unknown-PDFs,
homework) — see §8 for the cost to finish.

**Corpus now:** 971 parsed · 2,254 discovered · 162 fetch-errors, of 3,389 total documents.

---

## 1. Cross-campus Exam-1 analysis  ✅ now STRONG

**46 campuses** carry explicit Exam-1 chapter evidence (was 5 pre-parse).

**Chapter frequency (distinct campuses, n=46):**

| Chapter | Campuses | % | | Chapter | Campuses | % |
|---|--:|--:|---|---|--:|--:|
| **Ch 1** | 44 | **96%** | | Ch 5 | 16 | 35% |
| **Ch 2** | 42 | **91%** | | Ch 6 | 7 | 15% |
| **Ch 3** | 40 | **87%** | | Ch 7 | 7 | 15% |
| **Ch 4** | 30 | **65%** | | Ch 8 | 6 | 13% |

**Dominant ranges (distinct campuses):** `1–4` (20) · `1–3` (12) · `1–5` (8) · `1–2` (5). Together,
**~85% of campuses put Exam 1 in Chapters 1–5, centered on 1–4.**

**Confidence separation:**
- **STRONG cross-campus pattern:** **Exam 1 = Chapters 1–4.** Ch 1–3 are near-universal (87–96%), Ch 4
  is a clear majority (65%). This is now a real, defensible pattern (n=46), not anecdote — and it
  matches Survive's existing Exam-1 spine.
- **MODERATE:** Ch 5 belongs on Exam 1 for a **substantial minority** (35%) — worth covering, not
  assuming.
- **WEAK / anecdotal:** Ch 6+ on Exam 1 (≤15% each; the scattered Ch 9–16 hits are alternate textbook
  numbering or multi-exam docs, not a real Exam-1 signal).
- **Problem-type recurrence:** still **insufficient** — explicit problem-type labels are rare in
  syllabi; do not infer.

**Sequencing:** where stated, 1→2→3→4 (financial statements → the accounting equation & transaction
analysis → recording journal entries → adjusting entries / accrual basis).

---

## 2. What to prioritize filming (strictly by evidence)

The evidence now strongly supports a **Chapter 1–4 Exam-1 core**, in this order:

1. **Financial statements & the accounting equation** (Ch 1) — on 96% of Exam 1s. Highest-leverage.
2. **Transaction analysis / debits & credits / the accounting system** (Ch 2) — 91%.
3. **Recording journal entries** (Ch 3) — 87%.
4. **Adjusting entries & the accrual basis** (Ch 4) — 65%.
5. **Then** a shorter piece on the common Ch 5 topic (merchandising **or** receivables/cash, depending
   on textbook) — 35%, a strong secondary.

The explicit topic evidence (where clean) corroborates this: "prepare financial statements", "record
operations under a double-entry system", "accrual accounting concepts", "the accounting information
system", "fraud, internal control, and cash". **Caveat:** topic extraction currently carries ~30%
noise from non-accounting syllabi that slipped through (Spanish/tax/finance) — clean before relying on
the topic layer; the *chapter* layer is solid.

---

## 3. Exam timing ⚠ pattern strong, live dates scarce

The **schedule-date extractor is built and working** (anti-hallucination validated: the date must
appear in the source and match the term year). Results:

- **28 campuses** have a parsed Exam-1 date; **26 HIGH-confidence** (official on-domain), 2 LOW.
- **Only 1 is currently in the future:** **UNC Charlotte — 2026-09-21 (27 days out, HIGH).** The other
  27 are historical (2018–2025) because most public syllabi are prior-term.
- **Timing pattern (from the historical dates) is clear and useful:** Fall Exam-1 dates cluster
  **mid-Sept → early-Oct** (9/16, 9/21, 9/22, 9/23, 9/26, 9/28, 10/2, 10/9); Spring clusters **mid-Feb**
  (2/5, 2/13, 2/16–2/21). i.e. **Exam 1 ≈ week 5–6 of the term.**

**% of high-priority campuses with a *real* `days_until_exam_1` today: ~0% (1 campus).** But an
**estimated Exam-1 window** ("~late September") is defensible for any campus once its term start is
known. **Source reliability: HIGH** (official schedules/syllabi). To get live current-term dates at
scale, parse the **407 schedule/calendar docs** (still unparsed) and re-run near term start.

---

## 4. Professor coverage (RMP-independent)

| State | Count | |
|---|--:|---|
| **CONFIRMED_INTRO1** | **211** | on official, recent, on-domain syllabi/schedules |
| LIKELY_INTRO1 | 458 | named on an Intro-1 course doc |
| POSSIBLE_INTRO1 | 61 | SERP co-occurrence only |

**541 distinct professors across 154 campuses.** All CONFIRMED come from HIGH-quality sources. This is
a genuine professor→course truth layer that does **not** depend on RMP.

---

## 5. Textbook intelligence

- **101 campuses** with textbook evidence; **336 reference rows; 159 confirmed editions.**
- **Recurring titles:** "Financial Accounting" (9 campuses), "Financial & Managerial Accounting" family
  (Wild/Warren variants, ~16 campuses combined), OpenStax "Principles of Accounting Vol 1", Wiley
  "Financial Accounting: Tools for Business Decision Making". Concentration is real → strong reuse
  potential.
- **Noise flagged:** "Intermediate Accounting", "Canadian Income Taxation", "Bookkeeping for Dummies",
  "Small Business…" are mis-scoped (wrong course) — flagged `likely_noise` in the TOC worklist; exclude
  on review.

---

## 6. Mapping safety

- **Exam-1 chapter proposals: 46 campuses**, all **PROPOSED / NEEDS_REVIEW**. Confidence rises with
  agreement — the 1–4 pattern is now corroborated across dozens of independent syllabi.
- **Nothing auto-applied.** No student-facing topic/exam/chapter map was touched.
- **False-positive risks:** (1) topic-signal noise from non-accounting docs; (2) textbook mis-scoping
  (intermediate/tax); (3) the scattered high-chapter Exam-1 hits (alternate numbering); (4) historical
  dates must never be shown as if current.

---

## 7. Textbook TOC → taxonomy prep (prepared, NOT applied)

`COURSE_INTEL_TEXTBOOK_TOC_WORKLIST.csv/json` ranks the top ~30 recurring editions by campus coverage,
with `likely_noise` flags. This stages the **map-each-edition's-TOC → Survive-topics-once** pass — the
reuse engine that would scale the Exam-1 map to hundreds of campuses. **Do not auto-apply**; this is a
human-approved mapping step.

---

## 8. Finishing the parse — cost-scoped

- **Parsed so far:** all 319 syllabi + study guides (the crown jewels) + 652 from the harvest = 971.
- **Remaining discovered (2,254):** 407 schedules (→ more dates), ~960 unknown-PDFs (→ reclassify,
  some syllabi), plus homework/worksheet/lecture.
- **Firecrawl reality:** ~24 credits/PDF → finishing the remaining useful docs needs **~45–55k more
  Firecrawl credits**. Recommended split if you top up:
  1. **Schedules first (407)** → biggest timing win (`days_until_exam_1` near term start). ~10k credits.
  2. **Unknown-PDFs (~960)** → reclassify + capture more ranges/textbooks. ~25k credits.
  3. Skip catalog/faculty (identity only).
- **Efficiency fix to add first:** cache fetched markdown so a re-parse never re-pays Firecrawl (this
  pass didn't cache — a lesson from the bug).

---

## Final

**Ready for Growth V1: PARTIAL — but materially stronger than this morning.**
The **Exam-1 chapter map (Ch 1–4)**, **professor confirmations (211)**, and **textbook layer (101
campuses)** are now dashboard-ready. **Live exam timing is not** (1 future date) — ship the *estimated
window* instead, and revisit after parsing schedules near term start.

**Top 5 things to film/build next:**
1. **Exam-1 Chapter 1–4 core** — now STRONG evidence (87–96% for Ch 1–3, 65% for Ch 4).
2. **Parse the 407 schedules** (small Firecrawl spend) → unlock real `days_until_exam_1`.
3. **TOC → Survive-topic mapping** for the top ~15 clean editions (human-approved) — the reuse engine.
4. **Clean the topic-signal extractor** (drop non-accounting docs) before shipping a topic layer.
5. **Add markdown caching** to the parser so finishing the corpus costs Firecrawl once, not twice.

`course_readiness_status = COMING_SOON`, `course_readiness_score = null` (unchanged, by design).
