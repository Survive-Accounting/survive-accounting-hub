-- 0095: LESSON VIDEOS — the publish pipeline behind "Publish lesson". One row per
-- PUBLISH of a lesson (re-publish bumps `version`, keeping prior rows). lesson_id
-- is the canvas lesson's node id (text — scene-payload id, not a FK). The row is a
-- STAGED status machine the client polls: concat → uploading → processing → ready
-- (or errored). It threads the Mux body-concat asset, the Auphonic production, and
-- the final Mux asset/playback the student dashboard plays.
--
-- RLS: deny-by-default like frame_takes (0094) / canvas_scenes (0084) — all access
-- rides the service-role server fns in publish.functions.ts. (The dashboard reads
-- published lessons through a server fn too, so no public policy is needed yet.)

create table if not exists public.lesson_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null,
  version int not null,
  -- staged pipeline status
  stage text not null default 'concat',       -- concat | uploading | processing | ready | errored
  error text,
  -- lesson identity carried for the dashboard + Mux passthrough
  course_name text,
  lesson_label text,
  passthrough text,                            -- "{COURSE}-{LESSON}-v{n}"
  -- stage handles
  mux_body_asset_id text,                      -- Mux multi-input concat of the keeper takes
  mux_body_playback_id text,
  intro_playback_id text,                      -- the lesson's INTRO take (Auphonic intro input)
  auphonic_uuid text,                          -- the Auphonic production (loudness + intro/outro)
  mux_asset_id text,                           -- the FINAL asset the student plays
  playback_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_videos_lesson_idx on public.lesson_videos (lesson_id, version desc);
create unique index if not exists lesson_videos_lesson_version_uidx on public.lesson_videos (lesson_id, version);

alter table public.lesson_videos enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.

-- STREAM-DRIFT CHECK: the publish preflight compares keeper takes' stored video
-- resolution, so a take shot with different OBS settings is caught before concat.
-- resolveFrameTake now captures these from the Mux asset's video track.
alter table public.frame_takes add column if not exists width int;
alter table public.frame_takes add column if not exists height int;
