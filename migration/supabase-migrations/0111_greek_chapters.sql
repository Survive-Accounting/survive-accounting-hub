-- 0111_greek_chapters.sql — Greek chapter self-serve: a signed-up fraternity/sorority chapter with a
-- shareable free-Exam-1 link, and its members. MANUAL-APPLY (project unvxagsledbsdoremqeb). Idempotent.
--
-- NOT the course `chapters` table — these are Greek chapters. One admin per chapter (fields on the row;
-- multi-admin deferred). Deny-by-default RLS: every write goes through a service-role server fn; the
-- dashboard reads through a magic-link-gated fn (matches auth email to admin_email). Never anon-writable.

create table if not exists public.greek_chapters (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique not null,               -- e.g. 'olemiss-ato' → surviveaccounting.com/c/<slug>
  campus_id              uuid references public.campuses(id) on delete set null,
  school_name            text not null,
  chapter_name           text not null,
  greek_org_id           uuid,                               -- GreekIntel greek_orgs match (null = free-text / no match)
  admin_name_role        text not null,                      -- "Jane Doe, Scholarship Chair"
  admin_email            text not null,                      -- magic-link identity for the dashboard
  admin_phone            text not null,                      -- E.164; SMS-verified before the link is minted
  phone_verified_at      timestamptz,                        -- null until the SMS code is confirmed
  verify_code            text,                               -- 6-digit code (cleared after verify)
  verify_expires_at      timestamptz,
  link_expires_at        timestamptz not null default (now() + interval '150 days'),  -- ~end of semester; admin can regenerate
  digest_enabled         boolean not null default true,      -- daily "N new members" email toggle
  needs_review           boolean not null default false,     -- TRUE = school/chapter didn't match GreekIntel (impersonation flag)
  status                 text not null default 'active' check (status in ('active', 'revoked')),
  created_at             timestamptz not null default now()
);
create index if not exists greek_chapters_admin_email_idx on public.greek_chapters(lower(admin_email));
create index if not exists greek_chapters_campus_idx on public.greek_chapters(campus_id);

create table if not exists public.greek_chapter_members (
  id             uuid primary key default gen_random_uuid(),
  chapter_id     uuid not null references public.greek_chapters(id) on delete cascade,
  name           text not null,
  phone          text,                                       -- E.164 (existing verification pattern; captured on claim)
  joined_at      timestamptz not null default now(),
  sets_completed int not null default 0                      -- coarse count; incremented as they finish sets
);
create index if not exists greek_chapter_members_chapter_idx on public.greek_chapter_members(chapter_id);

alter table public.greek_chapters        enable row level security;
alter table public.greek_chapter_members enable row level security;
-- No permissive public policies: anon/authenticated are denied. Writes/reads go through service-role
-- server fns (createGreekChapter / verifyChapterPhone / redeemChapterLink / getChapterDashboard).

notify pgrst, 'reload schema';
