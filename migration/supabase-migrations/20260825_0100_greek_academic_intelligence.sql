-- Greek Academic Intelligence — public FSL academic/GPA report ingestion layer.
--
-- OPT-IN ENRICHMENT ONLY. Never required for campus activation, student access,
-- outreach readiness, Course Intel, or Greek structural completeness. NO_PUBLIC_DATA
-- is a valid completed outcome; it must never read as NOT_RUN.
--
-- Identity: attaches to the canonical per-campus roster row campus_greek_chapters(id)
-- (NOT greek_chapters, the self-serve signup table). Councils are free-text on
-- campus_greek_chapters — reads MUST use councilMatches() in
-- src/lib/greek-councils.functions.ts, never ===. A per-org chapter_gpa table already
-- exists (0056), keyed on (greek_org_id, term) with NO campus dimension, so it cannot
-- distinguish the same national org at two campuses; this layer supersedes it for
-- per-campus data and is keyed on campus_greek_chapter_id.
--
-- Mirrors existing conventions: status template = campus_council_status
-- (20260824_1200); provenance = course_document / campus_council_contacts; RLS =
-- deny-by-default, service-role only (no anon/authenticated policies).
--
-- Feeds LATER (read-only): the reserved market-intel course_readiness_* / greek
-- distribution slots. This migration does NOT touch or mutate any market/opportunity
-- score.

begin;

-- ── 1. Report-level model (one row per discovered public report) ──────────────
create table if not exists public.greek_academic_reports (
  id            uuid primary key default gen_random_uuid(),
  campus_id     uuid not null references public.campuses(id) on delete cascade,

  report_title  text,
  -- greek_academic_report|community_academic_report|grade_report|scholarship_report
  -- |scorecard|academic_performance|other
  report_type   text default 'other',
  -- which council population the report covers, when the report itself is scoped:
  -- all_greek|ifc|panhellenic|nphc|mgc|mixed|unknown
  council_scope text default 'unknown',

  term          text,          -- normalized: fall|spring|summer|winter|null
  year          int,
  semester_key  text,          -- canonical e.g. 'fall_2025' (mirrors chapter_gpa.term)

  -- provenance (mirrors course_document / campus_council_contacts)
  source_url    text not null,
  canonical_url text,          -- source_url minus #fragment (dedupe key)
  source_domain text,
  -- official_university_fsl|official_hosted_report|official_council|third_party|unknown
  source_type   text default 'unknown',
  file_type     text,          -- html|pdf|xlsx|csv|docx
  discovered_by text,          -- serp|archive|seed_fsl_url|seed_campus_context|manual

  retrieved_at  timestamptz default now(),
  first_seen    timestamptz default now(),
  last_checked  timestamptz,
  last_changed  timestamptz,
  content_hash  text,

  -- discovered|fetched|parsed|error|needs_review|skipped|no_data
  parse_status  text default 'discovered',
  confidence    text default 'medium',   -- high|medium|low

  -- community-level college/major participation (spec §15), when the report exposes it
  business_students_count   int,
  business_students_percent numeric,
  accounting_students_count int,
  major_breakdown           jsonb,       -- richer per-college counts, source-shaped

  notes         text,
  superseded_by uuid references public.greek_academic_reports(id) on delete set null,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (campus_id, canonical_url)
);
create index if not exists idx_gar_campus on public.greek_academic_reports(campus_id);
create index if not exists idx_gar_semester on public.greek_academic_reports(campus_id, semester_key);
create index if not exists idx_gar_hash on public.greek_academic_reports(content_hash);

