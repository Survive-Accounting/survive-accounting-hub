-- 0115 — IDEA NOTES: the Idea Bank gets a server-side source of truth.
--
-- WHY (08-16): notes lived in localStorage only, which is PER-ORIGIN. Lee works
-- across surviveaccounting.com, a per-deployment Vercel preview hostname, and
-- localhost — three separate stores. Notes typed on a preview URL were invisible
-- from production and orphaned by the next deploy. One was found stranded and
-- recovered by hand. This table is the one store behind all of them.
--
-- `id` is TEXT, not uuid: notes already exist client-side as "idea-<ms>-<rand>",
-- and they are being adopted, not re-minted. Re-keying would break the idempotent
-- upsert that lets a queued note retry safely.
--
-- Nothing is ever hard-deleted: archived_at is the only removal.

create table if not exists public.idea_notes (
  id          text primary key,
  text        text        not null check (length(btrim(text)) > 0),
  category    text        not null default 'Ideas',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.idea_notes is
  'Idea Bank capture. Authoring-only, never student-facing. Source of truth across origins; clients keep a local-first copy and queue writes. Soft delete via archived_at only.';
comment on column public.idea_notes.id is
  'Client-minted "idea-<epochms>-<rand>". Client-side ids make the upsert idempotent, so a queued retry can never duplicate a note.';
comment on column public.idea_notes.updated_at is
  'Drives BOTH merge (newest wins per note) and the sync queue (client syncs while its syncedAt is behind this).';

create index if not exists idea_notes_updated_idx on public.idea_notes (updated_at desc);
create index if not exists idea_notes_active_idx  on public.idea_notes (category, created_at desc) where archived_at is null;

-- DENY BY DEFAULT. No policies are created, so anon/authenticated get nothing;
-- every read and write goes through a server function on the service role, which
-- is the same shape as orders and campus_exams.
alter table public.idea_notes enable row level security;
