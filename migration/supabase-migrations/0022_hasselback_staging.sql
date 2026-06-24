-- 0022_hasselback_staging.sql
-- Phase 1 / Part 1: staging table for the Hasselback Accounting Faculty
-- Directory CSVs (2023-2024 + 2015-2016). This is a SEED dataset only — it
-- augments/prioritizes targeting; the live scrape (faculty pages + course
-- sections) remains the source of record. Emails here are GUESSES
-- (email_username + domain) and must never be used as a confirmed send.
--
-- Idempotent: safe to re-run. Load fills it via PostgREST upsert on the
-- unique key; matching writes matched_campus_id back in a later step.

create extension if not exists pgcrypto;

create table if not exists public.hasselback_faculty (
  id                        uuid primary key default gen_random_uuid(),
  -- raw CSV columns (kept as text to mirror the source exactly)
  edition                   text,           -- '2023-2024' | '2015-2016'
  school_name               text,
  school_domain             text,
  state                     text,
  city                      text,
  last                      text,
  first                     text,
  name                      text,
  rank                      text,           -- Dean / C-Pr=chair / Prof / Assoc / Asst / InsAs / ...
  area_codes                text,
  areas_decoded             text,
  teaches_principles        text,           -- 'P' flag (intro)
  teaches_financial         text,           -- 'F' flag (intermediate-relevant)
  teaches_managerial        text,           -- 'M' flag (intro 2)
  degree                    text,
  degree_year               text,
  degree_school             text,
  email_username            text,           -- local-part ONLY; a guess, never a confirmed email
  cpa                       text,
  cma                       text,
  cia                       text,
  start_year                text,
  in_2015_2016              text,
  tenure_10yr_plus          text,           -- 'Y' = present in both editions ~8yrs apart = stable lead
  start_year_2015           text,
  school_attribution_suspect text,          -- 'Y' = unreliable school assignment; EXCLUDE for matching
  -- derived / linkage columns (filled by the matching step)
  norm_last                 text generated always as (lower(regexp_replace(coalesce(last,''), '[^a-zA-Z]', '', 'g'))) stored,
  first_initial             text generated always as (lower(substring(regexp_replace(coalesce(first,''), '[^a-zA-Z]', '', 'g') from 1 for 1))) stored,
  matched_campus_id         uuid references public.campuses(id) on delete set null,
  created_at                timestamptz default now(),
  -- idempotency: one row per person per edition per school
  unique (edition, school_name, name)
);

create index if not exists idx_hasselback_school on public.hasselback_faculty (lower(school_name));
create index if not exists idx_hasselback_matched on public.hasselback_faculty (matched_campus_id);
create index if not exists idx_hasselback_normlast on public.hasselback_faculty (norm_last, first_initial);
create index if not exists idx_hasselback_clean on public.hasselback_faculty (edition)
  where school_attribution_suspect is distinct from 'Y';

-- RLS: match the project convention (anon read, authenticated full; writes
-- happen via the service role which bypasses RLS).
alter table public.hasselback_faculty enable row level security;

drop policy if exists "anon read hasselback_faculty" on public.hasselback_faculty;
create policy "anon read hasselback_faculty" on public.hasselback_faculty
  for select to anon using (true);

drop policy if exists "auth all hasselback_faculty" on public.hasselback_faculty;
create policy "auth all hasselback_faculty" on public.hasselback_faculty
  for all to authenticated using (true) with check (true);