-- ── 2. Chapter academic record (chapter × report × semester) ──────────────────
create table if not exists public.greek_chapter_academics (
  id                     uuid primary key default gen_random_uuid(),
  campus_id              uuid not null references public.campuses(id) on delete cascade,
  -- canonical chapter link; NULL when the reported chapter could not be resolved.
  campus_greek_chapter_id uuid references public.campus_greek_chapters(id) on delete set null,
  greek_org_id           uuid references public.greek_orgs(id) on delete set null,
  source_report_id       uuid not null references public.greek_academic_reports(id) on delete cascade,

  council                text,           -- raw council string as reported
  council_normalized     text,           -- ifc|panhellenic|nphc|mgc|other (via councilMatches)

  chapter_name_as_reported text not null, -- preserved verbatim (spec §9)
  canonical_chapter_name   text,

  term          text,
  year          int,
  semester_key  text,

  chapter_gpa            numeric,
  active_member_gpa      numeric,
  new_member_gpa         numeric,

  member_count           int,
  active_member_count    int,
  new_member_count       int,

  deans_list_count       int,
  deans_list_percent     numeric,
  academic_probation_count int,

  -- population baselines as printed in THIS report (context-preserving)
  council_average_gpa    numeric,
  all_greek_average_gpa  numeric,
  all_men_gpa            numeric,
  all_women_gpa          numeric,
  all_undergraduate_gpa  numeric,

  chapter_rank_within_council int,
  number_of_chapters_in_council int,

  -- chapter-level major participation, when the report breaks it out
  business_students_count   int,
  business_students_percent numeric,

  gpa_scale     numeric default 4.0,   -- 4.0|4.3 institutional scale
  source_url    text,
  parse_confidence text default 'medium', -- high|medium|low
  match_status  text default 'UNMATCHED', -- MATCHED|NEEDS_REVIEW|UNMATCHED
  match_confidence text default 'low',     -- high|medium|low
  quality_flags text[] not null default '{}', -- e.g. {gpa_out_of_range,dup_row,scale_ambiguous}

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- one row per reported chapter per report (idempotent re-parse replaces by report)
  unique (source_report_id, chapter_name_as_reported)
);
create index if not exists idx_gca_campus on public.greek_chapter_academics(campus_id);
create index if not exists idx_gca_chapter on public.greek_chapter_academics(campus_greek_chapter_id);
create index if not exists idx_gca_semester on public.greek_chapter_academics(campus_id, semester_key);
create index if not exists idx_gca_match on public.greek_chapter_academics(match_status);

