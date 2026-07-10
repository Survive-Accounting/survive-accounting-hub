-- 0055_greek_v2 — Greek registry v2: SEC preseed support + ProPublica enrichment.
--   • campus_greek_chapters.council_raw (store the CSV's raw council value) + a
--     unique (campus_id, greek_org_id) so the seed can idempotent-upsert
--   • greek_orgs: ein / address / propublica_url (from 990 enrichment)
--   • greek_org_filings: per-year 990 financials (upsert by org_id+tax_year)
--   • greek_org_people: officers/advisors accumulated across filings (THE LEADS)
--   • greek_org_propublica_cache: raw API response per EIN (single call, cached)
-- Idempotent. After 0054. Anon-CRUD RLS on new tables.

alter table public.campus_greek_chapters add column if not exists council_raw text;
create unique index if not exists campus_greek_chapters_campus_org_uidx
  on public.campus_greek_chapters (campus_id, greek_org_id);

alter table public.greek_orgs
  add column if not exists ein            text,
  add column if not exists address        text,
  add column if not exists propublica_url text;

create table if not exists public.greek_org_filings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.greek_orgs(id) on delete cascade,
  tax_year         integer,
  revenue          numeric,
  expenses         numeric,
  assets_eoy       numeric,
  liabilities_eoy  numeric,
  pdf_url          text,
  object_id        text,
  source           text not null default 'propublica',
  created_at       timestamptz not null default now(),
  unique (org_id, tax_year)
);
create index if not exists greek_org_filings_org_idx on public.greek_org_filings (org_id);

create table if not exists public.greek_org_people (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.greek_orgs(id) on delete cascade,
  person_name  text not null,
  titles       text[] not null default '{}',
  years        integer[] not null default '{}',  -- distinct years seen (drives years_count, idempotent re-pastes)
  first_year   integer,
  last_year    integer,
  years_count  integer not null default 0,
  is_current   boolean not null default false,
  email        text,
  phone        text,
  linkedin_url text,
  notes        text,
  source       text not null default 'propublica_officers',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, person_name)
);
create index if not exists greek_org_people_org_idx on public.greek_org_people (org_id);
create index if not exists greek_org_people_years_idx on public.greek_org_people (years_count desc);

create table if not exists public.greek_org_propublica_cache (
  ein        text primary key,
  response   jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.greek_org_filings enable row level security;
alter table public.greek_org_people enable row level security;
alter table public.greek_org_propublica_cache enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='greek_org_filings' and policyname='greek_org_filings_all') then
    create policy greek_org_filings_all on public.greek_org_filings for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='greek_org_people' and policyname='greek_org_people_all') then
    create policy greek_org_people_all on public.greek_org_people for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='greek_org_propublica_cache' and policyname='greek_org_propublica_cache_all') then
    create policy greek_org_propublica_cache_all on public.greek_org_propublica_cache for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
