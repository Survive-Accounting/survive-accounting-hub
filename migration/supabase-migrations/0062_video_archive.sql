-- 0062_video_archive.sql
-- Archive of legacy Vimeo videos migrated to Mux, plus captured transcripts.
-- Attribution (course_family / chapter_id / scenario_slug) is filled later in the
-- admin view, so all three are nullable. Access is server-side only (service
-- role); RLS is enabled with no policies (deny-by-default).

create table if not exists public.video_archive (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null check (source in ('vimeo','mux')),
  source_video_id    text not null,
  title              text,
  description        text,
  duration_sec       integer,
  created_at_source  timestamptz,
  mux_asset_id       text,
  mux_playback_id    text,
  transcript_text    text,
  transcript_source  text check (transcript_source in ('vimeo','mux','manual')),
  course_family      text,
  chapter_id         uuid,
  scenario_slug      text,
  status             text not null default 'imported'
                       check (status in ('imported','transcribed','assigned','archived')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One row per source video (idempotent re-imports).
create unique index if not exists video_archive_source_uidx
  on public.video_archive (source, source_video_id);

create index if not exists video_archive_status_idx on public.video_archive (status);
create index if not exists video_archive_scenario_idx on public.video_archive (scenario_slug);
create index if not exists video_archive_mux_asset_idx on public.video_archive (mux_asset_id);

alter table public.video_archive enable row level security;
-- No policies: only the service role (server functions + scripts) may read/write.

-- keep updated_at fresh
create or replace function public.tg_video_archive_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists video_archive_touch on public.video_archive;
create trigger video_archive_touch before update on public.video_archive
  for each row execute function public.tg_video_archive_touch();
