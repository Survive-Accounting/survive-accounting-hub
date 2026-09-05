-- SHIPPED — Lee's build-in-public log (2026-09-05). One row per recording session: press R,
-- talk, build, stop, publish. Kept deliberately flat for V1; see src/components/shipped/model.ts
-- for the shape this is allowed to grow into later.
--
-- video_status is the MUX PIPELINE (uploading → processing → ready, or errored); publish_status
-- is LEE'S CALL (draft → published) — two independent axes, never conflated, so a ready video
-- can sit as a draft indefinitely and a draft never leaks to /shipped before Lee says so.
--
-- RLS: deny-by-default like frame_takes (0094) and canvas_scenes (0084) — all access rides the
-- service-role server fns in src/lib/shipped.functions.ts. The public /shipped pages read
-- PUBLISHED rows only, through those same server fns (never a direct client query).
create table if not exists public.shipped_entries (
  id uuid primary key default gen_random_uuid(),
  -- Set once, on first publish, from the title; never reused even if the entry is later
  -- unpublished, so an old public link never resolves to a different video.
  slug text unique,
  title text not null default '',
  topic text null,
  semester text not null,
  recorded_at timestamptz not null default now(),
  duration_seconds numeric null,
  -- The live SpeechRecognition draft, persisted immediately so nothing is lost if Mux's
  -- generated transcript never arrives; the authoritative one once Mux has it.
  transcript_live text null,
  transcript_mux text null,
  transcript_source text not null default 'live',
  -- The Notepad's content — a small set of inline tags only (b/i/u, size via a span with a
  -- data-size attribute), never arbitrary HTML. See src/components/shipped/notepad.ts.
  notes_html text null,
  notes_public boolean not null default false,
  mux_upload_id text null,
  mux_asset_id text null,
  mux_playback_id text null,
  video_status text not null default 'uploading',
  publish_status text not null default 'draft',
  published_at timestamptz null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipped_transcript_source_ck check (transcript_source in ('live', 'mux')),
  constraint shipped_video_status_ck check (video_status in ('uploading', 'processing', 'ready', 'errored')),
  constraint shipped_publish_status_ck check (publish_status in ('draft', 'published'))
);

create index if not exists shipped_entries_public_idx on public.shipped_entries (publish_status, recorded_at desc);
create index if not exists shipped_entries_upload_idx on public.shipped_entries (mux_upload_id);

alter table public.shipped_entries enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.

-- "What should I build next?" (Lee, 2026-09-05: "a simple feedback interaction is enough") —
-- a single global tally per topic, shown on every SHIPPED entry, not a per-video vote or a
-- comment thread. A visitor's own click is remembered client-side (localStorage) so the same
-- browser cannot inflate one topic; this table is not meant to resist a determined bad actor.
create table if not exists public.shipped_topic_votes (
  topic text primary key,
  votes int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.shipped_topic_votes enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
