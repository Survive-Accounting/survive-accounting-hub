-- 0008: Landing-page view/click tracking + send-log default.

create table if not exists public.landing_page_events (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete cascade,
  lead_id uuid references public.outreach_leads(id) on delete set null,
  token text,
  kind text not null check (kind in ('view','click')),
  created_at timestamptz not null default now()
);
create index if not exists landing_page_events_campus_idx on public.landing_page_events(campus_id, kind);
create index if not exists landing_page_events_lead_idx on public.landing_page_events(lead_id, kind);

alter table public.landing_page_events enable row level security;
-- Visitors are anonymous — they must be able to record views/clicks.
create policy "anon insert landing_page_events" on public.landing_page_events for insert to anon with check (true);
create policy "anon read landing_page_events" on public.landing_page_events for select to anon using (true);
create policy "auth all landing_page_events" on public.landing_page_events for all to authenticated using (true) with check (true);

-- The send log timestamp should default to now (lost in the relaxed schema).
alter table public.outreach_send_log alter column sent_at set default now();