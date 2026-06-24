-- 0025_je_chapter_links.sql
-- v2: organize JE scenarios by chapter/course, reusing the EXISTING chapters/courses
-- tables (created in 0002). We do NOT invent a new chapter system.
--
-- What this does:
--   1. Adds je_scenarios.chapter_id (+ optional chapter_topic_id), referencing chapters.
--   2. Seeds an Ole Miss intro course (ACCY 201) + a starter set of textbook chapters,
--      if missing. Generalizes — nothing in the app hardcodes Ole Miss; this is just seed data.
--   3. Best-effort links ACCY 201 to an existing Ole Miss campus via campus_courses (only
--      if such a campus already exists — never creates a campus).
--   4. Tags the four 0021 seed scenarios to appropriate chapters.
--   5. Sets v2 UI flags (sequence sidebar + memorization grid) on the merch-sale scenario as
--      the showcase — both are legitimate for the merchandising cycle. Other scenarios stay
--      un-flagged, so those placeholders stay hidden by default.
--
-- Every statement is idempotent; safe to re-run. Depends on 0002 (chapters/courses) and
-- 0021 (je_scenarios + the four seed scenarios).

-- ---------------------------------------------------------------------------
-- 1. Link column(s)
-- ---------------------------------------------------------------------------
alter table public.je_scenarios
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null;
alter table public.je_scenarios
  add column if not exists chapter_topic_id uuid references public.chapter_topics(id) on delete set null;

create index if not exists je_scenarios_chapter_id_idx on public.je_scenarios (chapter_id);

-- ---------------------------------------------------------------------------
-- 2. Seed the Ole Miss intro course + a starter set of chapters
-- ---------------------------------------------------------------------------
insert into public.courses (code, course_name, slug)
select 'ACCY 201', 'Principles of Accounting I', 'accy-201'
where not exists (select 1 from public.courses where slug = 'accy-201');

-- Starter chapter set (typical intro-financial sequence). Idempotent by (course, number).
insert into public.chapters (course_id, chapter_number, chapter_name)
select co.id, v.num, v.name
from public.courses co
cross join (values
  (1::numeric, 'Accounting in Action'),
  (2::numeric, 'The Recording Process'),
  (3::numeric, 'Adjusting the Accounts'),
  (4::numeric, 'Completing the Accounting Cycle'),
  (5::numeric, 'Accounting for Merchandising Operations'),
  (6::numeric, 'Inventories'),
  (9::numeric, 'Plant Assets, Natural Resources, and Intangibles')
) as v(num, name)
where co.slug = 'accy-201'
  and not exists (
    select 1 from public.chapters c where c.course_id = co.id and c.chapter_number = v.num
  );

-- ---------------------------------------------------------------------------
-- 3. Best-effort: link ACCY 201 to an existing Ole Miss campus (only if one exists)
-- ---------------------------------------------------------------------------
insert into public.campus_courses (campus_id, course_id, local_course_code, local_course_name, is_active)
select ca.id, co.id, 'ACCY 201', 'Principles of Accounting I', true
from public.campuses ca
cross join public.courses co
where co.slug = 'accy-201'
  and (
    ca.name ilike '%ole miss%' or ca.name ilike '%university of mississippi%'
    or ca.institution_name ilike '%ole miss%' or ca.institution_name ilike '%university of mississippi%'
    or ca.short_name ilike '%ole miss%'
  )
  and not exists (
    select 1 from public.campus_courses cc where cc.campus_id = ca.id and cc.course_id = co.id
  );

-- ---------------------------------------------------------------------------
-- 4. Tag the four 0021 seed scenarios to chapters
--    unearned revenue + depreciation → Ch 3 (Adjusting); merch sale → Ch 5;
--    equipment disposal → Ch 9 (Plant Assets).
-- ---------------------------------------------------------------------------
update public.je_scenarios s
set chapter_id = c.id
from public.chapters c
join public.courses co on co.id = c.course_id
cross join (values
  ('adjust-unearned-revenue', 3::numeric),
  ('adjust-depreciation',     3::numeric),
  ('merch-sale',              5::numeric),
  ('sell-equipment-cash',     9::numeric)
) as m(slug, num)
where co.slug = 'accy-201'
  and c.chapter_number = m.num
  and s.slug = m.slug;

-- ---------------------------------------------------------------------------
-- 5. v2 UI flags — showcase the sequence sidebar + memorization grid on merch-sale.
--    (Stored in the jsonb doc so no column is needed to toggle them per scenario.)
-- ---------------------------------------------------------------------------
update public.je_scenarios
set doc = jsonb_set(
            jsonb_set(
              jsonb_set(doc, '{isSequence}', 'true'::jsonb, true),
              '{sequenceGroup}', '"merchandising-cycle"'::jsonb, true
            ),
            '{hasMemorizationGrid}', 'true'::jsonb, true
          )
where slug = 'merch-sale';
