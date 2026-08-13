-- 0084_canvas_scenes.sql
-- Present Canvas (/study/canvas) scene persistence. One row per saved whiteboard layout:
-- the full React Flow node array (cards + edit/reveal state), zones, and viewport.
-- waypoints_json is RESERVED for the v1.1 student map — unused now.
--
-- RLS: deny-by-default (no policies). All reads/writes go through server functions with
-- the service-role key (src/lib/canvas.functions.ts) — the browser never touches this
-- table directly. No auth on the route; it is Lee's unlinked filming playground.
--
-- NOT YET APPLIED when committed — run in the Supabase SQL editor (Management-API PAT is
-- blocked/exposed; service-role REST cannot run DDL). The canvas falls back to
-- localStorage with a loud banner until this exists.

create table if not exists public.canvas_scenes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chapter_id uuid null references public.chapters(id) on delete set null,
  nodes_json jsonb not null default '{}'::jsonb,      -- { nodes: CardNode[], zones: ZoneBox[] }
  viewport_json jsonb not null default '{}'::jsonb,   -- { x, y, zoom }
  waypoints_json jsonb null,                          -- reserved: v1.1 student map
  bg text not null default 'flat',                    -- flat | grid | video
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_scenes enable row level security;
-- no policies on purpose: service-role only.

create index if not exists canvas_scenes_updated_idx on public.canvas_scenes (updated_at desc);
