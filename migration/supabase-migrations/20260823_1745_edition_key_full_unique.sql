-- Fix: PostgREST on_conflict=edition_key needs a NON-partial unique index.
-- A plain unique index still allows many NULL edition_key rows (Postgres treats
-- NULLs as distinct), so legacy textbooks rows are unaffected.
begin;
drop index if exists public.textbooks_edition_key_uidx;
create unique index if not exists textbooks_edition_key_uidx
  on public.textbooks (edition_key);
commit;
