-- 20260831_0900 — IDEAS TO SAVE: the prompt vault.
--
-- Lee loses hours because every idea becomes an immediate Claude Code session.
-- This table is the alternative: drop the idea in ten seconds, get back to
-- filming. One row per idea; the ONLY required field is the text itself.
--
-- Additive: new table, nothing existing is touched. Nothing here is
-- student-facing — it is production data for one operator.
--
-- NO DELETE PATH ON PURPOSE. "PARKED" is the archive: it is how an idea stops
-- resurfacing without being destroyed, so a decision not to do something is
-- recorded rather than lost.

create table if not exists public.ideas (
  id            text primary key,
  title         text not null default '',
  body          text not null default '',
  -- Multi-select: most ideas are two things at once (a rep dashboard is
  -- MARKETING and UI/UX). Stored as a plain text[] rather than a join table —
  -- the vocabulary is a fixed list of seven and lives in the client.
  categories    text[] not null default '{}',
  -- Free text with autocomplete over what has been used before, so the
  -- vocabulary grows from use instead of being designed up front.
  subcategory   text not null default '',
  -- IDEA · DRAFTED · SUBMITTED · APPROVED · PARKED
  status        text not null default 'IDEA',
  -- WHERE IT WAS WRITTEN. Auto-captured so an idea typed on /blast-off
  -- remembers that without Lee typing it.
  source_path   text not null default '',
  -- Any campus/set/context the page could name at capture time.
  context       jsonb not null default '{}'::jsonb,
  -- THE PROMPT. Written elsewhere with Claude, uploaded or pasted here, opened
  -- from any machine. Sync is just this column.
  prompt_md        text,
  prompt_filename  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The list sorts by recency and filters by status/category; searching is over
-- title + body.
create index if not exists ideas_updated_idx  on public.ideas (updated_at desc);
create index if not exists ideas_status_idx   on public.ideas (status);
create index if not exists ideas_categories_idx on public.ideas using gin (categories);

comment on table public.ideas is
  'IDEAS TO SAVE (2026-08-31) — Lee''s prompt vault. Capture in ten seconds, write the prompt elsewhere, upload the .md. No delete: PARKED is the archive.';
comment on column public.ideas.categories is
  'Multi-select from AUTHORING/FILMING/PUBLISHING/MARKETING/CUSTOMER_SUCCESS/UI_UX/INFRASTRUCTURE. Rep system is MARKETING + subcategory "rep system" — a distribution channel, not an interface.';
comment on column public.ideas.status is
  'IDEA (captured) · DRAFTED (a prompt exists) · SUBMITTED (handed to Claude Code) · APPROVED (shipped + verified) · PARKED (deliberately not doing this).';
comment on column public.ideas.source_path is
  'The route the idea was written from, auto-captured — context Lee should never have to type.';
