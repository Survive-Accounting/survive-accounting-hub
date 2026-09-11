-- LEARN EVENTS (2026-09-11) — the pulse behind the daily chapter / campus emails.
--
-- One row per thing a student did on /learn: a page visit, a video start, a slice of watch time,
-- a slice of time on the page. Every row carries the campus and (when the page knows it) the
-- chapter, so the daily pulse can say which chapters are using this and which are spreading it.
-- No emails or names here — emails live in campus_waitlist; this table is behaviour only.
--
-- kind:   page_visit | video_start | watch_time | page_time | practice_answer
-- seconds: for watch_time / page_time, the seconds in that slice (flushed every 15-30s).
-- session_id: one per browser tab session (sessionStorage); anon_id: the device id cookie.
create table if not exists public.learn_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  campus_id    uuid,
  campus_slug  text,
  chapter_slug text,
  anon_id      text,
  session_id   text,
  kind         text not null,
  set_id       text,
  part_key     text,
  seconds      integer,
  ref          text,
  is_test      boolean not null default false
);
create index if not exists learn_events_created_idx on public.learn_events (created_at desc);
create index if not exists learn_events_campus_idx  on public.learn_events (campus_slug, created_at desc);
create index if not exists learn_events_chapter_idx on public.learn_events (chapter_slug, created_at desc);

alter table public.learn_events enable row level security;
-- No public policies: only the service-role recordLearnEvents server fn writes, only the daily
-- pulse (service role) reads.
