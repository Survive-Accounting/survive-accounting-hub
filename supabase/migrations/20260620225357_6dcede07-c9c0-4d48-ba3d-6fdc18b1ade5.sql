create table if not exists public.scrape_batches (
  id uuid primary key default gen_random_uuid(),
  vertical text not null default 'accounting',
  campus_ids jsonb not null default '[]'::jsonb,
  campus_count integer not null default 0,
  est_cost_usd numeric(10,4) not null default 0,
  actual_cost_usd numeric(10,4) not null default 0,
  leads_inserted integer not null default 0,
  status text not null default 'completed',
  notes text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.scrape_batches to anon;
grant select, insert, update, delete on public.scrape_batches to authenticated;
grant all on public.scrape_batches to service_role;

create index if not exists scrape_batches_created_idx on public.scrape_batches(created_at desc);

create table if not exists public.scraper_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null default 'greek',
  description text,
  assignee text,
  status text not null default 'todo',
  links jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.scraper_projects to anon;
grant select, insert, update, delete on public.scraper_projects to authenticated;
grant all on public.scraper_projects to service_role;

create index if not exists scraper_projects_status_idx on public.scraper_projects(status, created_at desc);

alter table public.scrape_batches enable row level security;
alter table public.scraper_projects enable row level security;

create policy "anon read scrape_batches"   on public.scrape_batches   for select to anon using (true);
create policy "anon write scrape_batches"  on public.scrape_batches   for insert to anon with check (true);
create policy "anon update scrape_batches" on public.scrape_batches   for update to anon using (true) with check (true);
create policy "anon delete scrape_batches" on public.scrape_batches   for delete to anon using (true);

create policy "anon read scraper_projects"   on public.scraper_projects for select to anon using (true);
create policy "anon write scraper_projects"  on public.scraper_projects for insert to anon with check (true);
create policy "anon update scraper_projects" on public.scraper_projects for update to anon using (true) with check (true);
create policy "anon delete scraper_projects" on public.scraper_projects for delete to anon using (true);
