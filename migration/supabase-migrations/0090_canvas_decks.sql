-- 0090_canvas_decks.sql
-- Named DECKS as first-class, reusable objects (P3). A deck is a saved collection
-- of whole CARDS or MEMO objects (payload_type), dealt in sequence or shuffled,
-- optionally pinned to a lesson and laid on a slot GRID (skeleton preview, P4).
-- Scenes currently carry their deck DEFS inline (scene.decks) so decks work
-- offline; this table is the LIBRARY layer that makes a deck reusable ACROSS
-- scenes (load a saved deck definition into any scene). Membership (which cards
-- belong) stays per-scene via card.data.deckId; slots_json holds the grid.
--
-- RLS: deny-by-default (no policies), like canvas_scenes — all access via server
-- functions with the service-role key; the browser never touches it directly.
-- Lee-only authoring table, no per-user auth.
--
-- NOT YET APPLIED when committed — run in the Supabase SQL editor (live project
-- unvxagsledbsdoremqeb). Numbered after the true high-water mark (0089).

create table if not exists public.canvas_decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload_type text not null default 'cards' check (payload_type in ('cards', 'memos')),
  filter text null,                                    -- card-kind or memo-kind/category, or null
  run_mode text not null default 'sequence' check (run_mode in ('sequence', 'shuffle')),
  lesson_id text null,                                 -- scene-local lesson node id (not FK)
  slots_json jsonb not null default '[]'::jsonb,       -- DeckSlot[] { x, y } in deal order
  show_skeletons boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_decks enable row level security;
-- no policies on purpose: service-role only.

create index if not exists canvas_decks_updated_idx on public.canvas_decks (updated_at desc);
