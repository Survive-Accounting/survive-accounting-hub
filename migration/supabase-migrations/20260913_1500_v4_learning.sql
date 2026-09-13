-- 20260913_1500 — V4 LEARNING RECORD: the AI's first version beside Lee's final one, and every edit between.
--
-- Lee, 2026-09-13: "The app saves the AI's first version next to my final version so it can learn to
-- teach like me over time … For now, just store the data reliably: AI original, my final, my individual
-- edits, and my optional 'why' notes, per step and per topic."
--
--   teach_proposals  one row per proposal a step works from (a topic's questions, its slides, its chain,
--                    its cuts): what came in, what the AI (or the migration) proposed, and — once marked
--                    final — what Lee ended with. A new proposal for the same step is the next version.
--   teach_edits      every change Lee made on the way, with before / after and his optional why.
--
-- Additive. Deny-by-default RLS: only the service-role server functions (lib/v4.functions.ts, behind
-- assertAdmin) read or write them.

create table if not exists public.teach_proposals (
  id              uuid primary key default gen_random_uuid(),
  set_id          text not null check (char_length(set_id) between 1 and 200),
  step            text not null check (step in ('questions', 'slides', 'chain', 'split')),
  version         integer not null check (version >= 1),
  source          text not null check (source in ('ai', 'migrated', 'manual')),
  status          text not null default 'open' check (status in ('open', 'final', 'superseded')),
  ai_original     jsonb not null,
  final           jsonb null,
  input           jsonb null,
  model           text null,
  prompt_version  text null,
  created_by      text null,
  created_at      timestamptz not null default now(),
  finalized_at    timestamptz null,
  constraint teach_proposals_version_uq unique (set_id, step, version)
);

create index if not exists teach_proposals_set_step_idx on public.teach_proposals (set_id, step, version desc);

create table if not exists public.teach_edits (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid null references public.teach_proposals (id) on delete restrict,
  set_id        text not null check (char_length(set_id) between 1 and 200),
  step          text not null check (step in ('questions', 'slides', 'chain', 'split')),
  -- what was changed: a card id, a group id, a frame id …
  target        text not null check (char_length(target) between 1 and 200),
  action        text not null check (char_length(action) between 1 and 40),
  before        jsonb null,
  after         jsonb null,
  why           text null check (why is null or char_length(why) <= 2000),
  created_by    text null,
  created_at    timestamptz not null default now()
);

create index if not exists teach_edits_set_step_idx on public.teach_edits (set_id, step, created_at desc);
create index if not exists teach_edits_proposal_idx on public.teach_edits (proposal_id);

alter table public.teach_proposals enable row level security;
alter table public.teach_edits enable row level security;
