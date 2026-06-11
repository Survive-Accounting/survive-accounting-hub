-- 0017: Add lead_type to templates and broadcasts for the lead-type-card UI.
-- Existing rows get 'professors' (the only live lead type so far).

alter table public.outreach_email_templates
  add column if not exists lead_type text not null default 'professors';

alter table public.outreach_broadcasts
  add column if not exists lead_type text not null default 'professors';

-- Backfill (safe to re-run)
update public.outreach_email_templates set lead_type = 'professors' where lead_type is null or lead_type = '';
update public.outreach_broadcasts       set lead_type = 'professors' where lead_type is null or lead_type = '';
