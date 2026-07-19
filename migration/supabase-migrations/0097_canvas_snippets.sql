-- 0097_canvas_snippets.sql — SNIPPET LIBRARY (personal clip-bin, PROMPT 2)
-- A snippet is a reusable saved cluster of canvas cards + their relative layout
-- and internal state. GLOBAL across scenes/courses on purpose ("my standard
-- T-account pair" works everywhere) — so no course/scene foreign key.
--
-- payload_json shape (versioned): { v: 1, nodes: CloneNode[], edges: CloneEdge[] }
-- where node positions are normalized to the cluster's top-left; spawn assigns
-- fresh node ids and re-parents into the drop target (see snippet-payload.ts).
--
-- Deny-by-default RLS like canvas_scenes (migration 0084): every access goes
-- through the service-role server fns in src/lib/snippet.functions.ts. This is
-- Lee's unlinked filming playground; there is no per-user auth here.
create extension if not exists "pgcrypto";

create table if not exists public.canvas_snippets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  payload_json jsonb not null,
  created_at   timestamptz not null default now()
);

-- newest-first listing in the palette
create index if not exists canvas_snippets_created_idx
  on public.canvas_snippets (created_at desc);

alter table public.canvas_snippets enable row level security;
-- No policies = deny-by-default; the service role bypasses RLS.
