-- Campus identity: system/family grouping + student-facing display name +
-- search aliases + resolution status. Systems are SEARCHABLE (surface their
-- campuses) but NOT selectable; selection always resolves to a real campus.
-- Campuses are never consolidated — only true duplicates/aliases merge.
begin;

create table if not exists public.campus_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,             -- "University of California"
  aliases jsonb not null default '[]'::jsonb,  -- ["UC","University of California System"]
  created_at timestamptz not null default now()
);
alter table public.campus_systems enable row level security;

alter table public.campuses add column if not exists display_name text;               -- student-facing ("UCLA", "Purdue University")
alter table public.campuses add column if not exists aliases jsonb not null default '[]'::jsonb; -- search terms/nicknames
alter table public.campuses add column if not exists parent_system_id uuid null references public.campus_systems(id) on delete set null;
alter table public.campuses add column if not exists campus_resolution_status text null; -- resolved | needs_campus_resolution
create index if not exists campuses_parent_system_idx on public.campuses (parent_system_id);

commit;
