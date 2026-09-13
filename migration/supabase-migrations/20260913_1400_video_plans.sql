-- 20260913_1400 — VIDEO PLANS: Now / Later / Skip for every video in a topic's chain (D).
--
-- Lee, 2026-09-13: "I want to have a full length chain that shows ALL the videos we're planning for
-- a given topic. Then, I'll go in and only make the ones that are most needed." One row per video
-- he has decided on; no row = undecided. A video is keyed by its set and its split's HEAD frame id
-- ("<setId>|<headFrameId>", or "<setId>|set" for a set with no plan yet) — the head id survives
-- re-splits elsewhere in the set, where a split number would not.
--
-- Additive. Deny-by-default RLS: only the service-role server functions (lib/video-plans.functions.ts,
-- behind assertAdmin) read or write it.

create table if not exists public.video_plans (
  video_key   text primary key check (char_length(video_key) between 1 and 300),
  set_id      text not null check (char_length(set_id) between 1 and 200),
  status      text not null check (status in ('now', 'later', 'skip')),
  note        text null check (note is null or char_length(note) <= 500),
  updated_by  text null,
  updated_at  timestamptz not null default now()
);

create index if not exists video_plans_set_idx on public.video_plans (set_id);

alter table public.video_plans enable row level security;
