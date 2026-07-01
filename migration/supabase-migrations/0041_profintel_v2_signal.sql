-- 0041_profintel_v2_signal.sql
-- ProfIntel V2: per-lead RMP teaching-evidence rollup + targeting score, computed
-- from the dated reviews in rmp_ratings (0040) cross-referenced against a campus's
-- four target course codes (campuses.course_family_codes_json:
-- intro_1 | intro_2 | intermediate_1 | intermediate_2).
--
-- PURELY ADDITIVE. Does NOT touch the live teaching_confidence column, the
-- scheduler, the existing rmp_course_* aggregates, orders, or ProfIntel V1.
-- These are "RMP evidence / estimated" signals (review dates are not official
-- teaching assignments) — never asserted as a guaranteed schedule.
-- Idempotent. After 0040 (rmp_ratings). Reuses rmp_ratings as the review cache
-- (Step 6B's optional profintel_rmp_reviews is intentionally NOT created).

alter table public.campus_lead_suggestions
  add column if not exists rmp_latest_target_course_code   text;
alter table public.campus_lead_suggestions
  add column if not exists rmp_latest_target_rating_date   timestamptz;
alter table public.campus_lead_suggestions
  add column if not exists rmp_target_course_counts_json   jsonb default '{}'::jsonb;  -- { intro_1:n, intro_2:n, intermediate_1:n, intermediate_2:n }
alter table public.campus_lead_suggestions
  add column if not exists rmp_terms_taught_estimate_json  jsonb default '{}'::jsonb;  -- { total:n, terms:["Spring 2026", ...] } — a FLOOR, from review dates
alter table public.campus_lead_suggestions
  add column if not exists rmp_recent_target_match         boolean default false;      -- latest target review within ~12mo
alter table public.campus_lead_suggestions
  add column if not exists rmp_taught_this_time_last_year  boolean default false;      -- a matching review in the same term one year ago
alter table public.campus_lead_suggestions
  add column if not exists rmp_target_confidence           text;                       -- high | medium | low
alter table public.campus_lead_suggestions
  add column if not exists profintel_score                 integer default 0;
alter table public.campus_lead_suggestions
  add column if not exists profintel_reason                text;
alter table public.campus_lead_suggestions
  add column if not exists profintel_v2_status             text default 'candidate';   -- candidate | targeted | drafted | skipped

create index if not exists cls_profintel_score_idx
  on public.campus_lead_suggestions (profintel_score desc)
  where profintel_score > 0;

notify pgrst, 'reload schema';
