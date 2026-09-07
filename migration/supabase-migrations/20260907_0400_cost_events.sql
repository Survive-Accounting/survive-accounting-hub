-- THE COST LEDGER (2026-09-07). Lee: "let's tally up cost. All of this AI generation has a cost,
-- no? … the recraft as a cost… the mux has a cost… etc. I want to know the cost per short, so I
-- can see whether it's justified or not to just make these with reckless abandon or not."
--
-- One row per paid call, keyed to the set it was for (and the production run when one is
-- active). Written best-effort from the places that already know the price: runMicro returns
-- costUsd (ai-registry.ts), Recraft returns credits (1000 = $1; recraft.server.ts), Whisper is
-- $0.006 a minute, Mux is an estimate per encoded minute. Read by Step 5 (Iterate) as "cost per
-- short" beside "time to beat". Never blocks the call it records — a missing table is a loud
-- console warning, not an error the user sees.
--
-- RLS deny-by-default like production_runs; all access via the service-role server fns in
-- src/lib/cost-ledger.functions.ts.
create table if not exists public.cost_events (
  id uuid primary key default gen_random_uuid(),
  set_id text null,
  run_id text null,
  kind text not null,
  usd numeric not null,
  model text null,
  label text null,
  meta jsonb null,
  created_by text null,
  created_at timestamptz not null default now(),
  constraint cost_events_kind_ck check (kind in ('ai', 'recraft', 'mux', 'whisper', 'other')),
  constraint cost_events_usd_ck check (usd >= 0)
);
comment on table public.cost_events is
  'One paid call per row (AI text, Recraft, Mux, Whisper), keyed to the set and the production run. Read by /v3 Iterate as cost per short.';
create index if not exists cost_events_set_idx on public.cost_events (set_id, created_at desc);
create index if not exists cost_events_kind_idx on public.cost_events (kind, created_at desc);
alter table public.cost_events enable row level security;
