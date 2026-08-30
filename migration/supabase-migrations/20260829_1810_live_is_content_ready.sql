-- Correction (Lee): 'live' is a STUDENT-FACING signal, so the right condition is "can a
-- student actually use this campus?" — course code + real Exam-1 content — not "outreach
-- started". A student who picks a school and finds an empty course is worse than not
-- seeing it. This makes the picker curated by construction, and still manually promotable
-- (campus_status_override='live').
--
-- content-ready := the campus has its OWN active Exam-1 map with coverage (campus_exams,
-- status active, coverage_pct > 0). The global starter map alone doesn't make a specific
-- campus 'live' — a real, mapped course does.

create or replace function public.growth_refresh_campus_status() returns void
language plpgsql as $$
begin
  with sig as (
    select c.id,
      (coalesce(cis.course_code, c.course_family_codes_json->>'intro_1') is not null) as has_course,
      exists(select 1 from growth_outreach_eligibility e
               where e.campus_id = c.id and (e.council_type is not null or e.chapter_id is not null)) as has_greek_contact,
      exists(select 1 from growth_outreach_eligibility e where e.campus_id = c.id) as has_any_contact,
      exists(select 1 from campus_exams x
               where x.campus_id = c.id and x.status = 'active' and coalesce(x.coverage_pct,0) > 0) as content_ready,
      exists(select 1 from student_entitlements se
               where se.campus_id = c.id and coalesce(se.is_test,false) = false) as has_students
    from campuses c
    left join course_intel_campus_status cis on cis.campus_id = c.id
  )
  update campuses c set
    campus_status = coalesce(
      c.campus_status_override,
      case
        when (s.has_course and s.content_ready) or s.has_students then 'live'
        when s.has_course and s.has_greek_contact                  then 'ready'
        when s.has_course or s.has_any_contact                      then 'backlog'
        else 'shell'
      end),
    status_derived_at = now()
  from sig s
  where s.id = c.id;
end $$;

select public.growth_refresh_campus_status();
