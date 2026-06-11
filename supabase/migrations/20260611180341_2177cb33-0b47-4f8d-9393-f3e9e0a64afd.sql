-- 0014: Admin-toggleable outreach settings (auto-schedule on import).
create table if not exists public.outreach_settings (
  id integer primary key default 1,
  auto_schedule_on_import boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint outreach_settings_singleton check (id = 1)
);
insert into public.outreach_settings (id) values (1) on conflict (id) do nothing;
alter table public.outreach_settings enable row level security;
create policy "anon all outreach_settings" on public.outreach_settings for all to anon using (true) with check (true);
create policy "auth all outreach_settings" on public.outreach_settings for all to authenticated using (true) with check (true);
grant all on public.outreach_settings to anon, authenticated;