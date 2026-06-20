-- 0020: Batch scraping + scraper projects.
--   scrape_batches   — one row per batch "order": which campuses, the quote,
--                      the actual cost, how many leads, and the status. Powers
--                      the Batch Scrape screen's history (best-effort persisted).
--   scraper_projects — lightweight project tracker for handing work to a VA
--                      (e.g. "Greek Organizations" → King). The in-app Projects
--                      panel reads/writes this (ships next).
--
-- Anon RLS to match the rest of the app (no auth yet — previewer is anon).
-- ⚠️ Lock these down with the drop statements at the bottom once auth exists.

create table if not exists public.scrape_batches (
  id uuid primary key default gen_random_uuid(),
  vertical text not null default 'accounting',
  campus_ids jsonb not null default '[]'::jsonb,
  campus_count integer not null default 0,
  est_cost_usd numeric(10,4) not null default 0,
  actual_cost_usd numeric(10,4) not null default 0,
  leads_inserted integer not null default 0,
  status text not null default 'completed',  -- completed | completed_with_errors | running | failed
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists scrape_batches_created_idx on public.scrape_batches(created_at desc);

create table if not exists public.scraper_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null default 'greek',
  description text,
  assignee text,                              -- e.g. 'King'
  status text not null default 'todo',        -- todo | in_progress | review | done | blocked
  links jsonb not null default '[]'::jsonb,    -- [{label, url}]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scraper_projects_status_idx on public.scraper_projects(status, created_at desc);

-- RLS
alter table public.scrape_batches enable row level security;
alter table public.scraper_projects enable row level security;

create policy "anon read scrape_batches" on public.scrape_batches for select to anon using (true);
create policy "anon write scrape_batches" on public.scrape_batches for insert to anon with check (true);
create policy "anon update scrape_batches" on public.scrape_batches for update to anon using (true) with check (true);
create policy "anon delete scrape_batches" on public.scrape_batches for delete to anon using (true);

create policy "anon read scraper_projects" on public.scraper_projects for select to anon using (true);
create policy "anon write scraper_projects" on public.scraper_projects for insert to anon with check (true);
create policy "anon update scraper_projects" on public.scraper_projects for update to anon using (true) with check (true);
create policy "anon delete scraper_projects" on public.scraper_projects for delete to anon using (true);

-- ============================================================
-- TO LOCK DOWN LATER (run once auth exists):
-- drop policy "anon read scrape_batches" on public.scrape_batches;
-- drop policy "anon write scrape_batches" on public.scrape_batches;
-- drop policy "anon update scrape_batches" on public.scrape_batches;
-- drop policy "anon delete scrape_batches" on public.scrape_batches;
-- drop policy "anon read scraper_projects" on public.scraper_projects;
-- drop policy "anon write scraper_projects" on public.scraper_projects;
-- drop policy "anon update scraper_projects" on public.scraper_projects;
-- drop policy "anon delete scraper_projects" on public.scraper_projects;
