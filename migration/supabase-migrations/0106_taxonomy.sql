-- 0106_taxonomy.sql — TAXONOMY LOCK (Option A): Unit / Topic / Exam, additive & non-breaking.
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- Locks three levels WITHOUT touching entitlements, student queries, or resolved topic-id sets:
--   • UNIT  = a `chapters` row (physical table name KEPT; relabeled "Unit" in the UI only). Stays
--             the access/entitlement currency — chapters.id is unchanged everywhere.
--   • TOPIC = new atomic authoring layer under a unit (public.topics). ADDITIVE — sets still attach
--             to chapters.id; topics do NOT become the entitlement currency in this pass.
--   • EXAM  = campus_exams (0105), unchanged.
-- "Chapter" survives only as a campus-facing display word (campus_chapter_overrides.chapter_label).
--
-- Access invariant: for Ole Miss Exam 1 the resolved topic-id set (campus_exam_topics.chapter_id)
-- is untouched here, so it is byte-identical pre/post. The guard below enforces the precondition.

-- ── PRE-FLIGHT GUARD ─────────────────────────────────────────────────────────────────────────
-- Ole Miss (University of Mississippi) Exam 1 MUST already be mapped. If it has zero topic rows,
-- abort the whole script and change nothing (a raised exception stops the SQL-editor batch).
do $$
declare n int;
begin
  select count(*) into n
    from public.campus_exam_topics t
    join public.campus_exams e on e.id = t.campus_exam_id
   where e.campus_id = '7b92a320-b196-43f2-a241-77a0805816fe'   -- University of Mississippi / Ole Miss
     and e.status = 'active'
     and e.name ~* '^\s*(exam|test)\s*1\s*$';
  if n = 0 then
    raise exception 'PRE-FLIGHT HALT (0106): Ole Miss (7b92a320) Exam 1 has zero mapped topics in campus_exam_topics. Map it in the outline Campuses folder before applying 0106. Nothing was changed.';
  end if;
end $$;

-- ── TOPIC: atomic authoring layer under a UNIT (chapters) ────────────────────────────────────
-- Additive. Sets keep attaching to chapters.id (the currency); topics group set subjects for
-- authoring + the gap indicator. Seeding topics from existing set subjects + linking sets is an
-- APP-SIDE step (sets live in canvas_scenes.nodes_json, not a table) — done in the UI pass.
create table if not exists public.topics (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.chapters(id) on delete cascade,  -- chapters row = UNIT
  name       text not null,
  sort_order numeric,
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists topics_unit_idx on public.topics(unit_id);
alter table public.topics enable row level security;
drop policy if exists "anon read topics" on public.topics;
create policy "anon read topics" on public.topics for select to anon using (true);
drop policy if exists "auth read topics" on public.topics;
create policy "auth read topics" on public.topics for select to authenticated using (true);

-- ── CAMPUS UNIT LABEL: text chapter_label replaces numeric local_number ───────────────────────
-- Campus chapter numbers become free text ("Ch 3", "Chapter 13", "Unit 2"). local_number is kept
-- (no data loss) but DEPRECATED — do not write new values. Backfill labels from existing numbers.
-- Self-sufficient: create campus_chapter_overrides if 0103 was never applied (matching 0103's
-- shape), so 0106 stands alone, then add the text label.
create table if not exists public.campus_chapter_overrides (
  campus_id    uuid not null references public.campuses(id) on delete cascade,
  chapter_id   uuid not null references public.chapters(id) on delete cascade,
  local_number numeric,
  local_order  numeric,
  updated_at   timestamptz not null default now(),
  primary key (campus_id, chapter_id)
);
create index if not exists cco_chapter_idx on public.campus_chapter_overrides(chapter_id);
alter table public.campus_chapter_overrides enable row level security;
drop policy if exists "anon read cco" on public.campus_chapter_overrides;
create policy "anon read cco" on public.campus_chapter_overrides for select to anon using (true);
drop policy if exists "auth read cco" on public.campus_chapter_overrides;
create policy "auth read cco" on public.campus_chapter_overrides for select to authenticated using (true);

alter table public.campus_chapter_overrides add column if not exists chapter_label text;
comment on column public.campus_chapter_overrides.local_number is
  'DEPRECATED 0106 — superseded by chapter_label (text). Retained for back-compat / no data loss; do not write new values.';
update public.campus_chapter_overrides
   set chapter_label = 'Ch ' || (local_number::int)::text
 where chapter_label is null and local_number is not null;

-- ── DEFAULT MAP: unit → default exam number, seeded from Ole Miss ─────────────────────────────
-- A new campus inherits this instantly, then edits diffs from it. Foundations sits first (Exam 1);
-- the Foundations UNIT itself + moving the "Start Here" starter sets under it is an APP-SIDE step.
create table if not exists public.default_exam_units (
  unit_id        uuid primary key references public.chapters(id) on delete cascade,
  exam_number    int not null default 1,      -- which exam this unit defaults into
  sort_order     numeric,                       -- teaching order
  is_foundations boolean not null default false
);
alter table public.default_exam_units enable row level security;
drop policy if exists "anon read default_exam_units" on public.default_exam_units;
create policy "anon read default_exam_units" on public.default_exam_units for select to anon using (true);
drop policy if exists "auth read default_exam_units" on public.default_exam_units;
create policy "auth read default_exam_units" on public.default_exam_units for select to authenticated using (true);

-- Seed the default map from Ole Miss's exam map (each unit's default exam = the Ole Miss exam it's
-- in; a unit in more than one exam takes the earliest). exam_number parsed from "Exam N" (Final /
-- non-numeric → 99, sorts last). on conflict do nothing → idempotent + never overwrites edits.
insert into public.default_exam_units (unit_id, exam_number, sort_order)
select distinct on (t.chapter_id)
       t.chapter_id                                                       as unit_id,
       coalesce(nullif(regexp_replace(e.name, '\D', '', 'g'), '')::int, 99) as exam_number,
       coalesce(e.position, 1)                                            as sort_order
  from public.campus_exam_topics t
  join public.campus_exams e on e.id = t.campus_exam_id
 where e.campus_id = '7b92a320-b196-43f2-a241-77a0805816fe'
   and e.status = 'active'
 order by t.chapter_id, e.position nulls last
on conflict (unit_id) do nothing;
