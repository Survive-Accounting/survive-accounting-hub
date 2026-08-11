-- 0110_school_demand_log.sql — "My school isn't listed" demand signal (where to expand next).
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- When a visitor whose school isn't in the picker types a free-text school name, log it (timestamped)
-- so Lee can see demand by school. Deny-by-default RLS: written by the service-role server fn only.
create table if not exists public.school_demand_log (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_text   text,            -- the "What school?" free-text (may be blank if they skipped and it slipped through)
  email      text             -- reserved; the current inline field collects school text only
);
create index if not exists school_demand_log_created_idx on public.school_demand_log(created_at desc);

alter table public.school_demand_log enable row level security;
-- No public policies: only the service-role logSchoolDemand server fn writes.

notify pgrst, 'reload schema';
