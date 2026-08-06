-- 0101_student_shell.sql — student-side shell foundations (#7)
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb).
-- Idempotent. Adds the topic-chip short label + per-student set-completion progress.
--
-- Data-model notes:
--  * CEQ SETS live in canvas_scenes.nodes_json (SceneDoc.decks[]), NOT a table. Their
--    student visibility is DeckDef.status ('draft'|'live') and access is DeckDef.access
--    ('free'|'paid') — both in scene JSON, filtered SERVER-SIDE (draft never reaches a
--    student). So set progress keys on the DeckDef.id (text), not a FK.
--  * A set's published video = lesson_videos.playback_id (newest version, stage='ready')
--    resolved from DeckDef.lessonId = lesson_videos.lesson_id, server-side.

-- 1) TOPIC CHIP short label — the student video-grid chip must not wrap and break the grid.
--    Falls back to chapter_name when null (the app truncates). chapters is anon-readable.
alter table public.chapters add column if not exists short_label text;

-- 2) PER-STUDENT, PER-SET completion state (the progression data model — #7 asks for the
--    model only, no XP/streaks/badges). One row per (user, set); 'complete' advances the
--    outline. Locked/unlocked is DERIVED (access + prior completion), never stored here.
create table if not exists public.student_set_progress (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  set_id     text        not null,  -- DeckDef.id (CEQ set) — sets are scene JSON, so text
  state      text        not null default 'unstarted'
                         check (state in ('unstarted', 'in_progress', 'complete')),
  updated_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

alter table public.student_set_progress enable row level security;

-- A student reads + writes ONLY their own rows.
drop policy if exists "own progress read"   on public.student_set_progress;
create policy "own progress read"   on public.student_set_progress
  for select using (auth.uid() = user_id);

drop policy if exists "own progress insert" on public.student_set_progress;
create policy "own progress insert" on public.student_set_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "own progress update" on public.student_set_progress;
create policy "own progress update" on public.student_set_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
