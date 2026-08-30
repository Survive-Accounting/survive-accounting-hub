-- Outreach schedule: the action record (what actually went out) + Instagram pre-warm state.
-- The schedule PLAN is derived on read from tranche campuses + contacts + this table (for
-- follow-up eligibility, one-per-org-per-week, and suppression). Only actions are persisted.

create table if not exists public.outreach_touch (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null,
  contact_qc_id uuid references public.growth_contact_qc(id) on delete set null,
  -- org identity for one-per-org-per-week + reply suppression: e.g. 'chapter:<uuid>', 'council:ifc', 'club:<uuid>'
  org_key text not null,
  -- how it went out. dm and story_reply are both Instagram; tracked apart so reply-rate compares.
  source_channel text not null check (source_channel in ('dm', 'story_reply', 'email')),
  sender text not null default 'king',
  kind text not null default 'new' check (kind in ('new', 'follow_up')),
  scheduled_date date not null,
  sent_at timestamptz not null default now(),
  replied_at timestamptz,
  outcome text check (outcome in ('interested', 'referred', 'not_now', 'wrong_person', 'no', 'hostile')),
  reply_text text,
  message_variant text,           -- which template variant went out (for later analysis)
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_outreach_touch_campus on public.outreach_touch(campus_id);
create index if not exists idx_outreach_touch_contact on public.outreach_touch(contact_qc_id);
create index if not exists idx_outreach_touch_orgkey on public.outreach_touch(campus_id, org_key);
create index if not exists idx_outreach_touch_date on public.outreach_touch(scheduled_date);

comment on table public.outreach_touch is
  'One row per message actually sent (DM / story reply / email). The schedule plan is derived; this is the log the plan reads back for follow-ups, one-per-org-per-week, and suppression.';

-- Instagram pre-warm: following + liking a target the week before, tracked as separate signals.
alter table public.growth_contact_qc
  add column if not exists prewarmed_at timestamptz,
  add column if not exists ig_followed boolean not null default false,
  add column if not exists ig_liked boolean not null default false;
