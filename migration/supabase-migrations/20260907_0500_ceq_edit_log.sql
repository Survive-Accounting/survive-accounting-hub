-- THE EDIT LOG (2026-09-07). Lee: "I want the app/AI to make note of the edits I'm making, so
-- 'shorten' (aka standardize) button gets smarter over time … I'm sending all of this in
-- manually now, but the goal is for this to happen automatically in background any time I am
-- making edits."
--
-- One row per SETTLED save on a card or a callout in the Review deck's Editor — not per
-- keystroke. `before` and `after` are the words (a CEQ: {stem, choices:[{text,correct}]}; a
-- callout: {title, text, bullets}). `source` says who made the change:
--   manual          — Lee edited the card by hand (the autosave settled on different words)
--   shorten         — he pressed Apply on the Shorten panel's proposal
--   shorten-edited  — he changed the shortened result within a minute of applying it: the
--                     strongest signal there is (what was offered → what he wrote instead),
--                     the same idea as the rehearsal review's "wrote my own"
-- src/lib/shorten-brief.ts renders the newest manual / shorten-edited pairs as few-shot
-- examples in every Shorten call — genuine in-context guidance, not model fine-tuning.
--
-- RLS deny-by-default like cost_events and teleprompter_feedback; all access via the
-- service-role server fns in src/lib/edit-log.functions.ts.
create table if not exists public.ceq_edit_log (
  id uuid primary key default gen_random_uuid(),
  set_id text null,
  -- the CEQ node id, or the plan frame id for a callout
  target text not null,
  kind text not null,
  source text not null,
  before jsonb not null,
  after jsonb not null,
  created_by text null,
  created_at timestamptz not null default now(),
  constraint ceq_edit_log_kind_ck check (kind in ('ceq', 'callout')),
  constraint ceq_edit_log_source_ck check (source in ('manual', 'shorten', 'shorten-edited'))
);
comment on table public.ceq_edit_log is
  'One settled edit per row on a set card or a callout (Review deck Editor): the words before and after, and whether Lee, Shorten, or Lee-over-Shorten made the change. Read as few-shot examples by the Shorten brief.';
-- The one read is "the newest few examples worth learning from" — by source, newest first.
create index if not exists ceq_edit_log_source_idx on public.ceq_edit_log (source, created_at desc);
create index if not exists ceq_edit_log_target_idx on public.ceq_edit_log (target, created_at desc);
alter table public.ceq_edit_log enable row level security;
