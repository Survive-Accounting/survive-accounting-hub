-- THE CEQ QUEUE (2026-09-10, docs/DESIGN-CEQ-QUEUE.md). Lee: "I brainstorm the idea... it
-- generates in background... while that's happening, i'm tweaking something else... we want to
-- have a generation queue that is stacked at all times... it takes my brainstorms and gives me at
-- least the starting points."
--
-- ceq_jobs: one row per "turn this brainstorm into cards" request. The browser drains it (any
-- /v3 tab claims the oldest queued row and runs it) — Vercel crons are daily on this plan and
-- cannot. The result is candidate cards; nothing reaches the deck until Lee keeps them, and what
-- he keeps lands as DRAFT nodes that /learn already excludes.
--
-- ceq_job_feedback: what he kept, edited, or dropped from each job. The next job for the same
-- parent reads these as few-shot context — the whole "gets smarter" mechanism until there are
-- hundreds of rows.
--
-- RLS deny-by-default like every other table this month; all access rides the service-role
-- server functions in src/lib/ceq-queue.functions.ts, each gated on assertAdmin.
create table if not exists public.ceq_jobs (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null,
  parent_deck_id text null,
  -- {segments:[{text,at}], parentCards:[{stem,choices}], name, blurb, feedback:[{stem,action}]}
  source jsonb not null,
  status text not null default 'queued',           -- queued | running | done | failed
  -- {name?, blurb?, cards:[{stem, choices:[{text,correct,feedback}], kind, confidence, why}], dropped:int}
  result jsonb null,
  model text null,
  cost_usd numeric(8,4) null,
  error text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);
create index if not exists ceq_jobs_deck_idx on public.ceq_jobs (deck_id, created_at desc);
create index if not exists ceq_jobs_queue_idx on public.ceq_jobs (status, created_at) where status = 'queued';

create table if not exists public.ceq_job_feedback (
  job_id uuid not null references public.ceq_jobs(id) on delete cascade,
  -- The candidate's index inside result.cards; a kept card also records the node id it became.
  candidate int not null,
  ceq_id text null,
  action text not null,                              -- kept | edited | dropped
  edit_diff jsonb null,
  created_at timestamptz not null default now(),
  primary key (job_id, candidate)
);

alter table public.ceq_jobs enable row level security;
alter table public.ceq_job_feedback enable row level security;
-- no policies: deny-by-default; the service role bypasses RLS.
