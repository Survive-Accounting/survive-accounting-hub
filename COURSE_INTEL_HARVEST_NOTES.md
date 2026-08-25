# Course Intel — Nationwide Document Harvest (implementation note)

**Branch/worktree:** `overnight/course-intel-harvest` · based on `course-intel-v1` (9f3b5831)
**Date:** 2026-08-24 · **Scope:** build + harden + run a first-pass nationwide harvest of
public Intro-Financial-Accounting course documents. No deploy. No production student-mapping edits.

---

## 1. What already existed (audited first — reused, not rebuilt)

The document-intel pipeline is **already built** in this branch. The harvest is an *orchestration +
hardening* layer on top of it, not a greenfield pipeline.

| Concern | Existing asset | Reuse |
|---|---|---|
| Pure classifiers/parsers | `scripts/course-intel/lib.mjs` (+ `.test.mjs`), `src/lib/course-intel-shared.ts` | **Imported directly**: `classifyDocument`, `parseExamChapterRanges`, `normalizeTextbook`, `scoreConfidence`, `freshnessWeight`, `introOneCount`/`isIntro1Qualified`/`intro1Tier` |
| Discovery logic | `src/lib/syllabus-intel.functions.ts` → `discoverCourseDocuments` (SERP→classify→upsert), `parseCourseDocument` (Firecrawl→Gemini→evidence, hash-guarded) | **Logic ported** into a batch engine (`providers.mjs`+`harvest.mjs`) so it runs headless without the app runtime and without touching the running backfill |
| Document/evidence schema | `course_document`, `course_evidence`, `textbooks(edition_key,…)`, `textbook_chapter_topic_mapping` (migrations `20260823_1730` + `20260823_2030`, **applied live**) | **Same tables written** — no parallel pipeline. `course_document` already carries `content_hash`, `discovered_by`, `first_seen/last_checked/last_changed`, `is_public_source/access`, `unique(campus_id,source_url)` |
| Professor entity | `campus_lead_suggestions` (17,613 rows); Intro-1 qualification via `rmp_target_course_counts_json.intro_1` | Read for Pass B candidate professors; **documents add a second, non-RMP evidence path** |
| Orchestration | `scripts/profintel/batch-runner.mjs` (hard budget/request/runtime/campus guards, resumable checkpoint, concurrency, retry cap, SIGINT, JSONL cost log) | **Pattern reused** in `runner.mjs`; CSV loader swapped for a Supabase universe loader; dry-run simulator swapped for the live harvest executor |
| API conventions | SerpAPI `search.json?engine=google`; Firecrawl `v2/scrape {formats:[markdown],onlyMainContent}`; AI Gateway `ai-gateway.vercel.sh/v1/chat/completions` model `google/gemini-2.5-flash` | Ported verbatim into `providers.mjs`; keys from `SERPAPI_API_KEY`/`FIRECRAWL_API_KEY`/`AI_GATEWAY_API_KEY` |
| Course-code discovery | `researchProgramCourses` (`src/lib/program-courses.functions.ts`) fills `course_family_codes_json` for code-less campuses | Not re-run here (the running backfill owns it); Pass A works with or without a code |

## 2. What was added (this branch)

1. **Batch harvest engine** — `scripts/course-intel-harvest/`:
   - `providers.mjs` — SerpAPI / Firecrawl / AI-Gateway clients + balance checks (`/account.json`, `/v2/team/credit-usage`).
   - `db.mjs` — PostgREST service-role client: universe loader, professor loader, document/evidence/textbook upserts, status upserts.
   - `harvest.mjs` — the two-pass executor (`harvestCampus`). Pass A = campus+course; Pass B = professor+course. Progressive query stopping, URL+content-hash dedupe, restricted-host skip, public-only, provenance.
   - `runner.mjs` — guarded/checkpointed/concurrent runner (batch-runner pattern) over the campus universe.
   - `report.mjs` — generates the morning deliverables from the DB.
   - `universe.mjs` — the eligible-campus filter (documented below).
2. **Two new tables** (`migration/supabase-migrations/20260824_2100_course_intel_harvest_status.sql`,
   applied via `run_sql.ts`): `course_intel_campus_status` (per-campus research status + counts →
   dashboard aggregate + status CSV) and `professor_intro1_evidence` (document-derived professor
   Intro-1 evidence — the non-RMP path). Both additive, RLS deny-by-default (service-role writes).
3. **Bug fix (hardening):** the existing discovery read the Intro-1 code from `course_codes_json`
   (which is empty `{}`/`[]` for essentially every campus). The real code lives in
   **`course_family_codes_json.intro_1`** (plain string, 346 campuses) with the title in
   `course_family_titles_json.intro_1`. The harvest reads the correct columns + title variants.

## 3. Eligible campus universe (~816 target)

There is no stored `is_target` flag. The universe is defined by filter (documented in `universe.mjs`):

```
FROM campuses
WHERE is_research_only = false          -- drop R1 research-only (no intro course), 99 rows
  AND name NOT ILIKE '%test%'           -- drop the "Test University" fixture
  AND (institution_type IS DISTINCT FROM 'system')  -- drop district/system aggregate rows (15)
```

then **de-duplicated at load** by primary domain + normalized name (collapses alias rows), keeping the
richest row. Yields ≈ the approved structural universe. Excluded: research-only, test fixtures, system
aggregates, alias duplicates. The exact selected count is reported by the runner and in the summary.

## 4. Professor Intro-1 evidence states (non-RMP)

Documents become evidence, independent of RMP (per the strategy change):

- `ACCOUNTING_PROFESSOR` — in `campus_lead_suggestions`, accounting dept (already known).
- `POSSIBLE_INTRO1` — name co-occurs with the Intro-1 code in a SERP title/snippet.
- `LIKELY_INTRO1` — name on a fetched public Intro-1 syllabus/schedule (parsed doc, any recency).
- `CONFIRMED_INTRO1` — name on a **recent** public Intro-1 syllabus/schedule from an **official**
  (HIGH-quality, on-domain) source with the exact course code. RMP is **not** required.

Low-confidence (third-party) evidence alone never yields `CONFIRMED_INTRO1`. Evidence is stored, never
overwritten; every relationship keeps its `source_url`.

## 5. Hard boundaries (unchanged from the built pipeline)

Public sources only; restricted mills (Course Hero/Scribd/Chegg/Quizlet/Studocu/…) are recorded but
never fetched. Store bibliographic/structural metadata only — never prose, questions, answer keys, or
assignments. Documents create **PROPOSED / NEEDS_REVIEW** mapping signals only; no live student
exam-mapping is mutated. `COURSE_READINESS = COMING_SOON` (not scored yet).
