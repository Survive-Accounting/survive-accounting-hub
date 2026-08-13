-- 0094: FRAME TAKES — the take board behind the Present Canvas filming loop.
-- One row per OBS clip uploaded to Mux for a frame. frame_id is the canvas
-- frame's node id (text — scene-payload ids, not a FK). passthrough mirrors
-- Mux's asset passthrough ("SH-L01-hook-f2-t1" style) so the Mux library stays
-- organized without Lee ever touching asset IDs.
--
-- RLS: deny-by-default like canvas_scenes (0084) — all access rides the
-- service-role server fns in canvas.functions.ts.

create table if not exists public.frame_takes (
  id uuid primary key default gen_random_uuid(),
  frame_id text not null,
  take_n int not null,
  mux_upload_id text,
  mux_asset_id text not null default '',
  mux_playback_id text,
  passthrough text,
  status text not null default 'uploading', -- uploading | processing | ready | errored
  keeper boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists frame_takes_frame_idx on public.frame_takes (frame_id, take_n desc);
create index if not exists frame_takes_upload_idx on public.frame_takes (mux_upload_id);

alter table public.frame_takes enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
