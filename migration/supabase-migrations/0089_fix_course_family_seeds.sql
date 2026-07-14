-- 0089_fix_course_family_seeds.sql
-- FIX for 0087/0088 seed joins: those migrations guessed course_family values
-- 'intro1'/'intro2'/'ia1'/'ia2', but the real spine uses 'intro_1'/'intro_2'/
-- 'intermediate_1'/'intermediate_2'. Consequences observed on live (2026-07-14
-- after Lee ran both):
--   - 0087 seeded DUPLICATE intro courses (family 'intro1'/'intro2') alongside
--     the real 'intro_1'/'intro_2' rows;
--   - 0088's "Intro 1"/"Intro 2" folders point at those dupes (moving a scene
--     there would set a course context that owns no chapters/scenarios);
--   - the IA1/IA2 folders never seeded (nothing matches 'ia1'/'ia2').
-- This migration repoints the folders to the real courses, removes the dupes
-- (verified unreferenced by chapters/course_coa; folders are repointed first),
-- and seeds the missing IA folders. Idempotent; safe to re-run.

-- 1) Repoint the Intro folders from the dupe courses to the real ones
update public.canvas_folders f
set course_id = real_c.id
from public.courses dupe_c
join public.courses real_c
  on (dupe_c.course_family = 'intro1' and real_c.course_family = 'intro_1')
  or (dupe_c.course_family = 'intro2' and real_c.course_family = 'intro_2')
where f.course_id = dupe_c.id;

-- 2) Repoint any other strays (course_coa, je chapters) — belt and braces;
--    live probe showed zero rows, but re-runs elsewhere should stay safe.
update public.course_coa cc
set course_id = real_c.id
from public.courses dupe_c
join public.courses real_c
  on (dupe_c.course_family = 'intro1' and real_c.course_family = 'intro_1')
  or (dupe_c.course_family = 'intro2' and real_c.course_family = 'intro_2')
where cc.course_id = dupe_c.id
  and not exists (
    select 1 from public.course_coa x
    where x.course_id = real_c.id and x.account_id = cc.account_id
  );
delete from public.course_coa cc
using public.courses dupe_c
where cc.course_id = dupe_c.id and dupe_c.course_family in ('intro1', 'intro2');

update public.chapters ch
set course_id = real_c.id
from public.courses dupe_c
join public.courses real_c
  on (dupe_c.course_family = 'intro1' and real_c.course_family = 'intro_1')
  or (dupe_c.course_family = 'intro2' and real_c.course_family = 'intro_2')
where ch.course_id = dupe_c.id;

-- 3) Drop the duplicate course rows (now unreferenced)
delete from public.courses where course_family in ('intro1', 'intro2');

-- 4) Seed the missing IA folders against the REAL families
insert into public.canvas_folders (name, course_id, sort)
select v.name, co.id, v.sort
from (values
  ('IA1', 'intermediate_1', 40),
  ('IA2', 'intermediate_2', 50)
) as v(name, family, sort)
join public.courses co on co.course_family = v.family
where not exists (
  select 1 from public.canvas_folders f where f.course_id = co.id
);
