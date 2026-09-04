-- 20260904_1200 — TALKTHROUGH: idempotent resume for an interrupted pass.
--
-- ONE CONCERN: add `generation` to talkthrough_sessions.
--
-- Generation runs in Lee's browser tab. If the tab dies mid-pass, what the
-- pass already produced is safe (the board items are their own synced rows),
-- so "what is still owed" is DERIVED from the board — no counter, nothing to
-- drift. The one thing the board cannot tell you is what Lee ASKED for at the
-- End Session pre-flight: which kinds he excluded and whether he wanted a vibe
-- plan. That request record lives here so an interrupted synthesis resumes
-- with the same choices, from any machine.
--
-- Shape (client type SessionGeneration, canvas/talkthrough.ts):
--   {"requestedAt": iso, "excludedKinds": [str], "wantVibePlan": bool,
--    "completedAt": iso|null, "error": str|null}
--
-- Additive and idempotent. The client tolerates this column being absent (it
-- strips it and retries once, LOUDLY, with a console warning naming this
-- file), so nothing breaks before it runs — an interrupted synthesis simply
-- does not resume on a second machine until it does.

begin;

alter table public.talkthrough_sessions
  add column if not exists generation jsonb;

comment on column public.talkthrough_sessions.generation is
  'The End Session pre-flight request for the synthesis pass: {requestedAt, excludedKinds, wantVibePlan, completedAt, error}. Progress itself is DERIVED from talkthrough_board_items — this is only what was asked for, so an interrupted pass resumes with the same choices on any machine.';

commit;

-- PROOF it ran (expect exactly one row: generation | jsonb | YES):
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'talkthrough_sessions'
  and column_name = 'generation';
