-- 0023_lead_teaching_priors.sql
-- Phase 1 / Parts 1 + 4: lead-level Hasselback priors + teaching-confidence
-- tier on campus_lead_suggestions (where the scraped, confirmed-email leads
-- live and where triage/targeting happens). These are PRIORS that augment —
-- they never override a confirmed scraped fact, and the Hasselback email is
-- never treated as sendable. teaches_intro_1/2 + teaches_intermediate_1/2
-- already exist on this table; we add the linkage + confidence fields.
--
-- teaching_confidence trust order (Part 4):
--   high   = a course-schedule section (campus_course_sections) shows this
--            person teaching an Intro/Intermediate family course.
--   medium = a Hasselback area-code prior (P/F/M) OR an AI/RMP teaching signal.
--   low    = weak/title-only or no signal.
-- Used as a RANKING, not a hard filter, so partial coverage never starves the list.

alter table public.campus_lead_suggestions
  add column if not exists hasselback_match    boolean,
  add column if not exists hasselback_tenured  boolean,
  add column if not exists hasselback_areas     text,
  add column if not exists teaching_confidence  text
    check (teaching_confidence in ('high','medium','low')),
  add column if not exists teaching_signals     jsonb;

create index if not exists idx_cls_teaching_conf
  on public.campus_lead_suggestions (teaching_confidence)
  where archived_at is null;
create index if not exists idx_cls_hasselback_match
  on public.campus_lead_suggestions (hasselback_match)
  where hasselback_match is true;
