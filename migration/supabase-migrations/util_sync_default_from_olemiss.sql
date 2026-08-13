-- util_sync_default_from_olemiss.sql — RE-RUNNABLE UTILITY (not a one-time migration).
-- Paste into the Supabase SQL editor (project unvxagsledbsdoremqeb) whenever you want every UNMAPPED
-- campus to inherit Ole Miss's current exam layout. It makes the DEFAULT map (default_exam_units, what
-- unmapped campuses read on the landing) an exact mirror of Ole Miss's ACTIVE campus exam maps.
--
-- Ole Miss keeps its own campus map — this never touches campus_exam_topics. It only rebuilds the
-- default. Run it AFTER you've mapped your new topics onto Ole Miss's exams in the Campuses folder.
-- Safe: wrapped in a transaction — if anything fails, the default map is left unchanged.
--
-- Requires 0106 (default_exam_units) applied. Idempotent: full replace, run as often as you like.

begin;

-- 1) Clear the default map.
delete from public.default_exam_units;

-- 2) Rebuild it from Ole Miss's active exams. exam_number is parsed from the exam name ("Exam 2"→2;
--    Final/Review→99; anything non-numeric→999 and won't surface on the 1/2/3/Final tabs). A topic on
--    more than one Ole Miss exam takes its EARLIEST exam. sort_order = the topic's position in the exam.
insert into public.default_exam_units (unit_id, exam_number, sort_order, is_foundations)
select distinct on (t.chapter_id)
       t.chapter_id,
       coalesce(nullif(regexp_replace(e.name, '\D', '', 'g'), '')::int,
                case when e.name ~* 'final|review' then 99 else 999 end) as exam_number,
       t.position,
       false
from public.campus_exams e
join public.campus_exam_topics t on t.campus_exam_id = e.id
where e.campus_id = '7b92a320-b196-43f2-a241-77a0805816fe'   -- Ole Miss (University of Mississippi)
  and e.status = 'active'
order by t.chapter_id,
         coalesce(nullif(regexp_replace(e.name, '\D', '', 'g'), '')::int, case when e.name ~* 'final|review' then 99 else 999 end),
         t.position nulls last;

commit;

-- 3) (optional) Verify — how many topics landed on each default exam.
select exam_number, count(*) as topics
from public.default_exam_units
group by exam_number
order by exam_number;
