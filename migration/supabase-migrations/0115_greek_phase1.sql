-- 0115_greek_phase1.sql — Greek vertical Phase 1. MANUAL-APPLY (project unvxagsledbsdoremqeb).
-- Idempotent. Extends the EXISTING Greek tables; creates no parallel chapter table.
--
-- AUDITED LIVE BEFORE WRITING (audit_greek_live.ts, re-run immediately before this file was final):
--
--   campus_greek_chapters  1,107 rows  (875 at the 16 is_sec campuses)  <- the public roster
--   greek_chapters             0 rows                                   <- 0111, applied, EMPTY
--   greek_chapter_members      0 rows                                   <- 0111, applied, EMPTY
--   chapters                  67 rows  <- COURSE content (course_id, topics_locked). NOT Greek.
--                                         Untouched by this migration.
--
-- Because both 0111 tables are empty, nothing below rewrites or orphans a single row.
--
-- WHY THIS SHAPE:
--
--   * The per-campus Greek rows ALREADY EXIST in campus_greek_chapters, so Phase 1 needs no seed
--     import — only a slug and a claim state on rows that are already there.
--
--   * 0111 modelled CLAIM-FIRST: greek_chapters.admin_name_role/admin_email/admin_phone are all
--     NOT NULL, so a chapter could not exist until an exec claimed it. Phase 1 needs the opposite —
--     a chapter is public and can bank members BEFORE anyone claims it. Those three constraints are
--     relaxed so an unclaimed shell row can exist; school_name / chapter_name / slug stay NOT NULL
--     because all three are fillable from the roster row at the moment the shell is created.
--
--   * 0111 modelled membership as a PARALLEL IDENTITY: greek_chapter_members was
--     (chapter_id, name, phone) with no account reference at all. The product invariant is one
--     account per student with chapter membership as an ATTRIBUTE, so the account link is added
--     here and the free-text identity columns become optional.
--
--   * user_id references auth.users(id) — CONFIRMED. `profiles` is live but has 0 rows and could
--     not report a shape, so auth.users is the only table that actually holds identity today.

-- ── 1. CANONICAL CHAPTER ROWS ────────────────────────────────────────────────────────────────
-- The public page is /go/<campus.slug>/<chapter.slug>. Both halves resolve from data that already
-- exists: campuses.slug for the school, and this new column for the chapter.
alter table public.campus_greek_chapters
  add column if not exists slug         text,
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists claimed_at   timestamptz;

do $$ begin
  alter table public.campus_greek_chapters
    add constraint campus_greek_chapters_claim_status_check
    check (claim_status in ('unclaimed', 'pending', 'claimed'));
exception when duplicate_object then null; end $$;

-- Unique WITHIN a campus, not globally: 'ato' exists at nearly every school and each is a distinct
-- chapter. Partial so rows still awaiting a slug do not collide with each other.
create unique index if not exists campus_greek_chapters_campus_slug_idx
  on public.campus_greek_chapters(campus_id, slug) where slug is not null;
create index if not exists campus_greek_chapters_claim_status_idx
  on public.campus_greek_chapters(claim_status);

-- ── 2. CHAPTERS CAN EXIST BEFORE THEY ARE CLAIMED ────────────────────────────────────────────
-- Relaxing the three admin columns is what allows an unclaimed shell greek_chapters row — created
-- the first time a student joins from a /go/ page, so members can bank against a chapter nobody has
-- claimed yet. Safe precisely because the table is empty; on a populated table this would need a
-- backfill first.
alter table public.greek_chapters alter column admin_name_role drop not null;
alter table public.greek_chapters alter column admin_email     drop not null;
alter table public.greek_chapters alter column admin_phone     drop not null;

-- ONE link between the roster row and the chapter record, in ONE direction. An earlier draft also
-- put greek_chapter_id on campus_greek_chapters; two FKs between the same two tables can disagree
-- with each other, so only this one exists.
alter table public.greek_chapters
  add column if not exists campus_greek_chapter_id uuid
    references public.campus_greek_chapters(id) on delete cascade,
  add column if not exists claim_status text not null default 'unclaimed';

do $$ begin
  alter table public.greek_chapters
    add constraint greek_chapters_claim_status_check
    check (claim_status in ('unclaimed', 'pending', 'claimed'));
exception when duplicate_object then null; end $$;

-- 0111's status check allowed only ('active','revoked'); a claim now has to be able to sit awaiting
-- Lee's approval.
alter table public.greek_chapters drop constraint if exists greek_chapters_status_check;
alter table public.greek_chapters
  add constraint greek_chapters_status_check check (status in ('active', 'revoked', 'pending'));

create unique index if not exists greek_chapters_campus_chapter_idx
  on public.greek_chapters(campus_greek_chapter_id) where campus_greek_chapter_id is not null;

-- ── 3. MEMBERSHIP IS AN ATTRIBUTE, NOT AN IDENTITY ───────────────────────────────────────────
-- user_id is the whole point of this migration: it is what makes a chapter tag an attribute of the
-- ONE student account rather than a second, parallel record of a person. name/phone become optional
-- because they were only ever a stand-in for an account that now exists.
alter table public.greek_chapter_members
  add column if not exists user_id          uuid references auth.users(id) on delete cascade,
  add column if not exists source           text not null default 'link',
  add column if not exists tagged_at        timestamptz not null default now(),
  add column if not exists seat_assigned_at timestamptz;

do $$ begin
  alter table public.greek_chapter_members
    add constraint greek_chapter_members_source_check
    check (source in ('link', 'self_report', 'exec_invite'));
exception when duplicate_object then null; end $$;

alter table public.greek_chapter_members alter column name drop not null;

-- ONE membership per (chapter, account). This index is the database-level guarantee behind the
-- "no duplicate member rows, ever" invariant — a second join from the same account is a no-op
-- upsert rather than a second row.
create unique index if not exists greek_chapter_members_chapter_user_idx
  on public.greek_chapter_members(chapter_id, user_id) where user_id is not null;
create index if not exists greek_chapter_members_user_idx
  on public.greek_chapter_members(user_id);

-- ── 4. PENDING CLAIMS (Phase 2a reads this; Phase 1 only writes it) ──────────────────────────
create table if not exists public.greek_chapter_claims (
  id                       uuid primary key default gen_random_uuid(),
  campus_greek_chapter_id  uuid not null references public.campus_greek_chapters(id) on delete cascade,
  name                     text not null,
  position                 text not null,   -- President / Treasurer / Academic chair / Advisor / Other
  email                    text not null,
  phone                    text not null,   -- E.164; the sms: deep link in Lee's alert uses this
  status                   text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  members_at_claim         int  not null default 0,  -- banked members, snapshotted for the alert
  created_at               timestamptz not null default now(),
  decided_at               timestamptz
);
create index if not exists greek_chapter_claims_status_idx  on public.greek_chapter_claims(status);
create index if not exists greek_chapter_claims_chapter_idx on public.greek_chapter_claims(campus_greek_chapter_id);

alter table public.greek_chapter_claims enable row level security;
-- Deny-by-default, matching 0111: every read/write goes through a service-role server fn. A claim
-- carries an exec's personal phone and email, so it is never anon-readable.

notify pgrst, 'reload schema';
