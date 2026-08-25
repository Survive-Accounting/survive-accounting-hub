# Greek Academic Intelligence

Opportunistic, public-only ingestion of university Fraternity & Sorority Life (FSL)
**academic / GPA reports**, attached to canonical campuses + `campus_greek_chapters`.
Internal market intelligence — **never** a public GPA ranking, never individual-student data.

## Pipeline
`runner.mjs` (bounded/resumable/concurrent) → per campus:
1. `discovery.mjs` — site-scoped SERP queries; on-**campus-domain-only** keep-filter
   (blocks private LMS, doc-mills, cross-campus contamination); archive-page-first
   (fetch the FSL report archive once, follow its semester links).
2. domain resolution — for campuses with no stored domain, one conservative SERP
   lookup (accepts a `.edu` only if it appears in ≥2 top results).
3. `providers.mjs` — Firecrawl renders HTML/PDF → markdown; Gemini 2.5-flash
   extracts a structured report (`aiExtractReport`).
4. `match.mjs` — resolves reported chapter names (Greek-letter/nickname/acronym
   aware, council-gated) → `MATCHED | NEEDS_REVIEW | UNMATCHED`, never forcing.
5. `quality.mjs` — clamps/flags implausible GPA/member/percent values (spec §20).
6. `db.mjs` — upserts `greek_academic_reports` + replaces `greek_chapter_academics`
   (idempotent), writes `greek_academic_campus_status` (failure-isolated).

`metrics.mjs` — council-normalized derived metrics + versioned **Academic Need Score**
(`src/lib/greek-academic/scoring-config.json`) → `greek_chapter_academic_metrics`.

`report.mjs` — CSV + Markdown outputs in `greek-academic-output/`.

## Run
```bash
set -a && . ./.env.run && set +a          # SERPAPI/FIRECRAWL/AI_GATEWAY + SUPABASE keys
node scripts/greek-academic/runner.mjs --preflight            # dry-run plan
node scripts/greek-academic/runner.mjs --preflight --execute  # 10 diverse campuses
node scripts/greek-academic/runner.mjs --execute --budget-usd 50 --max-serp 3500 --concurrency 3
node scripts/greek-academic/metrics.mjs                       # compute need scores
node scripts/greek-academic/report.mjs                        # emit CSVs + report
```
DRY-RUN by default; `--execute` spends. Resumable via `.greek-academic-checkpoint.json`.
Conservative concurrency by design — scarce resource is reliability/upstream load,
not SERP credits. Never increase concurrency merely because credits are available.

## Guarantees
- Public data only; never touches authenticated portals.
- On-domain-only attribution → no cross-campus contamination (verified 0 in preflight).
- `NO_PUBLIC_DATA` is a valid completed outcome; GPAs are never invented.
- Deny-by-default RLS; reads/writes via service role only.
- Does **not** mutate market/opportunity scores — feeds the reserved
  market-intel `course_readiness_*` / greek-distribution slots read-only.
