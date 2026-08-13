-- 0087_content_reset.sql
-- CONTENT RESET: scenario lifecycle flags + course-scoped COA sets + course seeds.
-- Nothing is deleted — every imported scenario stays queryable, just archived.
-- Idempotent; safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. je_scenarios lifecycle flags.
--    Columns are ADDED with archived/imported defaults so every EXISTING row
--    (all imported today) is bulk-archived by the add itself; the defaults then
--    flip to active/authored for everything Lee saves from the canvas onward.
--    Re-running never touches rows again (add column if not exists no-ops).
-- ---------------------------------------------------------------------------
alter table public.je_scenarios add column if not exists status text not null default 'archived';
alter table public.je_scenarios add column if not exists source text not null default 'imported';
alter table public.je_scenarios add column if not exists sort_order integer;

alter table public.je_scenarios alter column status set default 'active';
alter table public.je_scenarios alter column source set default 'authored';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'je_scenarios_status_check') then
    alter table public.je_scenarios
      add constraint je_scenarios_status_check check (status in ('active','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'je_scenarios_source_check') then
    alter table public.je_scenarios
      add constraint je_scenarios_source_check check (source in ('authored','imported'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Course-scoped COA sets. The master chart_of_accounts stays untouched as
--    the reference vocabulary; course_coa maps a course to its curated subset.
--    Deny-by-default RLS — reads and writes go through the service-role server
--    functions, same posture as canvas_scenes (0084).
-- ---------------------------------------------------------------------------
create table if not exists public.course_coa (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (course_id, account_id)
);

alter table public.course_coa enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Course seeds: Foundations exists (0081). Ensure Intro 1 / Intro 2 course
--    rows exist (campus-agnostic, one per family). Their authored libraries and
--    COA sets start EMPTY by construction — Lee hand-builds both from the
--    canvas. No scenario or course_coa rows are seeded on purpose.
-- ---------------------------------------------------------------------------
insert into public.courses (course_name, slug, course_family)
select 'Introductory Accounting 1', 'intro-accounting-1', 'intro1'
where not exists (select 1 from public.courses where course_family = 'intro1');

insert into public.courses (course_name, slug, course_family)
select 'Introductory Accounting 2', 'intro-accounting-2', 'intro2'
where not exists (select 1 from public.courses where course_family = 'intro2');
