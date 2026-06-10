-- 0007: Textbook capture + per-professor landing tokens.
-- Capture which textbook a campus actually uses (per course family),
-- and give every imported professor a unique landing-page token.

alter table public.campuses
  add column if not exists course_family_textbooks_json jsonb;

alter table public.outreach_leads
  add column if not exists landing_token text;

create unique index if not exists outreach_leads_landing_token_key
  on public.outreach_leads(landing_token);

-- Backfill tokens for any leads imported before this migration.
update public.outreach_leads
  set landing_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
  where landing_token is null;
