-- 20260831_1200 — IDEA VAULT: capture from anywhere.
--
-- The vault only works if capturing is faster than the idea evaporating —
-- from a phone, a car, an airport. This adds what the non-laptop paths need.
--
-- Additive only: every column is nullable or defaulted, so rows written by the
-- laptop drawer before this migration stay valid and readable.

-- WHO. The person who notices the problem is usually not Lee, so King and
-- McKinsey use the same vault, number and inbox. No separate permissions: if
-- you can see the admin, you can add an idea.
alter table public.ideas add column if not exists created_by text not null default '';

-- HOW IT ARRIVED — 'web' | 'voice' | 'sms' | 'email'. Kept because an idea
-- texted from a car reads differently from one written at a desk, and because
-- a broken inbound path is invisible without it.
alter table public.ideas add column if not exists source_kind text not null default 'web';

-- ATTACHMENTS: PDFs, screenshots, audio, markdown. An array of
-- { id, name, mime, size, path, url, kind } — Supabase storage paths under the
-- existing canvas-media bucket, so there is no new bucket to provision.
alter table public.ideas add column if not exists attachments jsonb not null default '[]'::jsonb;

-- VOICE. The transcript is editable and the audio STAYS ATTACHED: if
-- transcription fails or hallucinates, the recording is still the idea.
alter table public.ideas add column if not exists audio_path text;
alter table public.ideas add column if not exists transcript_status text;

create index if not exists ideas_created_by_idx on public.ideas (created_by);

comment on column public.ideas.created_by is
  'lee | king | mckinsey — everyone shares one vault; this is for filtering, not permissions.';
comment on column public.ideas.source_kind is
  'web | voice | sms | email — how it arrived. A silent inbound path is invisible without this.';
comment on column public.ideas.attachments is
  'jsonb array of { id, name, mime, size, path, url, kind }. Files live in the canvas-media bucket.';
comment on column public.ideas.audio_path is
  'Voice capture: the recording is kept even when transcription fails, because the audio IS the idea.';
comment on column public.ideas.transcript_status is
  'ok | failed | rejected — "rejected" means the hallucination blocklist caught it ("thanks for watching" is worse than no idea).';
