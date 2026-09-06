-- THE ILLUSTRATION LIBRARY (2026-09-05). Lee: "can we catalog these illustrations as we build
-- them? Associate them with the CEQ set, so later I can recall it and use it if needed. And we
-- can see this as a library we're building versus one-offs."
--
-- Every generation is already kept forever in the canvas-media bucket (upsert:false, folder
-- illustrations/<setId>/<frameId>-<ts36>.<ext> — src/lib/illustrate.functions.ts) — but a
-- frame's OWN illustration field holds only its current picture, so once Lee regenerates a
-- slide, the picture before it becomes an orphaned file nobody can find again. This table is
-- the index that makes every generation, not just the current one per slide, browsable and
-- reusable — one row per successful Recraft call, written right after it succeeds, never
-- updated or deleted by the app. Lee reuses a row by copying its asset_url onto another frame's
-- illustration (or pairing it beside one, on a blank slide) — a free, no-API-call action;
-- nothing here is ever regenerated or rewritten in place.
--
-- Best-effort from the write side (src/lib/illustrate.functions.ts): a cataloguing failure
-- (this table missing because the migration hasn't run yet, or a transient DB error) never
-- blocks a generation Lee already paid Recraft for — it's logged and swallowed, matching
-- isMissingSchema's role everywhere else in this codebase for a not-yet-run migration.
--
-- RLS: deny-by-default like shipped_entries (20260905_2000) and frame_takes (0094) — all access
-- rides the service-role server fns in src/lib/illustrate.functions.ts.
create table if not exists public.illustration_library (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  frame_id text not null,
  title text null,
  prompt text not null,
  teaching_intent text null,
  style_preset text not null,
  style_version integer not null,
  asset_url text not null,
  asset_path text not null,
  seed bigint null,
  created_by text null,
  generated_at timestamptz not null default now()
);

-- The library is read scoped to one set at a time (IllustrationPanel's picker), newest first.
create index if not exists illustration_library_set_idx on public.illustration_library (set_id, generated_at desc);

alter table public.illustration_library enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
