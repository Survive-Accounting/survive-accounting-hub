-- 0012: Email automation — import-triggered scheduling, follow-ups, broadcasts.

-- Initial emails are scheduled at import time (+2 business days).
alter table public.outreach_leads add column if not exists scheduled_send_at timestamptz;
create index if not exists outreach_leads_scheduled_idx on public.outreach_leads(scheduled_send_at) where scheduled_send_at is not null;

-- Custom / seasonal batch emails ("broadcasts").
create table if not exists public.outreach_broadcasts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  campus_ids uuid[],                 -- null = all campuses
  include_replied boolean not null default true,
  send_at timestamptz not null,
  status text not null default 'scheduled',  -- scheduled | sending | sent | canceled | failed
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);
alter table public.outreach_broadcasts enable row level security;
create policy "anon all outreach_broadcasts" on public.outreach_broadcasts for all to anon using (true) with check (true);
create policy "auth all outreach_broadcasts" on public.outreach_broadcasts for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.outreach_broadcasts to anon, authenticated;

-- The scheduler: initial sends due, relative follow-ups, due broadcasts.
select cron.schedule(
  'outreach-scheduler-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/outreach-scheduler',
    headers := '{"Content-Type":"application/json","x-cron-secret":"sa-cron-7kQ2vXp9mN4t"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);