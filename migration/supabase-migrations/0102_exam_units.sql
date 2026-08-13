-- 0102_exam_units.sql — exam-unit grouping over chapters/topics [Prompt 2]
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- Units group a course's chapters into exam sections ("Exam 1 = Ch 1-4"). Many-to-many: a
-- chapter may sit in more than one unit (e.g. a cumulative final). Additive — chapters and the
-- CEQ-set model (DeckDef in scene JSON) are untouched; a unit is derived from chapter membership.

create table if not exists public.exam_units (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  name       text not null,                 -- "Exam 1", "Midterm", "Final"
  position   numeric,                        -- order within the course (nullable, like chapter_number)
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists exam_units_course_idx on public.exam_units(course_id);

create table if not exists public.exam_unit_chapters (
  exam_unit_id uuid not null references public.exam_units(id) on delete cascade,
  chapter_id   uuid not null references public.chapters(id)   on delete cascade,
  position     numeric,                       -- optional chapter order within the unit
  primary key (exam_unit_id, chapter_id)
);
create index if not exists exam_unit_chapters_chapter_idx on public.exam_unit_chapters(chapter_id);

alter table public.exam_units         enable row level security;
alter table public.exam_unit_chapters enable row level security;

-- READ open to anon + authenticated (unit names/grouping are not sensitive, and mirror the
-- "anon read chapters" grant in 0080). WRITES have no policy → denied for anon/authenticated;
-- all authoring goes through service-role server fns (exam-units.functions.ts), which bypass RLS.
drop policy if exists "anon read exam_units" on public.exam_units;
create policy "anon read exam_units" on public.exam_units for select to anon using (true);
drop policy if exists "auth read exam_units" on public.exam_units;
create policy "auth read exam_units" on public.exam_units for select to authenticated using (true);

drop policy if exists "anon read exam_unit_chapters" on public.exam_unit_chapters;
create policy "anon read exam_unit_chapters" on public.exam_unit_chapters for select to anon using (true);
drop policy if exists "auth read exam_unit_chapters" on public.exam_unit_chapters;
create policy "auth read exam_unit_chapters" on public.exam_unit_chapters for select to authenticated using (true);