-- ── 3. Per-campus run/status (mirrors campus_council_status) ───────────────────
create table if not exists public.greek_academic_campus_status (
  campus_id     uuid primary key references public.campuses(id) on delete cascade,
  campus_name   text,
  state         text,

  -- not_run|running|complete|no_public_data|needs_review|failed|stale
  status        text not null default 'not_run'
    check (status in ('not_run','running','complete','no_public_data','needs_review','failed','stale')),

  last_attempted_at timestamptz,
  last_success_at   timestamptz,

  reports_found     int not null default 0,
  semesters_found   int not null default 0,
  chapters_matched  int not null default 0,
  chapters_unmatched int not null default 0,
  member_records    int not null default 0,
  business_records  int not null default 0,

  latest_report_term text,
  latest_report_year int,
  archive_url        text,   -- discovered FSL archive page (crawl once, follow links)

  serp_searches   int not null default 0,
  firecrawl_fetches int not null default 0,
  ai_parses       int not null default 0,
  est_cost_usd    numeric not null default 0,

  highest_source_confidence text,
  last_error      text,
  recommended_next_action text,

  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_gacs_status on public.greek_academic_campus_status(status);

-- ── 4. Run log (mirrors growth_discovery_runs) ────────────────────────────────
create table if not exists public.greek_academic_runs (
  id            uuid primary key default gen_random_uuid(),
  run_kind      text,        -- preflight|nationwide|single|rescore
  status        text not null default 'running', -- running|complete|failed|aborted
  dry_run       boolean not null default true,
  campuses_total int,
  campuses_done  int not null default 0,
  serp_calls    int not null default 0,
  firecrawl_calls int not null default 0,
  ai_calls      int not null default 0,
  est_cost_usd  numeric not null default 0,
  budget_usd    numeric,
  reports_found int not null default 0,
  chapters_written int not null default 0,
  notes         text,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- ── 5. Derived per-chapter metrics (spec §11/12/24) — versioned, recomputable ──
create table if not exists public.greek_chapter_academic_metrics (
  campus_greek_chapter_id uuid primary key references public.campus_greek_chapters(id) on delete cascade,
  campus_id     uuid,
  council_normalized text,

  latest_gpa    numeric,
  latest_term   text,
  latest_year   int,
  latest_semester_key text,

  council_average_gpa numeric,
  difference_from_council numeric,
  all_greek_difference numeric,
  gender_population_difference numeric,

  council_rank  int,
  council_size  int,
  council_percentile numeric,

  change_1_term numeric,
  change_3_term numeric,
  trend_5_term  numeric,
  trend_label   text,          -- improving|declining|stable|insufficient_data

  latest_member_count int,
  average_member_count_recent numeric,
  member_count_trend numeric,

  academic_need_score int,      -- INTERNAL 0-100; never exposed to students
  score_version text,
  need_drivers  jsonb,          -- human-readable driver list
  calculated_at timestamptz,

  semesters_available int not null default 0,
  data_confidence text,
  source_url    text,
  updated_at    timestamptz not null default now()
);
create index if not exists idx_gcam_campus on public.greek_chapter_academic_metrics(campus_id);
create index if not exists idx_gcam_need on public.greek_chapter_academic_metrics(academic_need_score);

-- ── 6. Dashboard-ready campus summary VIEW (read-only; never mutates scores) ───
create or replace view public.greek_academic_campus_summary_v as
select
  s.campus_id,
  s.campus_name,
  s.state,
  s.status                       as greek_academic_data_status,
  s.latest_report_term           as latest_greek_academic_term,
  s.latest_report_year           as latest_greek_academic_year,
  s.reports_found,
  s.semesters_found              as historical_terms_available,
  s.chapters_matched,
  s.chapters_unmatched,
  s.member_records               as greek_members_reported_rows,
  s.business_records,
  s.archive_url,
  s.recommended_next_action,
  s.last_error,
  agg.chapters_with_gpa_data,
  agg.ifc_chapters_with_data,
  agg.panhellenic_chapters_with_data,
  agg.ifc_average_gpa,
  agg.panhellenic_average_gpa,
  agg.greek_members_reported,
  agg.ifc_members_reported,
  agg.panhellenic_members_reported,
  agg.greek_business_students_count,
  need.high_need_ifc_chapters,
  need.high_need_panhellenic_chapters
from public.greek_academic_campus_status s
left join lateral (
  select
    count(*) filter (where a.chapter_gpa is not null)                                     as chapters_with_gpa_data,
    count(*) filter (where a.council_normalized = 'ifc' and a.chapter_gpa is not null)     as ifc_chapters_with_data,
    count(*) filter (where a.council_normalized = 'panhellenic' and a.chapter_gpa is not null) as panhellenic_chapters_with_data,
    round(avg(a.chapter_gpa) filter (where a.council_normalized = 'ifc'), 3)               as ifc_average_gpa,
    round(avg(a.chapter_gpa) filter (where a.council_normalized = 'panhellenic'), 3)       as panhellenic_average_gpa,
    sum(a.member_count)                                                                    as greek_members_reported,
    sum(a.member_count) filter (where a.council_normalized = 'ifc')                        as ifc_members_reported,
    sum(a.member_count) filter (where a.council_normalized = 'panhellenic')                as panhellenic_members_reported,
    sum(a.business_students_count)                                                         as greek_business_students_count
  from public.greek_chapter_academics a
  join public.greek_academic_reports r on r.id = a.source_report_id and r.is_current
  where a.campus_id = s.campus_id
) agg on true
left join lateral (
  select
    count(*) filter (where m.council_normalized = 'ifc' and m.academic_need_score >= 70)         as high_need_ifc_chapters,
    count(*) filter (where m.council_normalized = 'panhellenic' and m.academic_need_score >= 70) as high_need_panhellenic_chapters
  from public.greek_chapter_academic_metrics m
  where m.campus_id = s.campus_id
) need on true;

-- ── 7. RLS: deny-by-default, service-role only (no anon/authenticated policies) ─
alter table public.greek_academic_reports          enable row level security;
alter table public.greek_chapter_academics         enable row level security;
alter table public.greek_academic_campus_status    enable row level security;
alter table public.greek_academic_runs             enable row level security;
alter table public.greek_chapter_academic_metrics  enable row level security;

-- ── Proof (spec/README rule: end with a select that proves it worked) ──────────
select
  (select count(*) from information_schema.tables
     where table_schema='public'
       and table_name in ('greek_academic_reports','greek_chapter_academics',
         'greek_academic_campus_status','greek_academic_runs','greek_chapter_academic_metrics')) as tables_created,
  (select count(*) from information_schema.views
     where table_schema='public' and table_name='greek_academic_campus_summary_v') as views_created,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='greek_chapter_academics') as gca_columns;

commit;
