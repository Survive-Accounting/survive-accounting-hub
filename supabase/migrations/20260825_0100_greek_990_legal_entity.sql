-- Greek 990 / Legal-Entity Intelligence — additive schema (SEC pilot).
--
-- Adds a normalized nonprofit legal-entity graph around the CANONICAL chapter
-- roster (campus_greek_chapters). Does NOT alter the existing greek_org_* tables
-- or the manual enrichment UI. Reuses greek_org_propublica_cache (unchanged).
--
-- Core principle (brief §4/§5): one chapter has MANY legal entities (undergrad,
-- house corp, foundation, national parent) — so entities live in their own table
-- and connect to chapters through a many-to-many link with typed relationships,
-- match confidence, and provenance. EIN is NEVER stored bare on the chapter.
--
-- RLS: enabled with NO policies → deny-by-default. All access is server-side via
-- the service role (which bypasses RLS). Public/anon cannot read or write.

-- ── 1. Canonical legal entity (one row per EIN) ──────────────────────────────
create table if not exists public.greek_legal_entity (
  id                    uuid primary key default gen_random_uuid(),
  ein                   text not null unique,               -- 9 digits, no dash
  legal_name            text not null,
  sort_name             text,
  alternate_names       jsonb not null default '[]'::jsonb,
  city                  text,
  state                 text,
  zip                   text,
  -- What KIND of entity this is (brief §4/§5). Never assume LOCAL_CHAPTER.
  entity_type           text not null default 'UNKNOWN',
    -- LOCAL_CHAPTER_ENTITY | HOUSE_CORPORATION | ALUMNI_CORPORATION
    -- | EDUCATIONAL_FOUNDATION | SCHOLARSHIP_FOUNDATION | PROPERTY_HOLDING_ENTITY
    -- | NATIONAL_PARENT | OTHER_RELATED | UNKNOWN
  entity_type_confidence text,                              -- HIGH | MEDIUM | LOW
  entity_type_evidence  text,
  -- IRS EO BMF identity fields
  irs_subsection        text,                               -- e.g. '07' (501c7), '03' (501c3)
  ntee_code             text,
  classification        text,
  affiliation_code      text,                               -- 3=indep, 6=central/parent, 9=subordinate
  group_exemption_number text,                              -- GEN
  parent_ein            text,
  deductibility_code    text,
  tax_exempt_status     text,
  ruling_date           text,
  filing_requirement    text,
  asset_amt             bigint,
  income_amt            bigint,
  revenue_amt           bigint,
  -- Cross-links (canonical, read-only elsewhere)
  national_greek_org_id uuid references public.greek_orgs(id) on delete set null,
  -- Provenance (brief §22)
  source                text not null,                      -- IRS_EO_BMF | PROPUBLICA_API | EXISTING_SURVIVE_DATA | OTHER_OFFICIAL
  source_reference      text,
  bmf_raw               jsonb,
  first_seen_at         timestamptz not null default now(),
  last_checked_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists greek_legal_entity_state_idx on public.greek_legal_entity (state);
create index if not exists greek_legal_entity_gen_idx on public.greek_legal_entity (group_exemption_number);
create index if not exists greek_legal_entity_natorg_idx on public.greek_legal_entity (national_greek_org_id);
create index if not exists greek_legal_entity_type_idx on public.greek_legal_entity (entity_type);

-- ── 2. Chapter ↔ legal entity (many-to-many, typed, scored, sourced) ─────────
create table if not exists public.greek_chapter_legal_entity (
  id                uuid primary key default gen_random_uuid(),
  chapter_id        uuid not null references public.campus_greek_chapters(id) on delete cascade,
  legal_entity_id   uuid not null references public.greek_legal_entity(id) on delete cascade,
  relationship_type text not null default 'UNKNOWN',        -- same vocabulary as entity_type
  match_confidence  text not null,                          -- HIGH_CONFIDENCE | MEDIUM_CONFIDENCE | LOW_CONFIDENCE | REJECTED
  match_score       numeric,
  match_method      text,                                   -- BMF_NAME_GEO | GROUP_EXEMPTION | PROPUBLICA_SEARCH | EXISTING_DATA | MANUAL
  match_evidence    jsonb not null default '{}'::jsonb,     -- {name, location, group_exemption, designation}
  verified_status   text not null default 'UNVERIFIED',     -- UNVERIFIED | CONFIRMED | REJECTED | NEEDS_REVIEW
  verified_by       text,
  verified_at       timestamptz,
  source_url        text,
  source_reference  text,
  first_seen_at     timestamptz not null default now(),
  last_verified_at  timestamptz,
  unique (chapter_id, legal_entity_id)
);
create index if not exists greek_chapter_legal_entity_chapter_idx on public.greek_chapter_legal_entity (chapter_id);
create index if not exists greek_chapter_legal_entity_entity_idx on public.greek_chapter_legal_entity (legal_entity_id);
create index if not exists greek_chapter_legal_entity_conf_idx on public.greek_chapter_legal_entity (match_confidence);

-- ── 3. Form 990 filings (keyed by legal entity) ──────────────────────────────
create table if not exists public.greek_990_filing (
  id                     uuid primary key default gen_random_uuid(),
  legal_entity_id        uuid not null references public.greek_legal_entity(id) on delete cascade,
  ein                    text not null,
  tax_year               integer not null,
  form_type              text,                              -- 990 | 990EZ | 990N | 990PF | UNKNOWN
  rich_filing_available  boolean not null default false,    -- false for 990-N e-postcards
  object_id              text,                              -- IRS efile object id (for /full render + XML)
  pdf_url                text,
  gross_receipts         numeric,
  total_revenue          numeric,
  total_expenses         numeric,
  total_assets           numeric,
  total_liabilities      numeric,
  net_assets             numeric,
  contributions          numeric,
  program_service_revenue numeric,
  investment_income      numeric,
  source                 text not null,                     -- PROPUBLICA_API | IRS_990_XML
  source_reference       text,
  retrieved_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (legal_entity_id, tax_year, form_type)
);
create index if not exists greek_990_filing_entity_idx on public.greek_990_filing (legal_entity_id);
create index if not exists greek_990_filing_ein_idx on public.greek_990_filing (ein);

-- ── 4. Officers / directors (historical, keyed by legal entity) ──────────────
create table if not exists public.greek_990_officer (
  id                    uuid primary key default gen_random_uuid(),
  legal_entity_id       uuid not null references public.greek_legal_entity(id) on delete cascade,
  ein                   text not null,
  person_name           text not null,                      -- as reported
  person_name_normalized text not null,
  title_as_reported     text,
  normalized_title      text,
  is_officer            boolean not null default false,
  is_director           boolean not null default false,
  is_key_employee       boolean not null default false,
  is_principal_officer  boolean not null default false,
  stakeholder_class     text,   -- UNDERGRAD_CHAPTER_LEADERSHIP | HOUSE_CORPORATION_LEADERSHIP
                                 -- | FOUNDATION_LEADERSHIP | ALUMNI_BOARD | NATIONAL_ORG_LEADERSHIP | UNKNOWN
  hours_per_week        numeric,
  compensation          numeric,
  years                 integer[] not null default '{}',    -- tax years this person appears in
  first_seen_year       integer,
  last_seen_year        integer,
  latest_filing_year    integer,                            -- LATEST_990_REPORTED, never "current"
  source                text not null,                      -- IRS_990_XML | PROPUBLICA_OFFICERS
  source_reference      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (legal_entity_id, person_name_normalized, normalized_title)
);
create index if not exists greek_990_officer_entity_idx on public.greek_990_officer (legal_entity_id);

-- ── 5. Candidate entities (backs the human review queue, brief §24) ──────────
create table if not exists public.greek_990_entity_candidate (
  id                        uuid primary key default gen_random_uuid(),
  chapter_id                uuid not null references public.campus_greek_chapters(id) on delete cascade,
  candidate_ein             text not null,
  candidate_legal_name      text,
  candidate_city            text,
  candidate_state           text,
  candidate_entity_type     text,
  match_score               numeric,
  match_confidence          text,
  name_evidence             text,
  location_evidence         text,
  group_exemption_evidence  text,
  designation_evidence      text,
  recommended_action        text,                           -- AUTO_LINK | REVIEW | SKIP
  status                    text not null default 'NEW',    -- NEW | CONFIRMED | REJECTED | LINKED
  source                    text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (chapter_id, candidate_ein)
);
create index if not exists greek_990_entity_candidate_chapter_idx on public.greek_990_entity_candidate (chapter_id);
create index if not exists greek_990_entity_candidate_status_idx on public.greek_990_entity_candidate (status);

-- ── 6. Per-chapter research status (resumable pipeline, brief §23) ───────────
create table if not exists public.greek_chapter_990_status (
  chapter_id       uuid primary key references public.campus_greek_chapters(id) on delete cascade,
  campus_id        uuid,
  status           text not null default 'NOT_RUN',
    -- NOT_RUN | RUNNING | NO_ENTITY_FOUND | CANDIDATES_FOUND | NEEDS_REVIEW
    -- | ENTITY_MATCHED | FILINGS_FOUND | NO_RICH_FILING | COMPLETE | FAILED | STALE
  candidates_found integer not null default 0,
  entities_linked  integer not null default 0,
  filings_found    integer not null default 0,
  officers_found   integer not null default 0,
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  error            text,
  run_meta         jsonb,
  updated_at       timestamptz not null default now()
);
create index if not exists greek_chapter_990_status_status_idx on public.greek_chapter_990_status (status);

-- ── RLS: deny-by-default (server-only via service role) ──────────────────────
alter table public.greek_legal_entity          enable row level security;
alter table public.greek_chapter_legal_entity  enable row level security;
alter table public.greek_990_filing            enable row level security;
alter table public.greek_990_officer           enable row level security;
alter table public.greek_990_entity_candidate  enable row level security;
alter table public.greek_chapter_990_status    enable row level security;
