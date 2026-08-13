-- 0088_scene_folders.sql
-- WORKSPACE CHROME: scene folders = course groups. Folders are their own rows
-- (Lee can create/rename arbitrary ones); the five seeded folders map onto the
-- real course spine via course_id, which is what lets a folder assignment also
-- set the scene's course context. Scenes with folder_id null live in the
-- virtual "Unfiled" bucket (all existing scenes land there — no data touched).
-- Deny-by-default RLS, service-role access only (same posture as canvas_scenes).
-- Idempotent; safe to re-run.

create table if not exists public.canvas_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid references public.courses(id) on delete set null,
  sort integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.canvas_folders enable row level security;

alter table public.canvas_scenes
  add column if not exists folder_id uuid references public.canvas_folders(id) on delete set null;

-- Seed the five course folders (idempotent by course_family; names match the spine)
insert into public.canvas_folders (name, course_id, sort)
select v.name, co.id, v.sort
from (values
  ('Foundations', 'foundations', 10),
  ('Intro 1',     'intro1',      20),
  ('Intro 2',     'intro2',      30),
  ('IA1',         'ia1',         40),
  ('IA2',         'ia2',         50)
) as v(name, family, sort)
join public.courses co on co.course_family = v.family
where not exists (
  select 1 from public.canvas_folders f where f.course_id = co.id
);
