-- Scraper hardening pass (2026-08-25 structural-backfill audit follow-up).
-- Two additive tables. Nothing existing is modified. Apply via the standard
-- run_sql / Management API recipe. Safe to re-run (idempotent).
begin;

-- 1) External-call cache for SERP + Firecrawl. Keyed by hash(kind,query|url).
--    Lets re-runs/resumes skip identical paid calls. See src/lib/scrape-cache.ts.
create table if not exists public.scrape_cache (
  cache_key text primary key,           -- '<kind>:<sha256(key)>'
  kind text not null,                   -- 'serp' | 'firecrawl'
  value jsonb not null,                 -- results array (serp) or {markdown} (firecrawl)
  created_at timestamptz not null default now()
);
alter table public.scrape_cache enable row level security;
create index if not exists scrape_cache_created_idx on public.scrape_cache (created_at);

-- 1b) Single-orchestrator advisory lock. Only one backfill orchestrator may
--     hold the 'global' lease at a time (2-min renewable). See api.backfill.tsx.
create table if not exists public.backfill_lock (
  id text primary key,                  -- 'global'
  owner text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.backfill_lock enable row level security;

-- 2) Growth scoring exclusions — records the Growth dashboard must NOT score on
--    (over-collected professor counts, suspected wrong-campus Greek counts).
--    Growth V1 consumes this as an exclusion list. Preserves the underlying
--    data; it only tells scoring to ignore/flag these metrics for these campuses.
create table if not exists public.growth_scoring_exclusions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  metric text not null,                 -- 'professor_count' | 'greek_chapter_count'
  reason text not null,                 -- 'over_collection' | 'suspected_wrong_campus'
  status text not null default 'quarantined', -- 'quarantined' | 'needs_review' | 'cleared'
  value int,
  note text,
  created_at timestamptz not null default now(),
  unique (campus_id, metric)
);
alter table public.growth_scoring_exclusions enable row level security;
create index if not exists gse_campus_idx on public.growth_scoring_exclusions (campus_id);

-- Seed: professor-count over-collection (>=80 active leads; accounting depts do
-- not have this many faculty — whole business school was captured). NOTE: raw
-- professor COUNT is DO-NOT-SCORE globally; these are the worst offenders for a
-- data-cleanup review.
insert into public.growth_scoring_exclusions (campus_id, metric, reason, status, value, note) values
  ('a71aeefa-4c87-4ac3-ad74-e321c0b91615','professor_count','over_collection','needs_review',259,'University of Virginia — whole business school captured'),
  ('f56a0047-8688-48a1-b671-22ebcf12eb28','professor_count','over_collection','needs_review',118,'UIUC'),
  ('102fd422-da6d-47e5-aabe-e5d83c511408','professor_count','over_collection','needs_review',114,'UT Austin'),
  ('80ae185c-a39a-4506-9f54-adefebf47662','professor_count','over_collection','needs_review',103,'University of La Verne — small school, count implausible'),
  ('1eadb5cb-b0b8-45f1-9529-51cf18863dc0','professor_count','over_collection','needs_review',95,'Oral Roberts University — small school'),
  ('6a03001e-d222-4c4e-9437-1cab7241feaa','professor_count','over_collection','needs_review',90,'University of Minnesota'),
  ('8f13bb14-57bf-4d27-92a5-51f638c18ecc','professor_count','over_collection','needs_review',85,'UT Rio Grande Valley')
on conflict (campus_id, metric) do nothing;

-- Seed: Greek-chapter count suspected wrong-campus (implausibly high for a
-- community/small college — likely GreekRank id bled from a same-named or
-- nearby larger institution). Large flagship Greek systems (UIUC 101, Rutgers
-- 79, etc.) are plausible and intentionally NOT excluded.
insert into public.growth_scoring_exclusions (campus_id, metric, reason, status, value, note) values
  ('d11e6ca3-fae0-4e1e-ac9f-cbbac4c238f0','greek_chapter_count','suspected_wrong_campus','needs_review',64,'Parkland College (community college)'),
  ('e1d3aaab-0722-4800-8b9d-2eedf84393b8','greek_chapter_count','suspected_wrong_campus','needs_review',58,'Austin Community College'),
  ('892382c3-5770-41cb-b94f-8407abd92be8','greek_chapter_count','suspected_wrong_campus','needs_review',61,'Indiana University Northwest (commuter/regional)'),
  ('6f64b325-7d6d-4bd4-8f24-edcf98168ca1','greek_chapter_count','suspected_wrong_campus','needs_review',61,'Cornell College (small LAC — likely Cornell University bleed)'),
  ('a882f4d7-c404-4765-9dfe-4409cd85d821','greek_chapter_count','suspected_wrong_campus','needs_review',57,'Franklin & Marshall College (small LAC)')
on conflict (campus_id, metric) do nothing;

commit;
