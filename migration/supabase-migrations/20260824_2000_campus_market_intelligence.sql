-- Campus Market Intelligence persistence layer.
-- Independent, standardized market layer built on public IPEDS data + live Greek/council data.
-- Idempotent. NOT YET APPLIED (needs a valid Management-API PAT or the dashboard SQL editor).
-- Deny-by-default RLS: only the service role (admin cockpit server fns) reads these; no anon/auth policy.

-- ---------------------------------------------------------------------------
-- 1. Scoring-run snapshots (versioning: tune weights later without losing history)
-- ---------------------------------------------------------------------------
create table if not exists public.market_intel_runs (
  id uuid primary key default gen_random_uuid(),
  config_version text not null,
  generated_at timestamptz not null default now(),
  latest_data_year int,
  intro1_multiplier numeric,
  universe_matched int,
  four_year_count int,
  review_count int,
  total_business_completions int,
  estimated_intro1_annual int,
  config_json jsonb,          -- full scoring-config snapshot for reproducibility
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Per-campus scored intelligence (latest row per campus; history via run_id)
-- ---------------------------------------------------------------------------
create table if not exists public.campus_market_intelligence (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  run_id uuid references public.market_intel_runs(id) on delete set null,
  config_version text not null,
  generated_at timestamptz not null default now(),

  -- identity
  ipeds_unitid text,
  ipeds_name text,
  institution_level text,          -- four_year | two_year | other
  segment text,                    -- primary | two_year | other
  match_method text,
  match_confidence numeric,
  duplicate_unitid boolean default false,

  -- raw IPEDS metrics (values kept visible, never hidden behind scores)
  latest_data_year int,
  undergrad_enrollment int,
  business_bachelors int,
  accounting_bachelors int,
  total_bachelors int,
  business_share_of_bachelors numeric,
  accounting_share_of_business numeric,
  estimated_intro1_annual int,
  intro1_estimate_method text,
  intro1_estimate_confidence text,

  -- growth (raw + label)
  business_growth_1y numeric,
  business_growth_3y numeric,
  business_growth_5y numeric,
  business_5y_cagr numeric,
  business_share_change_3y numeric,
  business_share_change_5y numeric,
  undergrad_growth_5y numeric,
  accounting_growth_5y numeric,
  growth_status text,              -- OK | INSUFFICIENT_DATA
  growth_label text,              -- RAPID_GROWTH | GROWING | STABLE | DECLINING | INSUFFICIENT_DATA
  meaningful_market boolean,
  new_program boolean,
  business_series jsonb,           -- {year: business_bachelors}

  -- distribution inputs (availability distinguished: NOT_RUN vs known)
  greek_chapters int,              -- null = NOT_RUN
  greek_available boolean,
  councils_present text[],
  council_contacts_councils int,
  role_inbox_councils int,
  council_available boolean,
  has_women_in_business boolean,
  has_finance_club boolean,
  club_available boolean,

  -- scores (0-100)
  market_opportunity_score numeric,
  market_data_completeness numeric,
  growth_momentum_score numeric,
  distribution_strength_score numeric,
  distribution_data_completeness numeric,
  course_readiness_status text default 'COMING_SOON',
  course_readiness_score numeric,           -- null in v1
  live_demand_status text default 'COMING_SOON',
  live_demand_score numeric,                -- null in v1
  first_party_signal_count int default 0,
  outreach_priority_score numeric,
  outreach_priority_version text,
  enrichment_priority_score numeric,
  structural_completeness numeric,

  -- action layer (separate from market score)
  action_suppressed boolean default false,
  action_suppress_reason text,
  current_action_priority numeric,
  recommended_next_action text,

  -- explainability + full record
  top_drivers jsonb,               -- ["1,224 business grads/year", ...]
  score_components jsonb,          -- {market_opportunity_parts, growth_momentum_parts, ...}
  raw_json jsonb,

  updated_at timestamptz not null default now()
);

create index if not exists cmi_outreach_priority_idx on public.campus_market_intelligence (outreach_priority_score desc nulls last);
create index if not exists cmi_market_opportunity_idx on public.campus_market_intelligence (market_opportunity_score desc nulls last);
create index if not exists cmi_growth_momentum_idx on public.campus_market_intelligence (growth_momentum_score desc nulls last);
create index if not exists cmi_enrichment_idx on public.campus_market_intelligence (enrichment_priority_score desc nulls last);
create index if not exists cmi_segment_idx on public.campus_market_intelligence (segment);
create index if not exists cmi_run_idx on public.campus_market_intelligence (run_id);

-- ---------------------------------------------------------------------------
-- 3. Identity review queue (unresolved IPEDS matches + duplicate-unitid data-quality)
-- ---------------------------------------------------------------------------
create table if not exists public.market_intel_identity_review (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  campus_name text,
  state text,
  city text,
  status text,                     -- NEEDS_IDENTITY_REVIEW | DUPLICATE_UNITID
  review_reason text,
  best_ipeds_suggestion text,
  resolved boolean default false,
  resolved_unitid text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Dashboard-ready card view (one clean shape per campus for the Growth dashboard)
-- ---------------------------------------------------------------------------
create or replace view public.campus_market_intelligence_card as
select
  c.id                         as campus_id,
  coalesce(c.display_name, c.name) as campus,
  c.state,
  m.ipeds_unitid,
  m.segment,
  m.outreach_priority_score,
  m.market_opportunity_score,
  m.growth_momentum_score,
  m.growth_label,
  m.distribution_strength_score,
  m.distribution_data_completeness,
  m.course_readiness_status,
  m.course_readiness_score,
  m.live_demand_status,
  m.estimated_intro1_annual,
  m.business_bachelors,
  m.business_growth_5y,
  m.greek_chapters,
  m.councils_present,
  m.enrichment_priority_score,
  m.recommended_next_action,
  m.action_suppressed,
  m.top_drivers,
  m.market_data_completeness,
  m.generated_at
from public.campus_market_intelligence m
join public.campuses c on c.id = m.campus_id;

-- ---------------------------------------------------------------------------
-- 5. RLS: deny-by-default (service role bypasses; admin cockpit reads via server fns)
-- ---------------------------------------------------------------------------
alter table public.market_intel_runs enable row level security;
alter table public.campus_market_intelligence enable row level security;
alter table public.market_intel_identity_review enable row level security;
-- (no anon/authenticated policies created -> access only via service role)
