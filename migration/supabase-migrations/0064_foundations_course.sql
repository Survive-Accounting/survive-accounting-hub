-- 0064_foundations_course.sql
-- Seed the Foundations course family: a campus-agnostic course (no local campus codes)
-- plus chapters 1–7. Mirrors the canonical fixed-uuid course families (course_family key).
-- Idempotent; safe to re-run. Depends on 0063 (courses.course_family column).

-- ---------------------------------------------------------------------------
-- 1. Course (campus-agnostic; code left null — codes resolve per-campus elsewhere)
-- ---------------------------------------------------------------------------
insert into public.courses (course_name, slug, course_family)
select 'Accounting Foundations', 'accounting-foundations', 'foundations'
where not exists (select 1 from public.courses where slug = 'accounting-foundations');

-- ---------------------------------------------------------------------------
-- 2. Chapters 1–7 (idempotent by course + number)
-- ---------------------------------------------------------------------------
insert into public.chapters (course_id, chapter_number, chapter_name)
select co.id, v.num, v.name
from public.courses co
cross join (values
  (1::numeric, 'What Accounting Is & A = L + E'),
  (2::numeric, 'Accounts & Debits and Credits'),
  (3::numeric, 'Journal Entries'),
  (4::numeric, 'Receivables & Payables'),
  (5::numeric, 'Adjusting Entries'),
  (6::numeric, 'Financial Statements'),
  (7::numeric, 'The Accounting Cycle & Closing')
) as v(num, name)
where co.slug = 'accounting-foundations'
  and not exists (
    select 1 from public.chapters c where c.course_id = co.id and c.chapter_number = v.num
  );
