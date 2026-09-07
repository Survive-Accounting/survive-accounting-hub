-- FILMED FLAG on the Post dashboard (2026-09-06 /v3 audit: "Post has no idea what's actually
-- finished ... zero awareness of where a set is in Talkthrough → Review → Film"). The stage chip
-- on /v3 and /v3/post reads three auto signals (talkthrough store, a saved blast plan, film-timer
-- seconds) and this one manual one: Lee's own click that the set is shot. Manual wins over the
-- timer either way — the timer can run on a take he then re-shot, or not run at all on a set
-- filmed elsewhere.
--
-- 20260906_0200 already carries this column for a fresh install; this is for a DB that ran it
-- before the column existed. Additive, idempotent.
alter table public.set_publish_status add column if not exists filmed_at timestamptz;
