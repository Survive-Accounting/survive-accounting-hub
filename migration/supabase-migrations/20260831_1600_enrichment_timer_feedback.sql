-- Enrichment speed + feedback loop.
--
-- (1) enrichment_seconds: cumulative wall-clock a human has spent enriching a campus, so the header
-- can show a real "avg N min per campus" and capacity planning stops being a guess. Each save adds
-- the session's elapsed time; the average is taken over campuses that have any recorded time.
alter table public.campuses
  add column if not exists enrichment_seconds integer not null default 0;
comment on column public.campuses.enrichment_seconds is
  'Cumulative seconds a human has spent enriching this campus (summed across sessions on save).';

-- (2) Feedback: "what would make this faster next time?" captured while the friction is fresh. One
-- row per submission, tied to the campus + operator, surfaced in the Activity feed and at /feedback.
create table if not exists public.growth_enrichment_feedback (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  note text not null,
  created_by text,
  created_at timestamptz not null default now()
);
comment on table public.growth_enrichment_feedback is
  'Operator notes on making enrichment faster. Written by the enrichment panel, read by Activity + /admin/growth/coldoutreach/feedback.';
create index if not exists growth_enrichment_feedback_created_idx
  on public.growth_enrichment_feedback (created_at desc);

-- Deny-by-default: only the service role (which bypasses RLS) touches this. No policies = no anon/auth access.
alter table public.growth_enrichment_feedback enable row level security;
