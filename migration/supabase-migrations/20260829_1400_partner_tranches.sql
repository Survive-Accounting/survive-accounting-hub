-- Growth Partners own campuses in TRANCHES of 20 that unlock on results.
--
-- Each partner gets 5 tranches. Tranche 1 is active on day one; 2-5 are locked and
-- show only a count + tier label (never the campus names — a visible number motivates,
-- a visible list invites negotiation). A locked tranche's campus_ids can be reshuffled
-- by Lee any time; once unlocked they are fixed.
--
-- Unlock is continuous and requires BOTH: 15/20 active campuses have launch-checklist
-- items 1-5 done, AND 5 campuses have a logged council/chapter reply OR a recruited rep
-- with a tracked link. Speed alone never unlocks — that's the whole point.

create table if not exists public.partner_tranches (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.referral_partners(id) on delete cascade,
  tranche_number int  not null check (tranche_number between 1 and 5),
  status         text not null default 'locked'
                   check (status in ('locked', 'active', 'complete')),
  tier_label     text,                       -- e.g. "Tier 2 — Big State Schools"; shown while locked
  campus_ids     uuid[] not null default '{}',
  unlocked_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (partner_id, tranche_number)
);

comment on table public.partner_tranches is
  'Growth V2: a partner''s 5 tranches of ~20 campuses. Tranche 1 active on day one; the rest unlock on results (see growth-tranche-core.ts). Locked tranches expose only a count + tier_label.';
comment on column public.partner_tranches.campus_ids is
  'The campuses in this tranche. Reshuffleable by Lee WHILE LOCKED; fixed once status=active. On unlock these append to the partner''s working launch list.';

create index if not exists partner_tranches_partner_idx
  on public.partner_tranches (partner_id, tranche_number);

-- Deny-by-default: the dashboard reads through the service role only (no partner-facing
-- RLS surface yet); lock the table so nothing anonymous can touch it.
alter table public.partner_tranches enable row level security;
