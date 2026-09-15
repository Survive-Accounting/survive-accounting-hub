-- 20260915_1900 — FILM STITCHES: every punch-in video the worker stitched, its trims, the post queue, and the
-- tutor's pay per filmed slide.
--
-- Lee, 2026-09-15: "If I have a video already done, gone through the worker, pauses removed, etc. I want to be
-- able to see it again … trim the intro or outro … I'd rather queue it to quick post … in the order I send them
-- there … 'Pay per filmed slide' … a ledger of sorts … videos completed today, this week, this month, all time."
--
-- One row per video (a set's split): a re-stitch updates it, so a video is paid once, at its latest slide count.
-- Additive. Deny-by-default RLS: only the service-role server functions (lib/film-stitch.functions.ts, behind
-- assertAdmin) read or write it.

create table if not exists public.film_stitches (
  id            uuid primary key default gen_random_uuid(),
  set_id        text not null check (char_length(set_id) between 1 and 200),
  take_index    integer not null check (take_index >= 0),
  name          text not null default '' check (char_length(name) <= 300),
  topic_key     text null check (char_length(topic_key) <= 200),
  set_key       text null check (char_length(set_key) <= 200),
  set_name      text null check (char_length(set_name) <= 300),
  topic_name    text null check (char_length(topic_name) <= 300),
  -- the filmed slides in the video (the outro excluded) and what they paid
  slides        integer not null default 0 check (slides >= 0),
  rate_cents    integer not null default 500 check (rate_cents >= 0),
  pay_cents     integer not null default 0 check (pay_cents >= 0),
  -- which takes made it: a changed take means a new stitch, the same takes mean "watch it again"
  fingerprint   text not null default '' check (char_length(fingerprint) <= 8000),
  source_url    text not null check (char_length(source_url) <= 2000),
  duration_s    numeric null,
  trim_start_s  numeric not null default 0,
  trim_end_s    numeric null,
  file_url      text not null check (char_length(file_url) <= 2000),
  outro_trim_s  numeric not null default 0,
  social_url    text null check (char_length(social_url) <= 2000),
  end_cta       text null check (end_cta in ('try', 'unlock')),
  status        text not null default 'stitched' check (status in ('stitched', 'queued', 'posted')),
  queue_pos     double precision null,
  queued_at     timestamptz null,
  posted_at     timestamptz null,
  posted_link   text null check (char_length(posted_link) <= 2000),
  created_by    text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint film_stitches_video_uq unique (set_id, take_index)
);

create index if not exists film_stitches_created_idx on public.film_stitches (created_at desc);
create index if not exists film_stitches_queue_idx on public.film_stitches (status, queue_pos);

alter table public.film_stitches enable row level security;

comment on table public.film_stitches is
  'One row per punch-in video stitched on the render worker: the file, trims, social version, post queue position, and pay per filmed slide.';
