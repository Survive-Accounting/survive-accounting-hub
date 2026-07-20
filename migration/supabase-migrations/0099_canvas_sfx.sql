-- 0099_canvas_sfx.sql — GLOBAL canvas sound-effect config (single row).
--
-- Holds the URLs of the four SFX files Lee uploads himself (keypad · swoosh ·
-- cramLaunch · confirm), so every scene and every filming machine plays the SAME
-- sounds — no per-scene mismatch. The audio bytes live in the existing
-- `canvas-media` storage bucket (migration 0085); this table only stores their
-- public URLs. Written exclusively by the service-role server fns
-- (uploadCanvasSfxFile → saveCanvasSfx in src/lib/canvas.functions.ts).
--
-- Idempotent — safe to re-run. Deny-by-default RLS: no policies, so anon/auth
-- clients get nothing; all access is server-side via the service role.

create table if not exists public.canvas_sfx (
  id         smallint primary key default 1,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint canvas_sfx_singleton check (id = 1)
);

alter table public.canvas_sfx enable row level security;

-- seed the singleton row (empty config ⇒ code falls back to the bundled /sfx/*)
insert into public.canvas_sfx (id, config)
  values (1, '{}'::jsonb)
  on conflict (id) do nothing;
