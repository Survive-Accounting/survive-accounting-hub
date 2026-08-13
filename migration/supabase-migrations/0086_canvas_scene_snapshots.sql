-- 0086: canvas_scene_snapshots — automatic safety copies of Present Canvas scenes.
-- MANUAL APPLY: paste into the Supabase SQL editor (live project unvxagsledbsdoremqeb).
-- One snapshot is taken automatically when film mode turns ON; the server fn keeps
-- only the 10 newest per scene. Deny-by-default RLS (service-role access only),
-- same posture as canvas_scenes (0084).

create table if not exists public.canvas_scene_snapshots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.canvas_scenes(id) on delete cascade,
  taken_at timestamptz not null default now(),
  label text,
  nodes_json jsonb not null,
  viewport_json jsonb,
  bg text
);

create index if not exists canvas_scene_snapshots_scene_idx
  on public.canvas_scene_snapshots (scene_id, taken_at desc);

alter table public.canvas_scene_snapshots enable row level security;
-- no policies on purpose: anon/authenticated denied; service role bypasses RLS
