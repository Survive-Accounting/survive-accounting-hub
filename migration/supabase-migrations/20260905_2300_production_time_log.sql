-- PRODUCTION TIME LOG (2026-09-05). Lee: "I want to time how long it takes for each step for
-- blast offs, talkthrough, review, film... a popup that says start timer, it moves to the top
-- right and runs, then I can stop it when I'm done. Pause it, etc. It can keep a log of
-- everything done... We want to make it trackable for me so we can understand the cost in
-- dollars and time to produce each video and each topic, each exam, each course... I'd also
-- love if it generated reports about where bottlenecks may exist. Which step?"
--
-- One row per START-to-STOP timer session. `seconds` is already pause-adjusted (active time
-- only) — the widget (src/components/v3/ProductionTimer.tsx) tracks pause locally and sends
-- the final active total, so no separate pause-interval bookkeeping is needed here. `set_id` /
-- `topic_slug` are the URL slugs (v3.$topic.$set.blast-off.*) — the same identifiers
-- illustration_library.set_id already uses, so a per-set report can join the two without a
-- lookup table. Denormalized names (`set_name`, `topic_name`) are captured at log time so a
-- report stays readable even if a topic or set is later renamed or restructured.
--
-- RLS: deny-by-default like illustration_library (20260905_2200) and shipped_entries
-- (20260905_2000) — all access rides the service-role server fns in
-- src/lib/production-time.functions.ts.
create table if not exists public.production_time_log (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  set_name text null,
  topic_slug text null,
  topic_name text null,
  step text not null,
  seconds integer not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_by text null,
  note text null,
  created_at timestamptz not null default now(),
  constraint production_time_log_step_ck check (step in ('talkthrough', 'review', 'film', 'post')),
  constraint production_time_log_seconds_ck check (seconds >= 0)
);

-- Per-set report (every step logged for one set) and the bottleneck report (which step is
-- slow, across sets) are the two reads — one index per access pattern.
create index if not exists production_time_log_set_idx on public.production_time_log (set_id, started_at desc);
create index if not exists production_time_log_step_idx on public.production_time_log (step, started_at desc);

alter table public.production_time_log enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
