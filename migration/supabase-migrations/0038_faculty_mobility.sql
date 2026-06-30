-- 0038_faculty_mobility.sql
-- Faculty career-mobility tracking for ProfIntel. While reviewing leads at one
-- campus, Lee can mark a professor Retired (no longer teaching anywhere) or Moved
-- (now at another campus). This builds an append-only faculty_moves graph — the
-- mineable "career progression" dataset — plus lightweight status columns on
-- campus_lead_suggestions that drive the UI (moved/retired leads drop out of the
-- active target list but stay queryable).
-- Idempotent. After 0037. Anon CRUD (AdminGate'd UI), matching the outreach pattern.

-- Mobility state on the lead row.
alter table public.campus_lead_suggestions
  add column if not exists mobility_status text not null default 'active';   -- active | retired | moved
alter table public.campus_lead_suggestions
  add column if not exists moved_to_campus_id uuid references public.campuses(id) on delete set null;
alter table public.campus_lead_suggestions
  add column if not exists moved_to_lead_id uuid;
alter table public.campus_lead_suggestions
  add column if not exists mobility_note text;
alter table public.campus_lead_suggestions
  add column if not exists mobility_updated_at timestamptz;

-- Append-only movement events (the career graph). to_campus_id is null for a
-- retirement; to_lead_id is filled lazily when the destination lead is created.
create table if not exists public.faculty_moves (
  id              uuid primary key default gen_random_uuid(),
  person_name     text,
  kind            text not null,            -- moved | retired
  from_campus_id  uuid references public.campuses(id) on delete set null,
  from_lead_id    uuid,
  to_campus_id    uuid references public.campuses(id) on delete set null,
  to_lead_id      uuid,
  rmp_from_rating numeric,
  rmp_from_num    integer,
  rmp_to_rating   numeric,
  rmp_to_num      integer,
  note            text,
  created_at      timestamptz default now()
);
-- Fast lookup of "incoming" moves still needing a destination lead.
create index if not exists faculty_moves_incoming_idx on public.faculty_moves (to_campus_id) where to_lead_id is null;
create index if not exists faculty_moves_from_campus_idx on public.faculty_moves (from_campus_id);

alter table public.faculty_moves enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='faculty_moves' and policyname='faculty_moves_all') then
    create policy faculty_moves_all on public.faculty_moves for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
