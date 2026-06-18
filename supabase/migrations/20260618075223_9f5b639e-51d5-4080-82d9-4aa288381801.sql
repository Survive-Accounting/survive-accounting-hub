
-- Queue of campuses to process overnight
create table if not exists public.outreach_faculty_batch_queue (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  status text not null default 'pending', -- pending | running | done | failed
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (campus_id)
);
grant select, insert, update, delete on public.outreach_faculty_batch_queue to authenticated;
grant all on public.outreach_faculty_batch_queue to service_role;
alter table public.outreach_faculty_batch_queue enable row level security;
create policy "auth all faculty batch queue" on public.outreach_faculty_batch_queue
  for all to authenticated using (true) with check (true);

create index if not exists outreach_faculty_batch_queue_status_idx
  on public.outreach_faculty_batch_queue(status, created_at);

-- Per-campus run log
create table if not exists public.outreach_faculty_batch_runs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  scraped integer not null default 0,
  tagged integer not null default 0,
  imported integer not null default 0,
  skipped integer not null default 0,
  error text,
  finished_at timestamptz not null default now()
);
grant select, insert, update, delete on public.outreach_faculty_batch_runs to authenticated;
grant all on public.outreach_faculty_batch_runs to service_role;
alter table public.outreach_faculty_batch_runs enable row level security;
create policy "auth all faculty batch runs" on public.outreach_faculty_batch_runs
  for all to authenticated using (true) with check (true);
create index if not exists outreach_faculty_batch_runs_finished_idx
  on public.outreach_faculty_batch_runs(finished_at desc);

-- Schedule the worker
select cron.schedule(
  'faculty-overnight-batch-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://project--30776a22-b2b5-4c85-a1c5-8bab0dc2d0f3.lovable.app/api/public/hooks/faculty-overnight-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobHpvcnJlc3VyemxjcHVwbGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTMyNjksImV4cCI6MjA5NjY4OTI2OX0.-_aaTcq1zh7XfUfBxNYq8rtwflsrr-JOuXt3rNIiOTE'
    ),
    body := '{}'::jsonb
  );
  $$
);
