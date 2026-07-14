-- 0089_course_structure_cleanup.sql
-- COURSE STRUCTURE CLEANUP (canvas-v2, Prompt 5). Supersedes the earlier
-- 0089_fix_course_family_seeds.sql draft I gave Lee before this run started —
-- that file is DELETED; do not run any 0089 SQL except this one.
--
-- Fixes the 0087 seed bug (course_family guesses 'intro1'/'intro2'/'ia1'/'ia2'
-- vs the real spine 'intro_1'/'intro_2'/'intermediate_1'/'intermediate_2'),
-- which created two DUPLICATE intro courses and left canvas_folders pointing
-- at them / missing IA1/IA2 folders entirely. NOTHING IS HARD-DELETED — the
-- duplicate courses are archived (status column, new), not dropped.
--
-- Then: adds courses.status + chapters.status/subtitle, renames the 5
-- canonical courses to clean display names, and reseeds Foundations to its
-- final 8-chapter shape (mapping old chapters onto new where they correspond,
-- archiving the one that doesn't). Idempotent; safe to re-run.

-- ============================================================================
-- PART 1 — courses: status column + dupe archive + clean renames
-- ============================================================================
alter table public.courses
  add column if not exists status text not null default 'active';
alter table public.courses drop constraint if exists courses_status_check;
alter table public.courses
  add constraint courses_status_check check (status in ('active', 'archived'));

-- Repoint canvas_folders off the duplicate intro courses onto the real ones
-- (0088 seeded "Intro 1"/"Intro 2" folders against the dupes because their
-- course_family happened to match the guessed 'intro1'/'intro2' values).
update public.canvas_folders f
set course_id = real_c.id
from public.courses dupe_c
join public.courses real_c
  on (dupe_c.course_family = 'intro1' and real_c.course_family = 'intro_1')
  or (dupe_c.course_family = 'intro2' and real_c.course_family = 'intro_2')
where f.course_id = dupe_c.id;

-- Defensive repoint of any other references (probed live 2026-07-14: zero
-- rows on both, but re-runs elsewhere should stay safe).
update public.course_coa cc
set course_id = real_c.id
from public.courses dupe_c
join public.courses real_c
  on (dupe_c.course_family = 'intro1' and real_c.course_family = 'intro_1')
  or (dupe_c.course_family = 'intro2' and real_c.course_family = 'intro_2')
where cc.course_id = dupe_c.id
  and not exists (select 1 from public.course_coa x where x.course_id = real_c.id and x.account_id = cc.account_id);
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

-- Archive the duplicates (kept, never deleted — status filters them out of
-- every picker and out of the folder-seed join below).
update public.courses
set status = 'archived'
where course_family in ('intro1', 'intro2');

-- Seed the missing IA1/IA2 folders against the REAL intermediate families
-- (the old seed target 'ia1'/'ia2' never matched anything, so these never
-- got created).
insert into public.canvas_folders (name, course_id, sort)
select v.name, co.id, v.sort
from (values
  ('IA1', 'intermediate_1', 40),
  ('IA2', 'intermediate_2', 50)
) as v(name, family, sort)
join public.courses co on co.course_family = v.family and co.status = 'active'
where not exists (select 1 from public.canvas_folders f where f.course_id = co.id);

-- Clean display names — course_name is now the canonical label (canvas UI
-- reads course_name ?? code, flipped from the old code-first precedence, so
-- these become what students/Lee see everywhere, including canvas_folders
-- which independently already carry these same names).
update public.courses set course_name = 'Foundations', code = 'Foundations' where course_family = 'foundations';
update public.courses set course_name = 'Intro 1', code = 'Intro 1' where course_family = 'intro_1';
update public.courses set course_name = 'Intro 2', code = 'Intro 2' where course_family = 'intro_2';
update public.courses set course_name = 'IA1', code = 'IA1' where course_family = 'intermediate_1';
update public.courses set course_name = 'IA2', code = 'IA2' where course_family = 'intermediate_2';

-- ============================================================================
-- PART 2 — chapters: status + subtitle columns (editable-chapters admin)
-- ============================================================================
alter table public.chapters
  add column if not exists status text not null default 'active';
alter table public.chapters drop constraint if exists chapters_status_check;
alter table public.chapters
  add constraint chapters_status_check check (status in ('active', 'archived'));
alter table public.chapters
  add column if not exists subtitle text null;

-- ============================================================================
-- PART 3 — Foundations reseed to the final 8-chapter shape
-- ----------------------------------------------------------------------------
-- Mapping (old -> new), reported to Lee alongside this file:
--   1  "What Accounting Is & A = L + E"     -> 1  "What is Accounting & A = L + E"   (renamed in place)
--   [none]                                   -> 2  "The Accounting Cycle"            (NEW)
--   2  "Accounts & Debits and Credits"       -> 3  "Accounts & Debits and Credits"   (renumbered)
--   3  "Journal Entries"                     -> 4  "Journal Entries"                 (renumbered)
--   5  "Adjusting Entries"                   -> 5  "Trial Balances & Adjusting Entries" (renamed in place)
--   6  "Financial Statements"                -> 6  "Financial Statements"            (unchanged)
--   7  "The Accounting Cycle & Closing"      -> 7  "Closing Entries"                 (renamed in place)
--   [none]                                   -> 8  "Course Wrap-up" (subtitle: Cram Decks) (NEW)
--   4  "Receivables & Payables"              -> ARCHIVED, not deleted (no counterpart in
--                                                the new 8; chapter_number bumped to 100
--                                                so it never collides with the live 1-8 —
--                                                any scenario/scene still pointing at it
--                                                keeps working, shown "(archived)" in filters)
-- Collision-safe order: archive+offset the dropped chapter FIRST (frees #4),
-- then renumber 3->4, then 2->3 — no two active rows in this course ever
-- share a chapter_number, even transiently.
-- ============================================================================

-- Step 1: archive "Receivables & Payables", move off the active numbering range
update public.chapters
set status = 'archived', chapter_number = 100
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'Receivables & Payables';

-- Step 2: renumber "Journal Entries" 3 -> 4 (now free)
update public.chapters
set chapter_number = 4
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'Journal Entries' and status = 'active';

-- Step 3: renumber "Accounts & Debits and Credits" 2 -> 3 (now free)
update public.chapters
set chapter_number = 3
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'Accounts & Debits and Credits' and status = 'active';

-- Step 4: rename-in-place (no number changes)
update public.chapters
set chapter_name = 'What is Accounting & A = L + E'
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'What Accounting Is & A = L + E';

update public.chapters
set chapter_name = 'Trial Balances & Adjusting Entries'
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'Adjusting Entries' and chapter_number = 5;

update public.chapters
set chapter_name = 'Closing Entries'
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'The Accounting Cycle & Closing';

-- Step 5: insert the two new chapters (idempotent by name+course)
insert into public.chapters (course_id, chapter_number, chapter_name, subtitle, status, je_only_mode, target_lessons, topics_locked)
select (select id from public.courses where course_family = 'foundations'), 2, 'The Accounting Cycle', null, 'active', false, 0, false
where not exists (
  select 1 from public.chapters
  where course_id = (select id from public.courses where course_family = 'foundations') and chapter_name = 'The Accounting Cycle'
);

insert into public.chapters (course_id, chapter_number, chapter_name, subtitle, status, je_only_mode, target_lessons, topics_locked)
select (select id from public.courses where course_family = 'foundations'), 8, 'Course Wrap-up', 'Cram Decks', 'active', false, 0, false
where not exists (
  select 1 from public.chapters
  where course_id = (select id from public.courses where course_family = 'foundations') and chapter_name = 'Course Wrap-up'
);
