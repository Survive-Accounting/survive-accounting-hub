-- Rep portal — the self-serve half of the referral platform.
--
-- The referral_* tables (partners, links, clicks, conversions, commissions) already exist. A
-- campus rep is just a referral_partner of type 'campus_rep'. This adds the two fields a rep
-- needs to sign themselves up and come back:
--   * dashboard_token — an unguessable key that grants read/manage access to THAT rep's dashboard
--     without an admin session (reps aren't admins). Emailed on signup; the rep bookmarks it.
--   * venmo — where their commission gets paid. Payouts are manual (Venmo) on the 1st of each
--     month, so this is the one payout detail we collect up front.
--
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.

begin;

alter table public.referral_partners add column if not exists dashboard_token text;
alter table public.referral_partners add column if not exists venmo text;

-- One rep per token. Partial unique so the many existing NULLs (admin-created partners) don't clash.
create unique index if not exists referral_partners_token_uniq
  on public.referral_partners (dashboard_token) where dashboard_token is not null;

commit;

notify pgrst, 'reload schema';

-- Proof: the two columns now exist.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'referral_partners'
  and column_name in ('dashboard_token', 'venmo')
order by column_name;
