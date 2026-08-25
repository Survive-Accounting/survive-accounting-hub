-- Greek density signal (from a curated national dataset) — feeds greek_eligibility.
begin;
alter table public.campuses add column if not exists greek_pct_fraternity numeric null;
alter table public.campuses add column if not exists greek_pct_sorority numeric null;
alter table public.campuses add column if not exists greek_density_source text null;
commit;
