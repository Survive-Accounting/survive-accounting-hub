-- 0044_rmp_ratings.sql
-- Phase 1 of RMP teaching-signal scoring: capture DATED, review-level RMP ratings.
-- The existing scraper only pulled each rating's "class" label (deduped) and threw
-- the date away, so recency/terms-taught were not derivable. This table stores one
-- row per RMP rating with its date + class + reputation fields, so a later phase can
-- roll them up into rmp_teaching_signal (Most Recent Term, LT Terms Taught, etc.).
--
-- PURELY ADDITIVE. Nothing reads this yet. Does NOT touch teaching_confidence, the
-- scheduler, the existing rmp_course_* aggregates, ProfIntel, or orders.
-- This table is intentionally "dumb": it stores raw labels/dates only. Course-family
-- matching happens at rollup time (so matching can be re-tuned without re-scraping).
-- Idempotent. Numbered 0044 (0038=mobility, 0039-0043=orders).
-- Anon CRUD (AdminGate'd UI), matching the outreach table convention.

create table if not exists public.rmp_ratings (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references public.campus_lead_suggestions(id) on delete cascade,
  campus_id        uuid references public.campuses(id) on delete set null,
  rmp_rating_id    text,                 -- RMP's own rating node id (base64 "Rating-<n>"), for idempotent upsert
  class_label      text,                 -- raw RMP "class" string, unmodified
  rated_at         timestamptz,          -- parsed from the rating's date ("YYYY-MM-DD HH:MM:SS +0000 UTC")
  comment          text,
  difficulty       numeric,              -- RMP difficultyRating (per rating)
  would_take_again numeric,              -- RMP wouldTakeAgain (per rating: 1 / 0 / null), stored as-is
  grade            text,                 -- RMP grade string (e.g. "A-", "Not sure yet")
  raw_json         jsonb,                -- full rating node, future-proofing
  scraped_at       timestamptz default now(),
  unique (lead_id, rmp_rating_id)
);

create index if not exists rmp_ratings_lead_idx   on public.rmp_ratings (lead_id);
create index if not exists rmp_ratings_campus_idx on public.rmp_ratings (campus_id);
create index if not exists rmp_ratings_rated_at_idx on public.rmp_ratings (rated_at);

alter table public.rmp_ratings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rmp_ratings' and policyname='rmp_ratings_all') then
    create policy rmp_ratings_all on public.rmp_ratings for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
