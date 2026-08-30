-- LAUNCH CAMPAIGNS — a partner schedules a campus's outreach; it sends at 9am the next
-- business day. Auto-approve by default with a review window; Lee monitors, never gates.
--
-- The actual email messages live in growth_outreach_events (the existing queue), tagged
-- by campaign_tag. This row is the scheduled wrapper: when, what template, how many by
-- channel, and the pending→sent lifecycle a cron drives.

create table if not exists public.launch_campaigns (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid references public.referral_partners(id) on delete set null,
  campus_id        uuid not null references public.campuses(id) on delete cascade,
  campaign_tag     text not null unique,          -- == growth_outreach_events.campaign_id
  template_key     text not null,
  template_version text,                          -- so a reply-rate change can trace to copy
  status           text not null default 'pending'
                     check (status in ('pending', 'sent', 'canceled', 'held')),
  scheduled_send_at timestamptz not null,
  email_count      int not null default 0,
  dm_count         int not null default 0,        -- IG-only recipients (manual DM to-do)
  auto_approved    boolean not null default true,
  created_by       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  canceled_at      timestamptz,
  meta             jsonb not null default '{}'
);

comment on table public.launch_campaigns is
  'Growth V2: a scheduled outreach campaign for one campus. Emails live in growth_outreach_events (campaign_tag); this drives the pending->sent window. Sends 9am next business day, cancelable/editable until then.';

create index if not exists launch_campaigns_due_idx
  on public.launch_campaigns (status, scheduled_send_at);
create index if not exists launch_campaigns_campus_idx
  on public.launch_campaigns (campus_id, created_at desc);

alter table public.launch_campaigns enable row level security;

-- Per-partner auto-approve toggle (default on). Off = blocking review for that partner only.
alter table public.referral_partners
  add column if not exists auto_approve_outbound boolean not null default true;

-- Global kill switch lives in site_settings under key 'growthOutboundPaused' (boolean),
-- read by the send cron. No schema needed — site_settings is a k/v table.
