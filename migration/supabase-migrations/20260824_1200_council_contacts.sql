-- Campus Backfill — Greek council contact discovery + Greek eligibility gate.
-- No council-contact model existed (councils are free text on
-- campus_greek_chapters.council; greek_org_people is ORG-scoped; growth_contacts
-- is empty). So this adds a purpose-built, reusable council-contact entity with
-- provenance + history + role-inbox classification, plus a per-(campus,council)
-- run-status row (NOT_RUN vs NO_RESULT) and a campus-level Greek eligibility gate.
begin;

-- Council contacts: role inboxes, student officers, and staff advisors.
create table if not exists public.campus_council_contacts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  council_type text not null,                 -- ifc | panhellenic | nphc | mgc | other
  contact_type text not null default 'unknown', -- role_inbox | student_officer | staff_advisor | unknown
  name text null,
  role text null,                             -- e.g. President, VP Academics, Advisor
  email text null,
  phone text null,
  instagram_url text null,
  website_url text null,
  is_current boolean null,                    -- null = unknown
  effective_term text null,                   -- "Fall 2026" when known
  source_url text not null,
  source_type text not null default 'unknown', -- official_fsl | official_council | org_directory | council_site | other
  confidence text not null default 'medium',  -- high | medium | low
  retrieved_at timestamptz not null default now(),
  last_verified_at timestamptz null,
  superseded_by uuid null references public.campus_council_contacts(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now()
);
create index if not exists ccc_campus_idx on public.campus_council_contacts (campus_id);
create index if not exists ccc_campus_council_idx on public.campus_council_contacts (campus_id, council_type);
-- One row per (campus, council, email): the same email seen again gains provenance,
-- not a duplicate row. Role inboxes (email present) are deduped; NULL-email officer
-- rows are allowed to repeat (distinct people) and deduped in app logic by name.
create unique index if not exists ccc_email_uidx
  on public.campus_council_contacts (campus_id, council_type, lower(email)) where email is not null;
alter table public.campus_council_contacts enable row level security;

-- Per (campus, council_type) search status — distinguishes NOT_RUN from NO_RESULT.
create table if not exists public.campus_council_status (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  council_type text not null,
  status text not null default 'not_run',     -- not_run|running|complete|no_result|needs_review|failed|stale
  last_attempted_at timestamptz null,
  last_success_at timestamptz null,
  contacts_found int not null default 0,
  role_inbox_found boolean not null default false,
  error text null,
  updated_at timestamptz not null default now(),
  unique (campus_id, council_type)
);
alter table public.campus_council_status enable row level security;

-- Greek eligibility gate (campus level).
alter table public.campuses add column if not exists greek_eligibility text null;      -- unknown|eligible|no_social_greek|ambiguous
alter table public.campuses add column if not exists greek_eligibility_checked_at timestamptz null;

commit;
