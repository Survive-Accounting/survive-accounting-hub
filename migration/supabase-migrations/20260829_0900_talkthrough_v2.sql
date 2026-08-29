-- 20260829_0900 — TALKTHROUGH BOOTH v2: stamps become CONTEXTS + stars.
--
-- Additive only. A stamp is now a click-IN/click-OUT context: `ended_at`
-- closes the window (null = still open); segments group under a context by
-- time-window overlap — a DERIVED view, so segment rows are never rewritten
-- (Transcript Law). `starred` is the "come back to this" bookmark.
--
-- The client tolerates these columns being missing (the server strips them and
-- retries once, loudly), so the booth keeps syncing pre-migration — but stars
-- and context windows only round-trip across machines once this runs.

alter table public.talkthrough_tags add column if not exists ended_at timestamptz;
alter table public.talkthrough_tags add column if not exists starred boolean not null default false;

comment on column public.talkthrough_tags.ended_at is
  'Context close (B1): a stamp is open from `at` until ended_at (null = open). Segment grouping derives from this window; transcripts are never rewritten.';
comment on column public.talkthrough_tags.starred is
  'Come-back-to-this bookmark on {stamp, ceq} — no context opened.';
