-- 0062_courses_dedupe_and_family.sql
-- Course dedupe (IA2 + the trivial ones) and the course_family concept column.
--
-- Background: the live DB ended up with TWO course rows per course family:
--   canonical (old app, fixed uuids, own all CEQ content via their chapters):
--     INTRO1 11111111-…  intro-accounting-1
--     INTRO2 22222222-…  intro-accounting-2
--     IA1    33333333-…  intermediate-accounting-1
--     IA2    44444444-…  intermediate-accounting-2
--   duplicates (created by 0027's seed, empty chapters):
--     accy-201 / accy-202 / accy-303 / accy-304
--
-- CANONICAL = the GENERIC fixed-uuid rows (course-family concept, campus-agnostic).
-- Local campus codes (ACCY 304, ACG 4111, …) must NOT live on the course row — they
-- resolve per-campus via campuses.course_family_codes_json / campus_courses.
--
-- This migration (verified against live 2026-07-04: zero rows reference the accy-304 /
-- accy-202 / accy-303 rows or their chapters):
--   1. Adds courses.course_family and stamps the canonical four.
--   2. Normalizes canonical naming (course_name = long title, code = short label).
--   3. Deletes the zero-reference duplicate course rows accy-304, accy-202, accy-303
--      (their empty chapters go with them via FK cascade; explicit deletes kept for
--      clarity). Guarded: each delete re-checks, in SQL, that nothing references the row.
--   4. accy-201 is NOT touched: 4 je_scenarios rows point at its chapters and a
--      campus_courses row points at it — that repoint is a deliberate follow-up.
--
-- Idempotent; safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. course_family concept column ('intro_1' | 'intro_2' | 'intermediate_1' |
--    'intermediate_2' — the same family keys campuses.course_family_codes_json uses)
-- ---------------------------------------------------------------------------
alter table public.courses add column if not exists course_family text;

update public.courses set course_family = 'intro_1'
  where id = '11111111-1111-1111-1111-111111111111' and course_family is distinct from 'intro_1';
update public.courses set course_family = 'intro_2'
  where id = '22222222-2222-2222-2222-222222222222' and course_family is distinct from 'intro_2';
update public.courses set course_family = 'intermediate_1'
  where id = '33333333-3333-3333-3333-333333333333' and course_family is distinct from 'intermediate_1';
update public.courses set course_family = 'intermediate_2'
  where id = '44444444-4444-4444-4444-444444444444' and course_family is distinct from 'intermediate_2';

-- ---------------------------------------------------------------------------
-- 2. Canonical naming: title = long name, code = short label
-- ---------------------------------------------------------------------------
update public.courses set course_name = 'Intro Accounting 1', code = 'INTRO1'
  where id = '11111111-1111-1111-1111-111111111111'
    and (course_name is distinct from 'Intro Accounting 1' or code is distinct from 'INTRO1');
update public.courses set course_name = 'Intro Accounting 2', code = 'INTRO2'
  where id = '22222222-2222-2222-2222-222222222222'
    and (course_name is distinct from 'Intro Accounting 2' or code is distinct from 'INTRO2');
update public.courses set course_name = 'Intermediate Accounting 1', code = 'IA1'
  where id = '33333333-3333-3333-3333-333333333333'
    and (course_name is distinct from 'Intermediate Accounting 1' or code is distinct from 'IA1');
update public.courses set course_name = 'Intermediate Accounting 2', code = 'IA2'
  where id = '44444444-4444-4444-4444-444444444444'
    and (course_name is distinct from 'Intermediate Accounting 2' or code is distinct from 'IA2');

-- ---------------------------------------------------------------------------
-- 3. Delete the zero-reference duplicates (accy-304 = the IA2 dedupe this migration
--    exists for; accy-202 / accy-303 verified equally unreferenced). Every delete is
--    guarded so it is a no-op if anything has since started referencing the row.
--    NOTE: chapters.course_id is ON DELETE CASCADE, but we delete chapters explicitly
--    first so the guard conditions are readable and the intent is unmistakable.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 3b. RLS gap fix: courses is anon-readable (0004) but chapters never was, so the
--     /je chapter browser silently collapsed to "Unassigned" for anonymous students
--     (the browser's chapters query returns zero rows under RLS). Chapter names and
--     numbers are not sensitive; grant anon SELECT to match courses.
-- ---------------------------------------------------------------------------
drop policy if exists "anon read chapters" on public.chapters;
create policy "anon read chapters" on public.chapters for select to anon using (true);

do $$
declare
  dup record;
begin
  for dup in
    select id, slug from public.courses where slug in ('accy-304', 'accy-202', 'accy-303')
  loop
    -- guard: skip if any table still references this course or its chapters
    if exists (select 1 from public.campus_courses  where course_id = dup.id)
      or exists (select 1 from public.course_textbooks where course_id = dup.id)
      or exists (select 1 from public.chapter_topics   where course_id = dup.id)
      or exists (select 1 from public.teaching_assets  where course_id = dup.id)
      or exists (select 1 from public.je_scenarios js
                   join public.chapters ch on ch.id = js.chapter_id
                  where ch.course_id = dup.id)
      or exists (select 1 from public.chapter_topics ct
                   join public.chapters ch on ch.id = ct.chapter_id
                  where ch.course_id = dup.id)
      or exists (select 1 from public.teaching_assets ta
                   join public.chapters ch on ch.id = ta.chapter_id
                  where ch.course_id = dup.id)
      or exists (select 1 from public.chapter_journal_entries je
                   join public.chapters ch on ch.id = je.chapter_id
                  where ch.course_id = dup.id)
    then
      raise notice 'skipping % — still referenced', dup.slug;
      continue;
    end if;

    delete from public.chapters where course_id = dup.id;
    delete from public.courses  where id = dup.id;
    raise notice 'deleted duplicate course % (%)', dup.slug, dup.id;
  end loop;
end $$;
