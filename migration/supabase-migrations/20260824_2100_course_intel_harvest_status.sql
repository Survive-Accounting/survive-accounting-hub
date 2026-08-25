-- Course Intel nationwide harvest — research-status + professor-evidence tables.
-- Additive only. Does NOT touch course_document / course_evidence / campuses / student maps.
-- Applied via run_sql.ts (Management API). RLS deny-by-default; service-role bypasses RLS.

-- ── 1. Per-campus research status (also the dashboard aggregate) ──────────────
create table if not exists public.course_intel_campus_status (
  campus_id             uuid primary key references public.campuses(id) on delete cascade,
  campus_name           text,
  state                 text,
  course_code           text,
  -- status vocab: NOT_RUN | RUNNING | COMPLETE | NO_RESULT | NEEDS_REVIEW | FAILED | STALE
  status                text not null default 'NOT_RUN',
  pass_a_status         text not null default 'NOT_RUN',
  pass_b_status         text not null default 'NOT_RUN',
  started_at            timestamptz,
  finished_at           timestamptz,
  -- API usage
  serp_searches         int  not null default 0,
  firecrawl_fetches     int  not null default 0,
  ai_parses             int  not null default 0,
  est_cost_usd          numeric(10,4) not null default 0,
  -- document tallies
  documents_found       int  not null default 0,
  high_value_documents  int  not null default 0,   -- tier 1
  syllabi_found         int  not null default 0,
  study_guides_found    int  not null default 0,
  review_docs_found     int  not null default 0,
  schedules_found       int  not null default 0,
  textbook_docs_found   int  not null default 0,
  -- professor tallies
  professor_candidates       int not null default 0,
  confirmed_intro1_professors int not null default 0,
  -- quality
  highest_source_confidence text,                  -- High | Medium | Low
  restricted_docs_seen      int not null default 0,
  -- ops
  last_error            text,
  retry_count           int  not null default 0,
  recommended_next_action text,
  updated_at            timestamptz not null default now()
);
create index if not exists idx_cics_status on public.course_intel_campus_status(status);
create index if not exists idx_cics_state  on public.course_intel_campus_status(state);
alter table public.course_intel_campus_status enable row level security;

-- ── 2. Document-derived professor Intro-1 evidence (the non-RMP path) ─────────
create table if not exists public.professor_intro1_evidence (
  id                 uuid primary key default gen_random_uuid(),
  campus_id          uuid not null references public.campuses(id) on delete cascade,
  professor_name     text not null,
  lead_suggestion_id uuid references public.campus_lead_suggestions(id) on delete set null,
  course_code        text,
  -- ACCOUNTING_PROFESSOR | POSSIBLE_INTRO1 | LIKELY_INTRO1 | CONFIRMED_INTRO1
  evidence_state     text not null default 'POSSIBLE_INTRO1',
  source_document_id uuid references public.course_document(id) on delete set null,
  source_url         text,
  source_domain      text,
  source_quality     text,          -- HIGH | MEDIUM | LOW
  term               text,
  year               int,
  raw_text           text,          -- short bibliographic/structural snippet only (never prose)
  confidence         text not null default 'Medium',   -- High | Medium | Low
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (campus_id, professor_name, evidence_state, source_url)
);
create index if not exists idx_pie_campus on public.professor_intro1_evidence(campus_id);
create index if not exists idx_pie_state  on public.professor_intro1_evidence(evidence_state);
alter table public.professor_intro1_evidence enable row level security;
