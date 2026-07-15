-- 0091_scenario_placements.sql
-- CROSS-COURSE SCENARIO PLACEMENT. A scenario is authored ONCE and can appear in
-- many course-chapters. Placement moves OUT of je_scenarios (chapter_id, sort_order)
-- into a join so "Owner invests cash for common stock" can be the SAME row in
-- Start Here Ch 1 (equation lens), Ch 4 (JE lens), and later Intro 1 Ch 3 —
-- edit once, updates everywhere.
--
-- Idempotent; safe to re-run. Numbered after the true high-water (0090_canvas_decks).
--
-- ORDER OF OPERATIONS for Lee:
--   1. Run PARTS 1–3 (create table + backfill + RLS). The app is deployed to read
--      placements exclusively; verify the pickers still resolve every scenario.
--   2. THEN run PART 4 (drop the legacy columns) once the placements read is confirmed.
--      Nothing reads chapter_id/sort_order after the code deploy, so the drop is safe —
--      it is split out only so you control the timing.

-- ============================================================================
-- PART 1 — scenario_placements: the join. A scenario keeps identity/content
-- (title, doc, status, source); placement (which course-chapter, in what order)
-- lives here, many rows per scenario.
-- ============================================================================
create table if not exists public.scenario_placements (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.je_scenarios(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (scenario_id, chapter_id)
);

create index if not exists scenario_placements_chapter_idx on public.scenario_placements(chapter_id);
create index if not exists scenario_placements_course_idx on public.scenario_placements(course_id);
create index if not exists scenario_placements_scenario_idx on public.scenario_placements(scenario_id);

-- ============================================================================
-- PART 2 — backfill: every je_scenarios row that currently carries a chapter_id
-- becomes ONE placement, preserving its course (via the chapter) and sort_order.
-- Guarded by NOT EXISTS + the unique constraint so re-runs never duplicate.
-- ============================================================================
insert into public.scenario_placements (scenario_id, course_id, chapter_id, sort_order)
select s.id, ch.course_id, s.chapter_id, coalesce(s.sort_order, 0)
from public.je_scenarios s
join public.chapters ch on ch.id = s.chapter_id
where s.chapter_id is not null
on conflict (scenario_id, chapter_id) do nothing;

-- ============================================================================
-- PART 3 — RLS: deny-by-default, same posture as course_coa (0087) / canvas_scenes
-- (0084). All reads/writes go through the service-role server functions. Anon may
-- SELECT (students read placements to resolve a course's scenario set, never write).
-- ============================================================================
alter table public.scenario_placements enable row level security;

drop policy if exists "anon select scenario_placements" on public.scenario_placements;
create policy "anon select scenario_placements"
  on public.scenario_placements for select to anon using (true);

drop policy if exists "auth all scenario_placements" on public.scenario_placements;
create policy "auth all scenario_placements"
  on public.scenario_placements for all to authenticated using (true) with check (true);

-- ============================================================================
-- PART 4 — DROP the legacy placement columns from je_scenarios.
-- RUN ONLY AFTER the placements-reading app is deployed and verified (step 2 above).
-- The scenario row keeps identity/content; course/chapter now live in the join.
-- ----------------------------------------------------------------------------
-- alter table public.je_scenarios drop column if exists chapter_id;
-- alter table public.je_scenarios drop column if exists sort_order;
