-- CANNED INTRO/OUTRO USAGE (2026-09-06). Lee: "I want to use these in the teleprompter as
-- canned intros/outros... help me ensure I don't use one back to back or too often." One row
-- per commit (not per frame — the intro's two frames, open+intro, count as one use). The pick
-- logic (src/components/blastoff/canned-lines.ts) reads the most recent rows for a slot to
-- exclude the last-used line from the pool and warn on heavy recent repeats.
--
-- RLS: deny-by-default like every other new table this session — all access rides the
-- service-role server fns in src/lib/canned-lines.functions.ts.
-- BIO joined the same system 2026-09-06 ("can the bio slide too... same process as above").
create table if not exists public.canned_line_usage (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  slot text not null,
  line_id text not null,
  used_at timestamptz not null default now(),
  constraint canned_line_usage_slot_ck check (slot in ('intro', 'outro', 'bio'))
);

-- The one read is "give me the last N uses for this slot, newest first."
create index if not exists canned_line_usage_slot_idx on public.canned_line_usage (slot, used_at desc);

alter table public.canned_line_usage enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
