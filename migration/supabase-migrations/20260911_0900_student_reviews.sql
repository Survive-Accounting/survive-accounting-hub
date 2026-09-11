-- 2026-09-11 09:00 — student_reviews: "Leave a review" on /learn (Lee's polish brief, §12).
--
-- The landing page's testimonials are hard-coded (src/components/site/Testimonials.tsx); nothing
-- in the schema held a student's rating. This is the smallest table that does: who, where, how
-- many stars, what they said. NOTHING here publishes — `published` defaults to false and no
-- page reads this table yet; Lee promotes a review by hand (or a later admin surface does).
-- Written only through the service role (src/lib/reviews.functions.ts submitReview); RLS is on
-- with no policies, so the anon key can neither read nor write it.
--
-- Until this runs, submitReview fails LOUDLY with a message naming this file; the form shows it.

begin;

create table if not exists public.student_reviews (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid,
  name         text not null,
  email        text not null,
  campus_id    uuid,
  campus_slug  text,
  course_code  text,
  exam         text,
  rating       smallint not null check (rating between 1 and 5),
  comment      text not null,
  source_path  text,
  is_test      boolean not null default false,
  published    boolean not null default false
);

comment on table public.student_reviews is 'Student reviews from /learn (Leave a review). published=false until Lee promotes one; no page reads this yet.';

create index if not exists student_reviews_created_at_idx on public.student_reviews (created_at desc);

alter table public.student_reviews enable row level security;

commit;

-- PROOF (must return one row per column, 14 rows, with rating smallint and published boolean):
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'student_reviews'
order by ordinal_position;
