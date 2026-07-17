-- 0096: INTRO AUTO-TRIM — non-destructive trim metadata on a take. When an INTRO
-- take is uploaded, the browser detects the audio onset and stores the trim WINDOW
-- here; the raw take is kept untouched. PUBLISH realizes the trim via Mux
-- ingest-trim (start/end on asset creation). Re-trim / revert just rewrite these.
--
-- trim_warning: 'too_short' (raw shorter than the target length — blocks publish)
-- or 'onset_not_detected' (silent/fade-in — trimmed from 0, verify). null = clean.

alter table public.frame_takes add column if not exists onset_s double precision;            -- audio onset in the raw take
alter table public.frame_takes add column if not exists raw_duration_s double precision;      -- raw take length
alter table public.frame_takes add column if not exists trimmed_duration_s double precision;  -- trimmed clip length
alter table public.frame_takes add column if not exists trim_warning text;

-- lesson_videos carries the trimmed-intro Mux asset the publish pipeline builds
-- from the raw intro take's trim window (so Auphonic gets the trimmed intro), plus
-- the lesson-level OUTRO clip's playback id (uploaded by the lesson title; falls
-- back to OUTRO_STING_URL when absent).
alter table public.lesson_videos add column if not exists trimmed_intro_asset_id text;
alter table public.lesson_videos add column if not exists trimmed_intro_playback_id text;
alter table public.lesson_videos add column if not exists outro_playback_id text;
