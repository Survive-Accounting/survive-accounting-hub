-- 0031_onboarding_waitlist_fields.sql
-- The plan-first onboarding flow (/o/{short_ref}) is waitlist-based for now:
-- picking a plan captures the lead into the EXISTING campus_waitlist list with
-- the chosen plan in `tier_interest` (test_pass | membership | prepay) and
-- `source` = 'onboarding_<plan>'. Those columns already exist; the only net-new
-- field is `accounting_major` (yes | no | undecided), an optional self-report
-- collected on the confirmation step. Name/phone/campus_text/course_text are
-- already present and reused as-is.
-- Idempotent — safe to re-run. Next number after the high-water mark (0030).

alter table public.campus_waitlist
  add column if not exists accounting_major text;

-- PostgREST: pick up the new column without a restart.
notify pgrst, 'reload schema';
