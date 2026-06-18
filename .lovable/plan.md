# Overnight Faculty Auto-Import

Run the Step #1 → Step #2 → Step #3 flow with zero clicks across all 170 active campuses while you sleep.

## What it does, per campus

1. Read `campuses.faculty_page_url` (newline-separated). If empty → skip and log `no_url`.
2. Call existing `scrapeCampusFaculty` logic on those URLs → fills `campus_lead_suggestions` exactly like the manual button does.
3. Auto-tag every fresh suggestion whose `title` matches (case-insensitive):
   `instructor | adjunct | associate | assistant | lecturer | teaching`
   with tag `Intro Target` and set status `kept`.
4. Run the existing `importTaggedLeads` logic → inserts into `outreach_leads`, archives suggestions, dedupes by email.
5. Write a row to a new `outreach_faculty_batch_runs` log table: `{campus_id, scraped, tagged, imported, skipped, error, finished_at}`.

## Scope filter

Active campuses (`archived_at is null`) with **zero** existing `outreach_leads` for that campus, AND a non-empty `faculty_page_url`. That's your 170 list minus the 6 already done.

## Architecture (matches existing `run-campus-batch` pattern)

```
pg_cron every 2 min
   └─► POST /api/public/hooks/faculty-overnight-batch (apikey header)
        ├─ picks up to 3 pending campuses from outreach_faculty_batch_queue
        ├─ marks them running (claim row)
        ├─ for each in parallel: scrape → auto-tag → import → log
        └─ when queue empty: pg_cron unschedules itself (or stays idle)
```

Why a queue table instead of looping inline: Firecrawl scrapes take 20–90s each; one HTTP request can't safely cover 170. The queue lets each tick handle 3 in parallel (~9 campuses/min, full run finishes in ~20 min, well within overnight).

## New files

- `migration/supabase-migrations/0020_faculty_overnight_batch.sql`
  - `outreach_faculty_batch_queue (id, campus_id, status, started_at, finished_at, error)`
  - `outreach_faculty_batch_runs (id, campus_id, scraped, tagged, imported, skipped, error, finished_at)`
  - GRANTs + RLS (`authenticated` full, `service_role` all; no anon).
  - pg_cron job calling the public route every 2 min with `apikey` header.
- `src/lib/faculty-overnight.server.ts` — shared helpers: `processOneCampus(campusId)` reusing `processUrls` + `importTaggedLeads` logic (extracted to a server module so it's safe to import here without `?tss-serverfn-split` issues).
- `src/routes/api/public/hooks/faculty-overnight-batch.ts` — TanStack server route, verifies `apikey` header against `SUPABASE_ANON_KEY`, claims up to 3 queue rows, processes in parallel.
- `src/lib/faculty-overnight.functions.ts` — `enqueueAllPendingCampuses` server fn (admin-only) that you click once to seed the queue, returns `{queued: N}`.

## Minor UI

Add a single button to the Lead Finder index page: **"Queue overnight auto-import (N campuses)"** that calls `enqueueAllPendingCampuses` and toasts the count. That's the only click required tonight.

## Title-match regex (auto-tag rule)

```ts
/\b(instructor|adjunct|associate|assistant|lecturer|teaching)\b/i
```

Applied to `campus_lead_suggestions.title` immediately after scrape; matching rows get tag `Intro Target` and `status='kept'`, then `importTaggedLeads(campusId)` runs. Non-matches stay as `pending_triage` so you can still review them later if you want.

## Safety / idempotency

- Queue row status transitions: `pending → running → done | failed`. A stuck `running` row >10 min old gets requeued automatically at the start of each tick.
- Existing dedupe in `importTaggedLeads` (by email + campus) prevents double-imports if a campus is re-run.
- All writes use `supabaseAdmin` inside the public route handler (verified by `apikey` header).
- Per-campus errors are caught, logged to `outreach_faculty_batch_runs.error`, and don't block the rest of the batch.

## Morning report

```sql
select status, count(*) from outreach_faculty_batch_queue group by 1;
select sum(imported) imported, sum(skipped) skipped, count(*) filter (where error is not null) failed
from outreach_faculty_batch_runs where finished_at > now() - interval '12 hours';
```

I'll surface that as a small summary card on the Lead Finder page as well.

## Out of scope (per your answers)

- No Google / SerpAPI step — we use the `faculty_page_url` already stored on each campus.
- No human-in-the-loop review — fully autonomous.
