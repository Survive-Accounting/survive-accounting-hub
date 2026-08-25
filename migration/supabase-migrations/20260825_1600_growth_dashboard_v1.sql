-- GROWTH DASHBOARD V1 (2026-08-25). All additive; idempotent; nothing existing modified
-- except new nullable columns on growth_outreach_events. Apply via Management API.
begin;

-- 1) Competitive intelligence — one canonical row per campus, imported once from the
--    frozen COMPETITIVE_CAMPUS_AGGREGATES.json (dataset frozen for V1).
--    Competitor presence is POSITIVE market validation and must never rank a campus down.
create table if not exists public.campus_competitive_intel (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  paid_market_status text,                  -- STRONG | MODERATE | WEAK | UNKNOWN
  intro_accounting_paid_market_status text, -- STRONG | MODERATE | WEAK | UNKNOWN
  competition_intensity text,               -- NONE | LOW | MEDIUM | HIGH
  market_status text,                       -- VALIDATED_PAID_MARKET | CROWDED | WHITE_SPACE | LOW_EVIDENCE
  validated_paid_market boolean,
  white_space boolean,
  study_edge_present boolean,
  ads_observed boolean,
  brand_conquest_candidate boolean,
  nonbrand_search_candidate text,   -- tri-state in source data: 'true' | 'partial'
  course_code_network_present boolean,
  university_free_support boolean,
  evidence_confidence text,                 -- high | medium | low
  paid_competitors int,
  intro_accounting_competitors int,
  course_specific_competitors int,
  strongest_competitor_name text,
  strongest_competitor_domain text,
  strongest_competitor_type text,
  strongest_competitor_course_specific boolean,
  competitor_price_context text,
  top_competitor_domains text[],
  imported_at timestamptz not null default now()
);
alter table public.campus_competitive_intel enable row level security;

-- 2) Outreach spine additions (handoff-identified gaps): reply classification +
--    future Meta/IG thread reference + explicit batch-approval audit.
alter table public.growth_outreach_events add column if not exists reply_category text;
  -- interested | question | referred | not_interested | unsubscribe | other
alter table public.growth_outreach_events add column if not exists external_thread_id text;
alter table public.growth_outreach_events add column if not exists approved_by text;
alter table public.growth_outreach_events add column if not exists approved_at timestamptz;
alter table public.growth_outreach_events add column if not exists email text; -- lower(email) snapshot for dedupe/history
create index if not exists goe_campus_idx on public.growth_outreach_events (campus_id, occurred_at desc);
create index if not exists goe_entity_idx on public.growth_outreach_events (entity_type, entity_id);
create index if not exists goe_email_idx on public.growth_outreach_events (email);
create index if not exists goe_followup_idx on public.growth_outreach_events (next_follow_up_at) where follow_up_done_at is null;

-- 3) Manual pin / priority override. Computed ranking stays intact underneath.
create table if not exists public.growth_campus_pins (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  pinned boolean not null default false,
  manual_priority int,          -- optional override slot (1 = top). null = computed order
  note text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.growth_campus_pins enable row level security;

-- 4) Deterministic, versioned campus priority ranking (computed server-side, stored;
--    no LLM, no per-pageload scoring). `why` = short human chips ("Large market · Proven paid").
create table if not exists public.growth_campus_priority (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  rank int not null,
  score numeric not null,
  version text not null,        -- e.g. growth_priority_v1
  why text[] not null default '{}',
  components jsonb not null default '{}'::jsonb,  -- transparent inputs for the drill-down
  computed_at timestamptz not null default now()
);
alter table public.growth_campus_priority enable row level security;
create index if not exists gcp_rank_idx on public.growth_campus_priority (rank);

-- 5) Topic-map approval audit — who approved what, when, from which evidence.
create table if not exists public.growth_map_approvals (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  professor_id uuid,            -- campus_lead_suggestions.id when professor-specific
  campus_exam_id uuid,
  action text not null,         -- approve_campus_map | approve_professor_map | keep_starter | edit
  approved_by text not null,
  payload jsonb not null default '{}'::jsonb,  -- proposal snapshot: exams, topics, sources
  created_at timestamptz not null default now()
);
alter table public.growth_map_approvals enable row level security;
create index if not exists gma_campus_idx on public.growth_map_approvals (campus_id);

-- 6) Growth outreach templates (council/chapter/club audiences). The faculty outreach
--    template table (outreach_email_templates) is lead-typed and locked to that system;
--    growth keeps its own tiny registry.
create table if not exists public.growth_outreach_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,     -- 'council_intro_v1' etc.
  name text not null,
  audience text not null,       -- council | chapter | club
  subject text not null,
  body text not null,           -- plain text with {{merge_vars}}
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.growth_outreach_templates enable row level security;

insert into public.growth_outreach_templates (key, name, audience, subject, body) values
 ('council_intro_v1','Council intro','council',
  'Free Exam 1 accounting help for {{campus}} chapters',
  'Hi{{#first_name}} {{first_name}}{{/first_name}},

I''m Lee — I run Survive Accounting, a video + practice platform built specifically for Intro Financial Accounting{{#course_code}} ({{course_code}} at {{campus}}){{/course_code}}.

We''re opening free Exam 1 access for {{campus}} Greek chapters this fall: every member gets the full Exam 1 video walkthroughs and practice sets at no cost, so chapters can offer it as an academic resource without a budget ask.

Would you be open to passing this along to your chapters, or pointing me to the right person? Happy to send a one-pager.

Lee
Survive Accounting
{{tracked_link}}'),
 ('chapter_intro_v1','Chapter intro','chapter',
  'Free Exam 1 accounting resource for {{chapter}}',
  'Hi{{#first_name}} {{first_name}}{{/first_name}},

I''m Lee, founder of Survive Accounting — video walkthroughs + practice for Intro Financial Accounting{{#course_code}} ({{course_code}}){{/course_code}} at {{campus}}.

We''re giving {{chapter}} members free access to all of Exam 1: real exam-style questions, step-by-step videos, no cost to the chapter. Chapters use it as an academic-chair resource for members in the class.

Want me to set up your chapter''s access link?

Lee
Survive Accounting
{{tracked_link}}'),
 ('club_intro_v1','Business club intro','club',
  'Free Exam 1 accounting resource for {{campus}} members',
  'Hi{{#first_name}} {{first_name}}{{/first_name}},

I''m Lee, founder of Survive Accounting — video + practice help for Intro Financial Accounting{{#course_code}} ({{course_code}}){{/course_code}} at {{campus}}.

We''re opening free Exam 1 access for members of student business organizations this fall. If your members take intro accounting, I''d love to make it available as a member resource — zero cost.

Who''s the right person to set that up with?

Lee
Survive Accounting
{{tracked_link}}')
on conflict (key) do nothing;

commit;
