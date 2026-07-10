-- 0052_parent_groups — Parent-group tracker (sibling to the Reddit dashboard).
--   • campuses.mascot already exists; add mascot_verified (seeds need Lee's OK)
--   • seed SEC mascots (only where unverified — never clobbers a confirmed value)
--   • parent_groups: manual inventory + engagement triage. NO Facebook automation
--     (links + hand-entered data only). Idempotent. After 0051. Anon-CRUD RLS.

alter table public.campuses add column if not exists mascot text;
alter table public.campuses
  add column if not exists mascot_verified boolean not null default false;

update public.campuses set mascot = v.m, mascot_verified = false
from (values
  ('e330e87c-5467-4c05-9d3d-6cd2398de036'::uuid, 'Tigers'),        -- Auburn
  ('698dd98f-dd92-46c1-8f28-e930568cb15d'::uuid, 'Tigers'),        -- LSU
  ('95246fc8-1ce6-409e-b454-d03c82766719'::uuid, 'Bulldogs'),      -- Mississippi State
  ('92e4a5d9-eeb3-4065-ac8a-5a4390fbc584'::uuid, 'Aggies'),        -- Texas A&M
  ('b3af67c6-99a5-4677-83d5-aa7d11a89c17'::uuid, 'Crimson Tide'),  -- Alabama
  ('e631c8de-37a3-4aae-a948-a64bd20ea4c5'::uuid, 'Razorbacks'),    -- Arkansas
  ('4c5126b1-3fe0-48fe-a1db-1e41d06e4642'::uuid, 'Gators'),        -- Florida
  ('3f570e37-5394-4058-baab-508948befedb'::uuid, 'Bulldogs'),      -- Georgia
  ('ae339230-577e-4569-a7d1-d1e45d1cfe91'::uuid, 'Wildcats'),      -- Kentucky
  ('7b92a320-b196-43f2-a241-77a0805816fe'::uuid, 'Rebels'),        -- Ole Miss
  ('f16686c2-edc6-43f8-9638-6890f52c829a'::uuid, 'Tigers'),        -- Missouri
  ('91e62f9c-43b0-41f3-a84d-002824754da6'::uuid, 'Sooners'),       -- Oklahoma
  ('5f5bd18d-b92f-4d56-aced-23bce4c983d5'::uuid, 'Gamecocks'),     -- South Carolina
  ('9c4775be-7d82-4a3e-840c-349c5e15d8e8'::uuid, 'Volunteers'),    -- Tennessee
  ('faad6039-be72-4f5c-8ad5-ca7b95e2889f'::uuid, 'Longhorns'),     -- Texas
  ('972451c3-bc5e-48d7-9f88-868a55378efa'::uuid, 'Commodores')     -- Vanderbilt
) as v(id, m)
where public.campuses.id = v.id and public.campuses.mascot_verified = false;

create table if not exists public.parent_groups (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid references public.campuses(id) on delete cascade,
  name              text,
  url               text,
  platform          text not null default 'facebook',
  member_count      integer,
  cohort            text,   -- class_of_2030 | class_of_2029 | class_of_2028 | general | other
  privacy           text,
  screening_notes   text,
  admin_notes       text,
  membership_status text not null default 'found',  -- found|requested|member|declined|ignored
  last_checked      date,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists parent_groups_campus_idx on public.parent_groups (campus_id);
create index if not exists parent_groups_status_idx on public.parent_groups (membership_status);

alter table public.parent_groups enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='parent_groups' and policyname='parent_groups_all') then
    create policy parent_groups_all on public.parent_groups for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
