-- Growth Contact Intelligence — public outreach contacts that change by semester.
--
-- SEPARATE BUT CONNECTED to Campus Backfill. Campus Backfill (20260824_1200)
-- owns COUNCIL contacts (campus_council_contacts / campus_council_status) and the
-- campuses.greek_eligibility gate — this migration NEVER writes those tables; it
-- only reads them so the outreach layer can surface councils alongside chapters
-- and clubs. This migration adds the two NEW discovery surfaces Campus Backfill
-- does not cover:
--   (1) individual Greek CHAPTER contacts (IG / site / general email + exec roles)
--   (2) BUSINESS CLUBS for campus-rep recruitment (Women-in-Business, Investment/Finance)
-- plus a shared provenance/evidence store, a per-(campus,category) discovery-status
-- lifecycle, and a run log with cost. Reuses campuses.id + campus_greek_chapters.id
-- for identity and the existing growth_outreach_events touch-log for outreach.
--
-- Discovery only. NOTHING here sends email / DM / text. RLS deny-by-default
-- (service-role only), mirroring campus_council_contacts + growth_contacts.
begin;

-- ---------------------------------------------------------------------------
-- 1. Business clubs — the org entity for campus-rep recruitment (V1: two cats).
--    Greek chapters already have a home (campus_greek_chapters); clubs do not.
-- ---------------------------------------------------------------------------
create table if not exists public.growth_business_clubs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  category text not null,                       -- women_in_business | investment_finance
  name text not null,
  normalized_name text not null,                -- lower, punctuation-stripped, for dedupe
  website_url text null,
  instagram_url text null,
  facebook_url text null,
  general_email text null,
  is_active boolean not null default true,
  -- provenance / freshness
  source_url text not null,
  source_type text not null default 'unknown',  -- university_org_directory | business_school_page | university_hosted_org | official_org_site | indexed_social | serp | other
  confidence text not null default 'medium',    -- high | medium | low
  effective_term text null,                     -- "Fall 2026" when published
  effective_year int null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  retrieved_at timestamptz not null default now(),
  last_verified_at timestamptz null,
  discovery_run_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_business_clubs_category_ck
    check (category in ('women_in_business','investment_finance'))
);
create index if not exists gbc_campus_idx on public.growth_business_clubs (campus_id);
create index if not exists gbc_campus_cat_idx on public.growth_business_clubs (campus_id, category);
-- One org per (campus, category, normalized identity): the same club seen on
-- another page gains evidence, not a duplicate row.
create unique index if not exists gbc_identity_uidx
  on public.growth_business_clubs (campus_id, category, normalized_name);
alter table public.growth_business_clubs enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Public contacts — polymorphic outreach contact-point for CHAPTERS + CLUBS.
--    Column shape is intentionally UNION-compatible with campus_council_contacts
--    so a single read layer can present council + chapter + club together.
--    entity_type='chapter' -> entity_id = campus_greek_chapters.id
--    entity_type='club'    -> entity_id = growth_business_clubs.id
--    (councils are NOT stored here — they live in campus_council_contacts.)
-- ---------------------------------------------------------------------------
create table if not exists public.growth_public_contacts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,  -- denormalized for filtering
  entity_type text not null,                    -- chapter | club
  entity_id uuid not null,                      -- soft ref (no FK: entity_type decides the table)
  category text not null,                       -- chapter | women_in_business | investment_finance
  contact_type text not null default 'unknown', -- role_inbox | student_officer | staff_advisor | organization_general | social_account | unknown
  name text null,
  role text null,                               -- President, VP Academics, Scholarship Chair, Academic Chair, Advisor, ...
  email text null,
  phone text null,
  instagram_url text null,
  website_url text null,
  facebook_url text null,
  -- temporal (officers rotate; role inboxes / socials persist)
  is_current boolean null,                      -- null = unknown
  effective_term text null,                     -- "Fall 2026"
  effective_year int null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- provenance
  source_url text not null,
  source_type text not null default 'unknown',
  confidence text not null default 'medium',    -- high | medium | low
  retrieved_at timestamptz not null default now(),
  last_verified_at timestamptz null,
  superseded_by uuid null references public.growth_public_contacts(id) on delete set null,
  discovery_run_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_public_contacts_entity_ck  check (entity_type in ('chapter','club')),
  constraint growth_public_contacts_ctype_ck
    check (contact_type in ('role_inbox','student_officer','staff_advisor','organization_general','social_account','unknown'))
);
create index if not exists gpc_campus_idx on public.growth_public_contacts (campus_id);
create index if not exists gpc_entity_idx on public.growth_public_contacts (entity_type, entity_id);
create index if not exists gpc_campus_cat_idx on public.growth_public_contacts (campus_id, category);
-- Email identity: same email re-seen for the same entity = more evidence, not a
-- new row. NULL-email rows (named officers w/o email, social accounts) may repeat
-- and are deduped in app logic by (name) / (instagram handle).
create unique index if not exists gpc_email_uidx
  on public.growth_public_contacts (entity_type, entity_id, lower(email)) where email is not null;
