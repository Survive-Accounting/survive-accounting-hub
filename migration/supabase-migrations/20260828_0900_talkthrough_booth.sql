-- 20260828_0900 — THE TALKTHROUGH BOOTH: raw transcripts as first-class artifacts.
--
-- Lee opens a set, talks freely about it, and the booth captures everything:
-- verbatim transcript segments anchored to {session, focused CEQ, time}, moment
-- tags, and (per session) the AI pass's draft board. The prime directive, learned
-- the hard way: RAW TRANSCRIPTS ARE VERBATIM, FOREVER, TIED TO CONTEXT. Summaries
-- are derived views that never replace them — the board lives in its own table
-- and a failed or bad pass can never touch a segment.
--
-- Same discipline as 0115_idea_notes (the Idea Bank server store):
--   · ids are TEXT, client-minted ("tt-<epochms>-<rand>") — the upsert is
--     idempotent so a queued retry can never duplicate a row;
--   · updated_at drives BOTH merge (newest wins per row) and the sync queue
--     (client syncs while its syncedAt is behind);
--   · nothing is ever hard-deleted: archived_at only;
--   · RLS deny-by-default — no policies, service-role server functions only.

-- ---------------------------------------------------------------- sessions

create table if not exists public.talkthrough_sessions (
  id          text primary key,
  set_id      text        not null,
  set_name    text        not null default '',
  started_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.talkthrough_sessions is
  'One talkthrough sitting per set. Studio-only, never student-facing. Clients are local-first and queue writes (Idea Bank contract).';
comment on column public.talkthrough_sessions.set_name is
  'Denormalized at capture time so a session stays readable even if the set is renamed or deleted.';

create index if not exists tt_sessions_updated_idx on public.talkthrough_sessions (updated_at desc);
create index if not exists tt_sessions_set_idx     on public.talkthrough_sessions (set_id, started_at desc) where archived_at is null;

alter table public.talkthrough_sessions enable row level security;

-- ---------------------------------------------------------------- segments

create table if not exists public.talkthrough_segments (
  id                text primary key,
  session_id        text        not null,
  seq               integer     not null default 0,
  text              text        not null default '',
  source            text        not null default 'live',   -- 'live' (SpeechRecognition) | 'whisper' (canonical)
  whisper_pending   boolean     not null default true,      -- false once Whisper text has landed
  audio_path        text,                                   -- staging path of the chunk WAV (transcription retries from here)
  focused_ceq_id    text,                                   -- null = general set talk
  focused_ceq_label text,                                   -- denormalized ("Q7 · Unearned → earned") so transcripts stay readable
  started_at        timestamptz not null,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

comment on table public.talkthrough_segments is
  'VERBATIM transcript segments — the first-class artifact. Whisper text is the stored truth (source=whisper); live SpeechRecognition text is the fallback that must never be lost while whisper_pending. No process may summarize a segment in place.';
comment on column public.talkthrough_segments.focused_ceq_id is
  'The coverage anchor: what was focused while Lee spoke is what the words are about. Null = general set talk.';

create index if not exists tt_segments_session_idx on public.talkthrough_segments (session_id, seq);
create index if not exists tt_segments_updated_idx on public.talkthrough_segments (updated_at desc);

alter table public.talkthrough_segments enable row level security;

-- -------------------------------------------------------------------- tags

create table if not exists public.talkthrough_tags (
  id                text primary key,
  session_id        text        not null,
  tag               text        not null,                   -- SHORT | NERDOUT | EXHIBIT | PHRASE | TALK | KEY
  at                timestamptz not null,                   -- the moment tapped (or the spoken cue's segment start)
  focused_ceq_id    text,
  focused_ceq_label text,
  source            text        not null default 'tap',     -- 'tap' (Lee) | 'ai' (Phase-2 proposed, from a spoken cue)
  note              text,                                   -- ai-proposed tags carry the verbatim quote that earned them
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

comment on table public.talkthrough_tags is
  'Moment stamps on the talkthrough timeline. Tap-sourced ones are Lee''s ground truth; ai-sourced ones are proposals and always carry their verbatim quote.';

create index if not exists tt_tags_session_idx on public.talkthrough_tags (session_id, at);

alter table public.talkthrough_tags enable row level security;

-- ------------------------------------------------------------- board items

create table if not exists public.talkthrough_board_items (
  id          text primary key,
  session_id  text        not null,
  run_id      text        not null,                          -- which AI pass produced it (regenerates mint a new run_id per item)
  kind        text        not null,                          -- ceq_order | outline | exhibit | vibe | short | phrase | accuracy
  title       text        not null default '',
  payload     jsonb       not null default '{}'::jsonb,      -- kind-shaped content (see talkthrough-pass.ts)
  quote       text        not null default '',               -- the verbatim transcript moment that motivated it
  ceq_ids     jsonb       not null default '[]'::jsonb,      -- which CEQs it touches (per-CEQ board view)
  status      text        not null default 'suggested',      -- suggested | accepted | edited | rejected | built | filmed
  comment     text        not null default '',               -- Lee's note; feeds item-level regeneration
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.talkthrough_board_items is
  'The DRAFT BOARD — a staging area, never the CEQ bank. Items are AI starting points; Lee''s hands make any real edits. Every item is traceable to a verbatim quote. Regeneration replaces the item''s payload, never a transcript.';

create index if not exists tt_board_session_idx on public.talkthrough_board_items (session_id, kind);
create index if not exists tt_board_updated_idx on public.talkthrough_board_items (updated_at desc);

alter table public.talkthrough_board_items enable row level security;
