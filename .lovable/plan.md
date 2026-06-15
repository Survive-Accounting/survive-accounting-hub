# Batch Campus Research — Run All 170 In Background

## Goal
Kick off a background job from the Campuses tab that runs the full research pipeline (profile → suggested leads → class sections) across every campus, 3 in parallel, while you're away. Add a smarter "course prefix discovery" step so non-USC schools get better section coverage. Surface a simple progress panel so you can see X/170 done and which campuses failed when you return.

**Expected cost:** ~$5–$15 in Lovable AI credits total (~14–15 calls/campus × 170 ≈ 2,500 calls on Gemini Flash with Google Search).
**Expected runtime:** ~1–1.5 hours at 3-in-parallel.

---

## How it will work

### 1. Job tracking table
A new `campus_research_jobs` table tracks each run end-to-end and a `campus_research_job_items` table tracks per-campus status. This makes the batch resumable and observable — if a campus fails, you can retry just that one, and a crashed worker picks up where it left off.

Per-campus status flow:
```
pending → running → done
                 ↘ failed (with error message + which step failed)
```

Each item also stores per-step results: profile_done, leads_count, sections_count, families_with_zero (so you can see at a glance which schools need manual cleanup).

### 2. Adaptive course-prefix probe (new mini-step)
Before running `research-campus-sections`, a cheap one-shot Gemini call asks: *"At {school}, what course prefixes are used for intro accounting, intro finance, business stats, and econ? Return JSON."* That answer feeds into the per-family prompts so schools with weird codes (e.g. ACCY 200 at one school, BA 211 at another, AC 201 at a community college) get a much better hit rate. Result is cached on the campus row so re-runs skip the probe.

### 3. Background worker (cron-driven)
A new `/api/public/hooks/run-campus-batch` endpoint, called every minute by pg_cron with the anon key, does:
- Pick up to 3 `pending` campus job items
- Mark them `running`
- For each: call research-campus → leads → prefix probe → sections (sequential per campus, 3 campuses in parallel)
- Update status + per-step counts
- On failure: store error message, mark `failed`, continue with others

This pattern avoids edge-function timeout (Lovable Cloud functions have ~150s caps) and gives natural rate-limit relief — only 3 campuses × ~15 calls = ~45 calls per minute, well under gateway caps.

### 4. UI — minimal progress panel
A new "Batch research" card at the top of the Campuses tab with:
- **Start batch** button (with cost estimate + confirmation)
- Live progress bar: "47 / 170 done · 3 running · 2 failed"
- Collapsible "Failed campuses" list with retry button per row
- Collapsible "Recently completed" list with leads_count and sections_count per campus
- Pause / Resume / Cancel batch buttons

Polls every 5 seconds while a batch is active.

### 5. Versatility improvements for the section scraper
Beyond the prefix probe, three small additions to `research-campus-sections`:
- **Faculty fallback**: if a family returns 0 sections, log a `no_schedule_found` note on the campus so we know to capture leads via the faculty-directory path instead (no extra cost — just better visibility).
- **Term auto-detection**: ask the AI to also return what term it found data for, so mismatched semesters are visible in debug.
- **Resilience to login walls**: explicit prompt instruction to skip any URL behind a login (already partially there, made stricter).

---

## Files to add / change

**New:**
- `supabase/migrations/[ts]_campus_research_jobs.sql` — `campus_research_jobs`, `campus_research_job_items` tables + GRANTs + RLS
- `supabase/functions/discover-campus-prefixes/index.ts` — small Gemini call, caches result on `campuses.discovered_course_prefixes` (jsonb column added in migration)
- `src/routes/api/public/hooks/run-campus-batch.ts` — TanStack server route, called by pg_cron, processes up to 3 pending items per tick
- `src/components/outreach/BatchResearchPanel.tsx` — the progress card UI
- pg_cron schedule (via `supabase--insert` after deploy) — runs every minute with anon key

**Edit:**
- `supabase/functions/research-campus-sections/index.ts` — accept optional `prefix_overrides` param, use them in family prompts when present; add term auto-detect + login-wall instruction
- `src/lib/outreach-api.ts` — add `startCampusBatch()`, `getBatchStatus()`, `retryBatchItem()`, `cancelBatch()` helpers
- `src/routes/outreach.tsx` — render `<BatchResearchPanel />` at top of Campuses tab

---

## What I'm NOT changing
- The existing per-campus "Approve / Research" buttons stay; batch is additive.
- No changes to suggested leads UI, lead scoring, or outreach scheduling.
- No Rate My Professors integration.
- No new secrets needed (uses existing `LOVABLE_API_KEY` + `SUPABASE_ANON_KEY` for cron auth).

---

## What you can do when you come back
- Check the panel: see X/170 done, failure list with reasons
- Click "Retry" on any failed campus (or "Retry all failed")
- Browse new suggested leads + sections per campus normally
- Families showing 0 sections will be flagged in the campus row so you can decide whether to manually point research at a specific URL later

---

## Risks / honest caveats
- **170 schools is heterogeneous.** Expect 10–20% to produce thin section data (private schools with gated schedules, community colleges with PDF-only schedules). Suggested leads should still work for ~95%.
- **Cost could go higher** if many campuses retry — capped at 2 retries per step. Worst case still under ~$25.
- **First batch is the learning batch.** After you review the first 30–40 results we'll likely tune the family prompts further. Plan to do that next session.
