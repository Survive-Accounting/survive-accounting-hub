-- 0035_rmp_course_codes.sql
-- RMP course-code signal: capture the per-rating "Class" labels shown on a
-- professor's RateMyProfessors page (e.g. "ACCT201", "ACCY 202"), and the result
-- of cross-referencing them against the campus's researched Intro/Intermediate
-- course codes (campuses.course_family_codes_json). A match is the strongest
-- "this professor actually teaches our target course" signal short of a course
-- schedule, so it drives teaching_confidence + campaign priority.
--
-- ANTI-HALLUCINATION: rmp_course_codes holds ONLY labels actually present on the
-- RMP page. Empty when a professor's ratings carry no class label. Never inferred.
-- Idempotent. Numbered 0035 (0034 is the greek schema, applied live on its branch).

-- Lead suggestions (triage rows — where RMP per-prof data already lives).
alter table public.campus_lead_suggestions
  add column if not exists rmp_course_codes      text[],        -- raw class labels from RMP ratings (deduped)
  add column if not exists rmp_course_match_json jsonb,         -- { intro_1:{code,count}, intro_2:..., intermediate_1:..., intermediate_2:... }
  add column if not exists rmp_course_match_count integer default 0; -- total RMP ratings referencing a matching target code

-- Promoted leads (campaign-ready) — mirror the columns so the signal survives import.
alter table public.outreach_leads
  add column if not exists rmp_course_codes      text[],
  add column if not exists rmp_course_match_json jsonb,
  add column if not exists rmp_course_match_count integer default 0;

create index if not exists campus_lead_suggestions_rmp_match_idx
  on public.campus_lead_suggestions (rmp_course_match_count)
  where rmp_course_match_count > 0;

notify pgrst, 'reload schema';
