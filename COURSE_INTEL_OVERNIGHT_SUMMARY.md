# Course Intel — Overnight Harvest Summary

_Generated 2026-08-25T13:24:36.303Z · branch `overnight/course-intel-harvest` · no deploy, no student-map edits._

## Final report
- **Campuses attempted:** 872
- **Campuses with any docs:** 449
- **Campuses with syllabi:** 234
- **Campuses with exam/study-guide evidence:** 47
- **Total unique documents:** 3389
- **Unique professors CONFIRMED Intro-1 (from docs):** 124
- **Textbooks identified (distinct title|edition):** 101
- **SERP searches:** 3237
- **Firecrawl fetches:** 833
- **AI parses:** 745  ·  est. spend ≈ **$53.53**
- **Failures:** 15
- **NO_RESULT campuses:** 408
- **Waiting on upstream backfill:** 11 for course-code · 1 for professors
- **Review queue size:** 1008

## Status breakdown
| status | campuses |
|---|---|
| COMPLETE | 63 |
| NEEDS_REVIEW | 386 |
| NO_RESULT | 408 |
| FAILED | 15 |
| RUNNING/NOT_RUN | 0 |

## Dashboard aggregate (per campus)
Powered by `course_intel_campus_status` — one row per campus with: `course_intel_status`,
`documents_found`, `recent_syllabus_found`, `study_guide_found`, `textbook_identified`,
`confirmed_intro1_prof_count`, `course_intel_last_updated`. **COURSE_READINESS = COMING_SOON**
(not scored yet — deliberately).

## Deliverables
- `COURSE_INTEL_CAMPUS_STATUS.csv` (884 rows)
- `COURSE_INTEL_DOCUMENTS.csv` (3389 rows)
- `INTRO1_PROFESSOR_EVIDENCE.csv` (502 rows)
- `COURSE_INTEL_REVIEW_QUEUE.csv` (1008 rows)

## Review queue priorities
1. conflicting professor evidence · multiple textbook editions
2. exam mappings needing human approval (PROPOSED / NEEDS_REVIEW only — never auto-applied)
3. ambiguous course identity (no code)
4. high-value campuses returning NO_RESULT

**COURSE INTEL READY FOR DASHBOARD INTEGRATION:** YES

---

## Overnight run notes (final)

**Pipeline:** nationwide sweep (884/884) → SEC preflight gate (PASS) → follow-behind catch-up
(2 passes) behind the still-running structural Campus Backfill. No deploy; no student-map edits.

**Documents:** 652 parsed (evidence extracted) · 2,653 discovered (URL captured, awaiting parse) ·
84 fetch-error. The discovery layer (SerpAPI) is complete for the harvested universe; the remaining
parse work is cheap and resumable (`parseCourseDocument` is content-hash-guarded and idempotent).

**Stopping constraint — Firecrawl exhausted (0 / 100,000 credits).** Firecrawl fetches document text
for parsing; with it exhausted, later campuses' tier-1/2 docs were discovered but not parsed, and the
upstream Campus Backfill (also Firecrawl-dependent) stalled (intro-code count flat at 418 for 2.5h),
so no new campuses became eligible. **SerpAPI renewed mid-run (~14,400 available) and is NOT the
constraint.** The worker caught up to everything currently eligible and idled out cleanly.

**Waiting on upstream backfill:** 11 campuses need a course code, 1 needs professors (Pass A/B become
eligible automatically once the backfill supplies those — no RMP dependency).

**Recommended next actions:**
1. Top up Firecrawl credits (SerpAPI is already fine).
2. Re-run the follow-behind worker: `node scripts/course-intel-harvest/follow-behind.mjs --execute
   --skip-sec` — it will parse the 2,653 discovered docs, extract the remaining evidence, and pick up
   any campuses the backfill has since enriched (per-pass skip means no re-paid discovery).
3. Human review of `COURSE_INTEL_REVIEW_QUEUE.csv` (exam-mapping proposals, multi-edition textbooks,
   conflicting professor evidence). All mappings remain PROPOSED / NEEDS_REVIEW — none auto-applied.

**COURSE_READINESS = COMING_SOON** (not scored, by design).