-- One official social account per (entity, platform-url).
create unique index if not exists gpc_social_uidx
  on public.growth_public_contacts (entity_type, entity_id, lower(instagram_url))
  where instagram_url is not null and contact_type = 'social_account';
alter table public.growth_public_contacts enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Evidence — every public source a contact/club value was seen on. This is
--    what makes dedupe safe: the SAME email on three official pages produces one
--    contact row + three evidence rows (not three contacts).
-- ---------------------------------------------------------------------------
create table if not exists public.growth_contact_evidence (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid null references public.growth_public_contacts(id) on delete cascade,
  club_id uuid null references public.growth_business_clubs(id) on delete cascade,
  source_url text not null,
  source_type text not null default 'unknown',  -- same vocabulary as source_type above (§6 priority)
  matched_value text null,                       -- the exact email / handle / url found verbatim on the page
  matched_kind text null,                        -- email | instagram | website | facebook | phone | name
  snippet text null,                             -- short surrounding context (audit trail)
  confidence text not null default 'medium',
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint growth_contact_evidence_target_ck
    check ((contact_id is not null) or (club_id is not null))
);
create index if not exists gce_contact_idx on public.growth_contact_evidence (contact_id);
create index if not exists gce_club_idx on public.growth_contact_evidence (club_id);
create unique index if not exists gce_contact_src_uidx
  on public.growth_contact_evidence (contact_id, source_url, coalesce(matched_value,'')) where contact_id is not null;
create unique index if not exists gce_club_src_uidx
  on public.growth_contact_evidence (club_id, source_url, coalesce(matched_value,'')) where club_id is not null;
alter table public.growth_contact_evidence enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Discovery status — per (campus, category[, entity]) lifecycle. Tracks the
--    two new surfaces SEPARATELY (chapter / women_in_business / investment_finance).
--    NO_RESULT (ran, found nothing) is distinct from NOT_RUN (never attempted).
--    Council status is NOT duplicated here — read campus_council_status instead.
--    entity_id null = campus-level rollup for the category; entity_id set =
--    per-chapter granularity (chapters are discovered one at a time).
-- ---------------------------------------------------------------------------
create table if not exists public.growth_discovery_status (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  category text not null,                       -- chapter | women_in_business | investment_finance
  entity_id uuid null,                          -- campus_greek_chapters.id for per-chapter chapter runs
  status text not null default 'not_run',       -- not_run | running | complete | no_result | needs_review | failed | stale
  last_attempted_at timestamptz null,
  last_success_at timestamptz null,
  results_found int not null default 0,
  error text null,
  discovery_run_id uuid null,
  updated_at timestamptz not null default now(),
  constraint growth_discovery_status_cat_ck
    check (category in ('chapter','women_in_business','investment_finance')),
  constraint growth_discovery_status_status_ck
    check (status in ('not_run','running','complete','no_result','needs_review','failed','stale'))
);
create index if not exists gds_campus_idx on public.growth_discovery_status (campus_id);
-- Campus-level rollup rows (entity_id null) unique per (campus, category);
-- per-entity rows unique per (campus, category, entity).
create unique index if not exists gds_campus_cat_uidx
  on public.growth_discovery_status (campus_id, category) where entity_id is null;
create unique index if not exists gds_campus_cat_entity_uidx
  on public.growth_discovery_status (campus_id, category, entity_id) where entity_id is not null;
alter table public.growth_discovery_status enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Discovery runs — one row per batch execution; cost + progress for
--    resumability and spend accounting (SERP/Firecrawl/AI calls, est USD).
-- ---------------------------------------------------------------------------
create table if not exists public.growth_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null,                       -- chapter | women_in_business | investment_finance | mixed
  status text not null default 'running',       -- running | complete | failed | aborted
  dry_run boolean not null default true,
  campus_ids uuid[] null,
  campuses_total int not null default 0,
  campuses_done int not null default 0,
  serp_calls int not null default 0,
  firecrawl_calls int not null default 0,
  ai_calls int not null default 0,
  est_cost_usd numeric not null default 0,
  budget_usd numeric null,
  notes text null,
  error text null,
  created_by text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);
create index if not exists gdr_started_idx on public.growth_discovery_runs (started_at desc);
alter table public.growth_discovery_runs enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Outreach spine — reuse the existing append-only touch log. Widen its
--    entity_type CHECK so business-club touches can be logged later (channels
--    email / ig_dm / text / call already cover §14). Additive; council/chapter/
--    campus/org values are preserved. Guarded so re-runs are safe.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'growth_outreach_events'
  ) then
    alter table public.growth_outreach_events drop constraint if exists growth_outreach_events_entity_type_check;
    alter table public.growth_outreach_events
      add constraint growth_outreach_events_entity_type_check
      check (entity_type is null or entity_type in ('campus','chapter','council','org','club'));
  end if;
end $$;

commit;
