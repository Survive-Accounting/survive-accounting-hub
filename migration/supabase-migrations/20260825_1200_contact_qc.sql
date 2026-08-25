-- Growth Contact Intelligence — V1 Contact Quality + King QC layer.
--
-- Adds: (1) normalized shared-ADVISOR identity so one advisor relates to many
-- chapters/councils instead of N duplicate contacts; (2) a polymorphic QC/eligibility
-- state table that carries freshness + outreach-eligibility + King's review action
-- across ALL contact sources WITHOUT modifying Campus Backfill's campus_council_contacts
-- (read-only); (3) a friendly view exposing the reusable outreach-eligibility shape.
--
-- Discovery-agnostic: nothing here scrapes or sends. RLS deny-by-default (service role).
begin;

-- 1. Normalized advisor identity (one per distinct advisor, keyed on email).
create table if not exists public.growth_advisors (
  id uuid primary key default gen_random_uuid(),
  name text null,
  email text null,
  phone text null,
  title text null,                         -- "Assistant Director of Fraternity & Sorority Life"
  primary_campus_id uuid null references public.campuses(id) on delete set null,
  source_url text null,
  source_type text null,
  confidence text not null default 'high', -- office/role advisor addresses are stable/high
  chapters_linked int not null default 0,
  councils_linked int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists growth_advisors_email_uidx on public.growth_advisors (lower(email)) where email is not null;
alter table public.growth_advisors enable row level security;

-- 2. Advisor -> entity links (M:N; the "one advisor, many chapters/councils" relationship).
create table if not exists public.growth_advisor_links (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references public.growth_advisors(id) on delete cascade,
  entity_type text not null,               -- chapter | council | campus | org
  entity_id uuid null,                     -- campus_greek_chapters.id (chapter) / null for council
  campus_id uuid null,
  council_type text null,                  -- set when entity_type = council
  source_contact_source text null,         -- campus_council_contacts | growth_public_contacts
  source_contact_id uuid null,
  source_url text null,
  created_at timestamptz not null default now(),
  constraint gal_entity_ck check (entity_type in ('chapter','council','campus','org'))
);
create index if not exists gal_advisor_idx on public.growth_advisor_links (advisor_id);
create index if not exists gal_entity_idx on public.growth_advisor_links (entity_type, entity_id);
create unique index if not exists gal_uidx on public.growth_advisor_links
  (advisor_id, entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(council_type,''), coalesce(campus_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.growth_advisor_links enable row level security;

-- 3. Polymorphic QC + eligibility state (across every contact source; Backfill stays untouched).
create table if not exists public.growth_contact_qc (
  id uuid primary key default gen_random_uuid(),
  contact_source text not null,            -- growth_public_contacts | campus_council_contacts | growth_advisors | growth_business_clubs
  source_id uuid not null,
  campus_id uuid null,
  entity_type text null,                   -- chapter | council | club | advisor | campus
  entity_id uuid null,
  council_type text null,
  campaign_purpose text null,              -- STUDENT_DISTRIBUTION | CHAPTER_SALES | CAMPUS_REP_RECRUITMENT | ADVISORY_ESCALATION | UNKNOWN
  contact_type text null,                  -- role_inbox | student_officer | chapter_exec | staff_advisor | organization_general | social_account | unknown
  name text null,
  role text null,
  email text null,
  instagram text null,
  source_url text null,
  source_type text null,
  confidence text null,                    -- high | medium | low
  last_verified_at timestamptz null,
  effective_term text null,
  effective_year int null,
  freshness_status text not null default 'unknown', -- stable | current | verify_before_use | likely_stale | unknown
  outreach_eligible boolean not null default false,
  review_reason text null,                 -- why NEEDS_REVIEW / not eligible
  qc_action text not null default 'pending', -- pending | approve | edit | wrong_data | reject | skip
  qc_by text null,
  qc_at timestamptz null,
  qc_edits jsonb null,                     -- King's field edits {field: newValue}
  qc_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gcq_source_ck check (contact_source in ('growth_public_contacts','campus_council_contacts','growth_advisors','growth_business_clubs')),
  constraint gcq_action_ck check (qc_action in ('pending','approve','edit','wrong_data','reject','skip')),
  constraint gcq_fresh_ck  check (freshness_status in ('stable','current','verify_before_use','likely_stale','unknown'))
);
create unique index if not exists gcq_source_uidx on public.growth_contact_qc (contact_source, source_id);
create index if not exists gcq_campus_idx on public.growth_contact_qc (campus_id);
create index if not exists gcq_purpose_idx on public.growth_contact_qc (campaign_purpose);
create index if not exists gcq_action_idx on public.growth_contact_qc (qc_action);
create index if not exists gcq_eligible_idx on public.growth_contact_qc (outreach_eligible);
create index if not exists gcq_fresh_idx on public.growth_contact_qc (freshness_status);
alter table public.growth_contact_qc enable row level security;

-- 4. Reusable outreach-eligibility / QC shape (the §6 contract, as a view over the QC state).
create or replace view public.growth_outreach_eligibility as
select
  q.id                          as qc_id,
  q.contact_source,
  q.source_id                   as contact_id,
  q.campus_id,
  case when q.entity_type = 'chapter' then q.entity_id end as chapter_id,
  case when q.entity_type = 'council' then null::uuid end  as council_id, -- councils are keyed by (campus_id, council_type)
  q.council_type,
  case when q.entity_type = 'club' then q.entity_id end    as org_id,
  q.campaign_purpose,
  q.contact_type,
  q.name,
  q.role,
  q.email,
  q.instagram,
  q.source_url                  as source,
  q.source_type,
  q.confidence,
  q.last_verified_at            as last_verified,
  q.effective_term,
  q.effective_year,
  q.freshness_status,
  q.outreach_eligible,
  q.review_reason,
  q.qc_action
from public.growth_contact_qc q;

commit;
