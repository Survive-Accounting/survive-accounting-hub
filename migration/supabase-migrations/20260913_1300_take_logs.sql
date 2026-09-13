-- 20260913_1300 — TAKE LOGS: the slide timeline of a recording, so one continuous take becomes many videos.
--
-- Lee, 2026-09-13: "once we have a chain built, I can just do one continuous take and get a TON of
-- videos posted in one day." /film already knows exactly when each slide arrived while OBS was
-- recording (F4 is both the OBS key and the roll). This table keeps that timeline — one row per roll —
-- so Post can slice the one file at every split boundary, minus the F3 scraps, without a spoken token.
--
-- Additive. Deny-by-default RLS: only the service-role server functions (lib/take-log.functions.ts,
-- behind assertAdmin) read or write it.

create table if not exists public.take_logs (
  id            uuid primary key default gen_random_uuid(),
  -- "<setId>#<take index | all>@<rolled-at ISO>" — the same take_ref the F3 scraps carry.
  take_ref      text not null unique check (char_length(take_ref) between 1 and 300),
  set_id        text not null check (char_length(set_id) between 1 and 200),
  rolled_at     timestamptz not null,
  -- [{ "frameId": "...", "take": 2, "atMs": 12345 }, ...] in arrival order, ms from the roll.
  arrivals      jsonb not null default '[]'::jsonb check (jsonb_typeof(arrivals) = 'array'),
  created_by    text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists take_logs_set_rolled_idx on public.take_logs (set_id, rolled_at desc);

alter table public.take_logs enable row level security;

comment on table public.take_logs is
  'One row per /film roll (F4): when each slide arrived, in ms from the roll. Post slices a continuous recording at split boundaries from it, minus the take_abandoned scraps in frame_events.';
