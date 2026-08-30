-- ONE SOURCE OF TRUTH for "our campuses". Replaces the tangle where the growth ranker,
-- the student picker, and the assigner each decided which campuses exist differently
-- (which is how 677 ranked campuses came to include 446 archived ones).
--
-- campus_status — exactly one value per campus, the only thing any consumer checks:
--   shell     no course code and no contacts (admin-only, never assignable)
--   backlog   some data, not workable yet   (admin-only, never assignable)
--   ready     course code + a council or chapter contact (assignable, not in picker)
--   live      outreach started, or has students (assignable, shown in the picker)
--   excluded  deliberately out of scope (admin-only) — dupes, retired imports, etc.
--
-- Derived where it can be (growth_refresh_campus_status), manually overridable where it
-- can't (campus_status_override wins). archived_at is RETIRED as a universe signal.
--
-- greek_status — a SEPARATE axis. "No Greek contacts on file" (an enrichment gap) is not
-- "no Greek system" (a real property). strong/present/none/unknown, default unknown.

alter table public.campuses
  add column if not exists campus_status          text,
  add column if not exists campus_status_override text
    check (campus_status_override is null or campus_status_override in ('shell','backlog','ready','live','excluded')),
  add column if not exists greek_status           text not null default 'unknown'
    check (greek_status in ('strong','present','none','unknown')),
  add column if not exists greek_status_override  text
    check (greek_status_override is null or greek_status_override in ('strong','present','none','unknown')),
  add column if not exists dedup_review           boolean not null default false,
  add column if not exists status_derived_at      timestamptz;

comment on column public.campuses.campus_status is
  'THE canonical status. coalesce(campus_status_override, derived). Every consumer filters on this and nothing else (not archived_at). Refresh with growth_refresh_campus_status().';
comment on column public.campuses.greek_status is
  'Greek-system presence (separate from contact coverage): strong/present/none/unknown. coalesce(greek_status_override, this).';
comment on column public.campuses.dedup_review is
  'true = flagged as a possible duplicate of another campus; awaiting human dedup decision.';

create index if not exists campuses_campus_status_idx on public.campuses (campus_status);

-- Derivation: recompute campus_status for every campus from live signals. Idempotent;
-- respects the manual override. NEVER reads archived_at.
create or replace function public.growth_refresh_campus_status() returns void
language plpgsql as $$
begin
  with sig as (
    select c.id,
      (coalesce(cis.course_code, c.course_family_codes_json->>'intro_1') is not null) as has_course,
      exists(select 1 from growth_outreach_eligibility e
               where e.campus_id = c.id and (e.council_type is not null or e.chapter_id is not null)) as has_greek_contact,
      exists(select 1 from growth_outreach_eligibility e where e.campus_id = c.id) as has_any_contact,
      exists(select 1 from growth_outreach_events ev
               where ev.campus_id = c.id and ev.direction = 'outbound') as has_outreach,
      exists(select 1 from student_entitlements se
               where se.campus_id = c.id and coalesce(se.is_test,false) = false) as has_students
    from campuses c
    left join course_intel_campus_status cis on cis.campus_id = c.id
  )
  update campuses c set
    campus_status = coalesce(
      c.campus_status_override,
      case
        when s.has_outreach or s.has_students        then 'live'
        when s.has_course and s.has_greek_contact     then 'ready'
        when s.has_course or s.has_any_contact         then 'backlog'
        else 'shell'
      end),
    status_derived_at = now()
  from sig s
  where s.id = c.id;
end $$;

-- Seed greek_status: a campus with a council contact OR any social chapter on file has a
-- Greek system → at least 'present'. The rest stay 'unknown' for the one-time manual pass.
update public.campuses c set greek_status = 'present'
where coalesce(c.greek_status_override, c.greek_status) = 'unknown'
  and (
    exists(select 1 from growth_outreach_eligibility e where e.campus_id = c.id and e.council_type is not null)
    or exists(select 1 from campus_greek_chapters g where g.campus_id = c.id and g.archived_at is null)
  );

-- Populate campus_status now.
select public.growth_refresh_campus_status();
