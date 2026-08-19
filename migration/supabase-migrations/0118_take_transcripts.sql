-- 0118 — TAKE TRANSCRIPTS: word-level Whisper transcripts for kept takes (Q3).
--
-- WHY (08-19): text-based editing (Descript-style) needs a word-timed transcript
-- of each take so the Pipeline can karaoke-highlight, click-to-seek a word, and
-- cut filler by selecting words. Transcription runs server-side against OpenAI
-- Whisper (verbose_json + word timestamps) on KEEP — NOT Mux, which is the
-- delivery layer; scratch takes must never go there.
--
-- Keyed by `take_path` (the Supabase storage path) so a transcript follows the
-- clip across machines, exactly like the take does. One row per take.
-- `words` is [{ "t": text, "s": startSec, "e": endSec }, …]. Nothing here is
-- ever student-facing.

create table if not exists public.take_transcripts (
  take_path   text primary key,
  text        text not null default '',
  words       jsonb not null default '[]'::jsonb,
  model       text not null,
  lang        text,
  duration_s  numeric,
  created_at  timestamptz not null default now()
);

comment on table public.take_transcripts is
  'Word-level Whisper transcript per kept take, keyed by storage path (Q3). Authoring-only. Drives transcript-based editing in the Pipeline; never student-facing.';
comment on column public.take_transcripts.words is
  'Array of { t: word text, s: start seconds, e: end seconds } in playback order.';
comment on column public.take_transcripts.take_path is
  'The canvas-media storage path — the same key stitch items and the take ref use, so a transcript follows the clip across machines.';

-- DENY BY DEFAULT. No policies → anon/authenticated get nothing; every read and
-- write goes through a server function on the service role (same as idea_notes,
-- edit_events, orders, campus_exams).
alter table public.take_transcripts enable row level security;
