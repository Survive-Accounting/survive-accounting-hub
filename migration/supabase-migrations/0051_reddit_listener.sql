-- 0051_reddit_listener — Reddit listener v1 (LINK DASHBOARD; API-approval pending).
--   • campuses.subreddit already exists; add subreddit_verified (seeds need Lee's OK)
--   • seed best-guess SEC subreddits (only where not already set)
--   • reddit_mentions: triage table for posts Lee logs (manual quick-add now; the
--     gated Reddit-API fetch path upserts here later, dedupe by post_id)
-- Read-only listening. Idempotent. After 0050. Anon CRUD (AdminGate'd UI).

alter table public.campuses add column if not exists subreddit text;
alter table public.campuses
  add column if not exists subreddit_verified boolean not null default false;

-- Best-guess subreddit seeds for the SEC roster. Each stays unverified until Lee
-- confirms in admin. Applies to UNVERIFIED rows only — never overwrites a sub Lee
-- has confirmed (subreddit_verified = true).
update public.campuses set subreddit = v.sub, subreddit_verified = false
from (values
  ('e330e87c-5467-4c05-9d3d-6cd2398de036'::uuid, 'Auburn'),          -- Auburn University
  ('698dd98f-dd92-46c1-8f28-e930568cb15d'::uuid, 'LSU'),             -- Louisiana State University
  ('95246fc8-1ce6-409e-b454-d03c82766719'::uuid, 'mississippistate'),-- Mississippi State University
  ('92e4a5d9-eeb3-4065-ac8a-5a4390fbc584'::uuid, 'aggies'),          -- Texas A&M University
  ('b3af67c6-99a5-4677-83d5-aa7d11a89c17'::uuid, 'CrimsonTide'),     -- University of Alabama
  ('e631c8de-37a3-4aae-a948-a64bd20ea4c5'::uuid, 'UofArkansas'),     -- University of Arkansas
  ('4c5126b1-3fe0-48fe-a1db-1e41d06e4642'::uuid, 'UF'),              -- University of Florida
  ('3f570e37-5394-4058-baab-508948befedb'::uuid, 'UGA'),             -- University of Georgia
  ('ae339230-577e-4569-a7d1-d1e45d1cfe91'::uuid, 'UKY'),             -- University of Kentucky
  ('7b92a320-b196-43f2-a241-77a0805816fe'::uuid, 'olemiss'),         -- University of Mississippi
  ('f16686c2-edc6-43f8-9638-6890f52c829a'::uuid, 'mizzou'),          -- University of Missouri
  ('91e62f9c-43b0-41f3-a84d-002824754da6'::uuid, 'ou'),              -- University of Oklahoma
  ('5f5bd18d-b92f-4d56-aced-23bce4c983d5'::uuid, 'gamecocks'),       -- University of South Carolina
  ('9c4775be-7d82-4a3e-840c-349c5e15d8e8'::uuid, 'Tennessee'),       -- University of Tennessee, Knoxville
  ('faad6039-be72-4f5c-8ad5-ca7b95e2889f'::uuid, 'texas'),           -- University of Texas at Austin
  ('972451c3-bc5e-48d7-9f88-868a55378efa'::uuid, 'Vanderbilt')       -- Vanderbilt University
) as v(id, sub)
where public.campuses.id = v.id and public.campuses.subreddit_verified = false;

create table if not exists public.reddit_mentions (
  id            uuid primary key default gen_random_uuid(),
  campus_id     uuid references public.campuses(id) on delete cascade,
  subreddit     text,
  post_id       text not null unique,           -- Reddit t3 id — dedupe key
  url           text,
  title         text,
  snippet       text,                           -- first ~300 chars of selftext
  author        text,
  posted_at     timestamptz,
  matched_terms text[] not null default '{}',
  found_at      timestamptz not null default now(),
  status        text not null default 'new',    -- new | reviewed | engaged | ignored
  notes         text
);

create index if not exists reddit_mentions_campus_idx on public.reddit_mentions (campus_id);
create index if not exists reddit_mentions_status_idx on public.reddit_mentions (status);
create index if not exists reddit_mentions_posted_idx on public.reddit_mentions (posted_at desc);

alter table public.reddit_mentions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reddit_mentions' and policyname='reddit_mentions_all') then
    create policy reddit_mentions_all on public.reddit_mentions for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
