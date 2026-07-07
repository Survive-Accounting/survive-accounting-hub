-- Demand-testing launch fields on /order:
--  * interests text[]         — multi-select interest question (no pricing). Values:
--                               one_on_one, group, videos_tools, something_else.
--                               Supersedes requested_options (kept for old rows,
--                               no longer written); `tier` still gets a derived
--                               primary value so the notify-order fn + admin work.
--  * is_accounting_major text — optional pill on the course step (Yes/No/Definitely
--                               not/Not sure yet).
--  * referral_source text     — optional "how did you find me?" on confirm.
--  * referral_source_detail   — free text for the "Other" referral option.
-- All nullable, additive. Applied live via the Management API 2026-07-03.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS interests text[],
  ADD COLUMN IF NOT EXISTS is_accounting_major text,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referral_source_detail text;
