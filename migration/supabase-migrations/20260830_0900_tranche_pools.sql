-- Step 6 groundwork: King's partner record + tranche pools for the full-semester pre-build.
--
-- Growth Partner = referral_partners. King's row classifies as king_growth (type not
-- founder/rep, email not internal, created_by not 'lee' — see classifyPartner).

insert into public.referral_partners
  (name, email, type, status, default_commission_rate, default_commission_type, is_test, created_by, dashboard_token)
-- type 'other' (no 'growth_lead' in the check); classifyPartner still routes it to king_growth.
select 'King', 'jking.cim@gmail.com', 'other', 'active', 0.05, 'percent', false, 'king', gen_random_uuid()::text
where not exists (select 1 from public.referral_partners where lower(email) = 'jking.cim@gmail.com');

-- Tranches gain a POOL: king (his 5), unassigned (A–E, owned by nobody, visible to all),
-- founder (Lee's carve-out). partner_id becomes nullable (unassigned/founder have none),
-- and a display label carries "T1"/"A"/"Founder".
alter table public.partner_tranches
  add column if not exists pool  text not null default 'king'
    check (pool in ('king', 'unassigned', 'founder')),
  add column if not exists label text;

alter table public.partner_tranches alter column partner_id drop not null;

-- Replace the old (partner_id, tranche_number) uniqueness with a pool-aware slot key
-- (null partner_id coalesced so two unassigned rows can't collide as "distinct nulls").
alter table public.partner_tranches drop constraint if exists partner_tranches_partner_id_tranche_number_key;
create unique index if not exists partner_tranches_slot_idx on public.partner_tranches
  (pool, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), tranche_number);

comment on column public.partner_tranches.pool is
  'king (a partner''s own 5), unassigned (A–E, held for future partners, owned by nobody), or founder (Lee''s carve-out).';
