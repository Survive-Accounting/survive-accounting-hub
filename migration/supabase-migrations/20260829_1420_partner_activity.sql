-- One chronological activity stream across all Growth Partners — the skim surface Lee
-- reads for 30 seconds a day (campaigns launched, tranches unlocked, replies logged,
-- reps recruited, checklist items completed). Also the record that backs unlock
-- notifications. Filterable by partner.

create table if not exists public.partner_activity (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid references public.referral_partners(id) on delete cascade,
  campus_id   uuid references public.campuses(id) on delete set null,
  kind        text not null
                check (kind in (
                  'campaign_launched', 'campaign_sent', 'campaign_canceled',
                  'tranche_unlocked', 'reply_logged', 'rep_recruited',
                  'checklist_item', 'paused_all', 'resumed_all'
                )),
  summary     text not null,               -- natural-language, human-readable
  meta        jsonb not null default '{}', -- structured payload (counts, template, link, etc.)
  created_at  timestamptz not null default now()
);

comment on table public.partner_activity is
  'Growth V2: chronological partner activity feed + unlock/campaign notification record. Read by Lee, filterable by partner. Natural-language summary + structured meta.';

create index if not exists partner_activity_created_idx
  on public.partner_activity (created_at desc);
create index if not exists partner_activity_partner_idx
  on public.partner_activity (partner_id, created_at desc);

alter table public.partner_activity enable row level security;
