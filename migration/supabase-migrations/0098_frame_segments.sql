-- 0098_frame_segments.sql — BEAT-LEVEL SEGMENTS + KEEPERS (PROMPT 4)
-- A frame's take is split at the aligned cut boundaries into per-beat SEGMENTS
-- (one space-to-space beat each). Keeper marking moves to the SEGMENT level, so a
-- fluffed reveal is a one-beat re-record, and a beat's keeper can come from a
-- different take of the same frame (the punch-in). The publish assembly and the
-- keepers reel read the keeper segment per (frame_id, beat_index).
--
-- The PENDING CUE LOG (space-press wall-clock times) rides the scene JSON on the
-- frame (FrameBox.cueLog) — additive, no column needed. This migration is only
-- the persisted segments + their keeper flags.
--
-- Deny-by-default RLS like frame_takes (0094); all access via the service-role
-- server fns. `take_id` cascades so deleting a take drops its segments.
create extension if not exists "pgcrypto";

create table if not exists public.frame_segments (
  id         uuid primary key default gen_random_uuid(),
  take_id    uuid not null references public.frame_takes(id) on delete cascade,
  frame_id   text not null,
  beat_index int  not null,
  start_s    double precision not null,
  end_s      double precision not null,
  keeper     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists frame_segments_take_idx  on public.frame_segments (take_id);
create index if not exists frame_segments_frame_idx on public.frame_segments (frame_id);
-- At most ONE keeper per (frame, beat) — the beat's shipping segment.
create unique index if not exists frame_segments_keeper_ux
  on public.frame_segments (frame_id, beat_index) where keeper;

alter table public.frame_segments enable row level security;
-- No policies = deny-by-default; the service role bypasses RLS.
