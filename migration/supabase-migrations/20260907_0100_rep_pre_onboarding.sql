-- REP PRE-ONBOARDING (Lee's spec, 2026-09-06): apply → pre-onboarding while pending →
-- ready for review → approve/deny → dashboard.
--
-- One concern: two additive columns on referral_partners.
--   rep_profile  — the pre-onboarding answers and progress (steps, comfort selections, targets,
--                  resume, reminder stamps, review stamps). jsonb so the flow can grow without
--                  another migration. Shape documented in src/lib/rep-pre-onboarding.ts.
--   rep_number   — "you're rep #N", assigned at approval. Unique where set; test reps are
--                  numbered separately in code so the real count never includes them.
--
-- Additive, idempotent, no data rewritten. The code gates loudly until this is applied:
-- applyAsRep and the onboarding functions return "MISSING MIGRATION 20260907_0100…".
BEGIN;

alter table public.referral_partners
  add column if not exists rep_profile jsonb not null default '{}'::jsonb;

alter table public.referral_partners
  add column if not exists rep_number integer;

create unique index if not exists referral_partners_rep_number_key
  on public.referral_partners (rep_number) where rep_number is not null;

comment on column public.referral_partners.rep_profile is
  'Rep application + pre-onboarding answers/progress (src/lib/rep-pre-onboarding.ts RepProfile).';
comment on column public.referral_partners.rep_number is
  'Sequential rep number assigned at approval ("you''re rep #N"). Test reps numbered separately by code.';

COMMIT;

-- Proof it applied: both columns present.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'referral_partners'
  and column_name in ('rep_profile', 'rep_number')
order by column_name;
