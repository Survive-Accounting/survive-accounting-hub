-- PRODUCTION RUNS (2026-09-07). Lee: "'start timer - review' etc should be much more simple. In
-- background... like if I come to /talkthrough, when I first hit start recording, that starts
-- the timer. When I stop recording, background timer stops. For others, like step2, it can open
-- a popup modal that's like ready to start?, and same with step 3 film, step 4 post. … I want
-- to gather data on time spent, tasks worked on, possible bottlenecks, etc. The goal is to get
-- faster and faster with every new set we do." And: "I think we need to make this have a
-- checkbox step by step approach. … let me pause this timer, but make that require
-- confirmation … Which tasks do I get distracted most?"
--
-- One row per RUN — a set carried through the four timed Blast Off steps (Brainstorm · Editor ·
-- Rehearse & Film · Cross-post). The whole run is ONE jsonb document (`data`, the ProductionRun
-- of src/lib/production-run.ts: steps → tasks → seconds, every pause with its reason and the
-- task it hit, the per-step "what sucked" note). The widget keeps the active run in
-- localStorage and writes the document here on every change, best-effort — losing a write is
-- real but never worth blocking Lee mid-set over, and the next change re-sends the whole
-- document anyway. The scalar columns are copied out of the document for the two reads Step 5
-- needs without unpacking JSON: this set's runs, and every running run (the Cross-post picker).
--
-- production_time_log (20260905_2300) STAYS: a finished step also inserts its seconds there
-- through the existing logProductionTime, so productionBottleneckReport and set-stage's
-- "filmed?" signal keep working unchanged.
--
-- `set_id` is the canonical set id (BoothSetInfo.id — what production_time_log and
-- illustration_library key on). Names are denormalized at write time so a report stays readable
-- if a set is renamed.
--
-- Additive, idempotent. The code gates loudly: a write with this table missing reports "run
-- migration/supabase-migrations/20260907_0300_production_runs.sql" in the pill; reads return
-- nothing rather than throw, so Step 5 renders its empty state.
--
-- RLS: deny-by-default like production_time_log — all access rides the service-role server fns
-- in src/lib/production-run.functions.ts.
create table if not exists public.production_runs (
  id text primary key,
  set_id text not null,
  set_name text null,
  topic_slug text null,
  topic_name text null,
  status text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  data jsonb not null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_runs_status_ck check (status in ('running', 'done', 'abandoned'))
);

comment on table public.production_runs is
  'One Blast Off run per row: the whole ProductionRun document (src/lib/production-run.ts) in data, with its scalars copied out for indexing. Written by the production widget, read by Step 5 Improve Process.';

-- This set's runs (Step 5), and the running ones (getActiveRun, the Cross-post picker).
create index if not exists production_runs_set_idx on public.production_runs (set_id, started_at desc);
create index if not exists production_runs_status_idx on public.production_runs (status, started_at desc);

alter table public.production_runs enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
