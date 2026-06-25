-- 0030_site_settings.sql
-- Single-row settings for the public landing page: per-section show/hide toggles
-- + an intro video field. Lets Lee flip sections on/off and set the hero video
-- without a redeploy. Idempotent. Next number after 0029.

create table if not exists public.site_settings (
  id int primary key default 1,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

-- Seed the singleton row (empty {} — the app merges with code defaults, so
-- Free Explainers + Beyond the Exam stay hidden by default).
insert into public.site_settings (id, settings)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Public read (the homepage reads these at load); writes go through the admin
-- server function on the service role, so no anon write policy.
alter table public.site_settings enable row level security;
drop policy if exists "anon read site_settings" on public.site_settings;
create policy "anon read site_settings" on public.site_settings
  for select to anon, authenticated using (true);
grant select on public.site_settings to anon, authenticated;
