-- 0112_chapter_parked.sql — MANUAL-APPLY. Paste into the Supabase SQL editor (project unvxagsledbsdoremqeb).
-- Adds an AUTHORING-only "parked" flag to chapters (topics). Parked topics collapse into a muted
-- "Parked ideas" group in the leftmost outline so Lee can braindump future-exam topics without
-- cluttering the production view. NEVER student-facing — student/landing queries don't read it, and a
-- parked topic's sets are treated as not-live regardless. Idempotent.

alter table public.chapters
  add column if not exists parked boolean not null default false;

comment on column public.chapters.parked is
  'Authoring-only: topic is parked (braindump/ideas), hidden from the production outline. Not student-facing.';
