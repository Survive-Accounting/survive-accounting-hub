-- POST DASHBOARD (2026-09-06). Lee: "build out a basic dashboard for publishing, just the
-- essentials and what will save time." StepBar's own Post blurb already says the job:
-- "Queue up what's filmed across every topic and set, process it, publish it." This is that
-- queue's one piece of real state — has this set gone out, and where.
--
-- No automated upload exists anywhere in this app yet (YouTube/Instagram/TikTok all stay a
-- human act — see docs discussion in stitch-defs.ts's publishGate()), so this is deliberately a
-- manual checklist: one click marks a destination posted, an optional URL can be pasted in after
-- the fact for reference. One row per CEQ set, one column-pair per destination.
--
-- RLS: deny-by-default like every other new table this session — all access rides the
-- service-role server fns in src/lib/publish.functions.ts.
create table if not exists public.set_publish_status (
  set_id text primary key,
  site_posted_at timestamptz null,
  site_url text null,
  youtube_posted_at timestamptz null,
  youtube_url text null,
  instagram_posted_at timestamptz null,
  instagram_url text null,
  tiktok_posted_at timestamptz null,
  tiktok_url text null,
  notes text null,
  updated_at timestamptz not null default now()
);

alter table public.set_publish_status enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
