-- Growth simplification pass (2026-08-27): chapter_size on the roster row.
-- Additive + idempotent. Nullable on purpose — the outreach recipient sort reads it
-- (nulls last) and the number lights up as the separately-loaded data lands.
alter table public.campus_greek_chapters
  add column if not exists chapter_size integer;
comment on column public.campus_greek_chapters.chapter_size is
  'Member count for outreach prioritisation. Loaded separately; null = unknown (sorts last).';
