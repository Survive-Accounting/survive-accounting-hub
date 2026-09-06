-- TELEPROMPTER FEEDBACK (2026-09-06). Lee: "I want to start teaching the AI what my style is...
-- let me comment on each, no matter which choice I do, let it have an optional leave comment.
-- I think even a 1-5 rating? Whatever will make us gather enough data to where in the future,
-- it will know what I like vs. don't like and keep getting it more right over time."
--
-- One row per rehearsal-slide decision: what Lee actually said (raw_transcript), what the AI
-- proposed (suggested_line), and what he actually kept (final_line) — whether he approved the
-- suggestion outright, asked for a revision, or hand-edited it himself (action). Rating and
-- comment are both optional on every action, not just a thumbs-down path.
--
-- "Teaching the AI" here means real, working few-shot guidance, not model fine-tuning (nothing
-- we can do from this app reaches that): src/components/blastoff/rehearsal-brief.ts pulls the
-- highest-rated rows as style examples for the next suggestion. It gets better the more Lee
-- rates, starting from the very next rehearsal.
--
-- RLS: deny-by-default like every other new table this session — all access rides the
-- service-role server fns in src/lib/rehearsal.functions.ts.
create table if not exists public.teleprompter_feedback (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  frame_id text not null,
  raw_transcript text not null,
  suggested_line text not null,
  final_line text not null,
  action text not null,
  rating integer null,
  comment text null,
  created_by text null,
  created_at timestamptz not null default now(),
  constraint teleprompter_feedback_action_ck check (action in ('approved', 'revised', 'edited')),
  constraint teleprompter_feedback_rating_ck check (rating is null or (rating >= 1 and rating <= 5))
);

-- The one read is "give me the best examples to learn from" — highest rating, newest first.
create index if not exists teleprompter_feedback_rating_idx on public.teleprompter_feedback (rating desc nulls last, created_at desc);

alter table public.teleprompter_feedback enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
