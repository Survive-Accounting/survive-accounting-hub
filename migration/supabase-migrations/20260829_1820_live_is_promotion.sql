-- Correction (Lee): 'live' = "course code + you promote it". Derived status tops out at
-- 'ready'; a campus only becomes 'live' when promoted (campus_status_override='live'),
-- which confirms the content genuinely works for that school. The student picker then
-- shows exactly the curated launch set — never an auto-derived list.

create or replace function public.growth_refresh_campus_status() returns void
language plpgsql as $$
begin
  with sig as (
    select c.id,
      (coalesce(cis.course_code, c.course_family_codes_json->>'intro_1') is not null) as has_course,
      exists(select 1 from growth_outreach_eligibility e
               where e.campus_id = c.id and (e.council_type is not null or e.chapter_id is not null)) as has_greek_contact,
      exists(select 1 from growth_outreach_eligibility e where e.campus_id = c.id) as has_any_contact
    from campuses c
    left join course_intel_campus_status cis on cis.campus_id = c.id
  )
  update campuses c set
    campus_status = coalesce(
      c.campus_status_override,     -- 'live' (or any manual status) wins here
      case
        when s.has_course and s.has_greek_contact then 'ready'
        when s.has_course or s.has_any_contact     then 'backlog'
        else 'shell'
      end),
    status_derived_at = now()
  from sig s
  where s.id = c.id;
end $$;

select public.growth_refresh_campus_status();
