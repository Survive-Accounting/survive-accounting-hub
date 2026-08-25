# Course Intel — nationwide document harvest

A bounded, resumable, headless batch harvest of **public** Intro-Financial-Accounting course
documents for the eligible campus universe. Reuses the app's built pipeline (`discoverCourseDocuments`
/ `parseCourseDocument` logic, `course_document`/`course_evidence` tables, `scripts/course-intel/lib.mjs`
classifiers) and the ProfIntel batch-runner guard model. See `../../COURSE_INTEL_HARVEST_NOTES.md`.

## Files
- `providers.mjs` — SerpAPI / Firecrawl v2 / AI-Gateway (gemini-2.5-flash) clients + balance checks.
- `db.mjs` — PostgREST service-role reads/writes.
- `universe.mjs` — eligible-campus filter (`is_research_only=false`, no test fixtures, no system
  aggregates, dedupe by domain+name) and the diverse 10-campus preflight set.
- `harvest.mjs` — the per-campus executor. **Precision-first**: on-campus-domain only, continuing-ed
  and vocational filtered, college-accounting relevance gate. Pass A (campus+course) + Pass B
  (professor+course). Writes docs/evidence/textbooks + `course_intel_campus_status` +
  `professor_intro1_evidence`.
- `runner.mjs` — guarded/checkpointed/concurrent runner. DRY-RUN by default.
- `report.mjs` — generates the morning CSVs + summary from the live tables.

## Run

```bash
# load keys (worktree-local, gitignored)
set -a && . ./.env && set +a

# dry-run (no network): validate the universe + selection
node scripts/course-intel-harvest/runner.mjs --preflight --dry-run

# live preflight (10 diverse campuses, tight guards)
node scripts/course-intel-harvest/runner.mjs --preflight --execute --pass both --budget-usd 8 --max-serp 250

# nationwide Pass A (campus+course), then Pass B (professor+course)
node scripts/course-intel-harvest/runner.mjs --pass A --execute --budget-usd 90 --max-serp 5000 --concurrency 2
node scripts/course-intel-harvest/runner.mjs --pass B --execute --budget-usd 60 --max-serp 4000 --concurrency 2

# deliverables
node scripts/course-intel-harvest/report.mjs
```

## Guards (all HARD; runner stops BEFORE breaching)
`--budget-usd`, `--max-serp` (the binding constraint — shared SerpAPI pool), `--max-runtime-min`,
`--max-campuses`. Resumable via `.harvest-checkpoint.json` (idempotent; keyed by campus+pass). SIGINT
= graceful stop. A 429 triggers a 60s cooldown. Per-campus JSONL cost log next to the checkpoint.

## Boundaries
Public sources only; restricted mills recorded, never fetched. Bibliographic/structural metadata
only. Documents produce PROPOSED / NEEDS_REVIEW signals — **never** auto-edit live student maps.
`COURSE_READINESS = COMING_SOON`.
