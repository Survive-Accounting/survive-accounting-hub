-- 20260830_1600_rep_program_v2.sql — REP PROGRAM V2 (manual-apply via Management API)
--
-- Lee's 08-30 spec: signup stays 4-field; the APPLICATION moves inside the workspace as an
-- onboarding flow (who you are → your org → your reach → how), completing it submits the rep for
-- review; Lee calls every applicant before approving; approval assigns the chapters their
-- coverage map opened and sets the campus-coverage flag (ifc / panhellenic / both / other) that
-- gates the campus at one rep by default, two max split by council.
--
-- Additive only; idempotent; existing ACTIVE reps are grandfathered as approved so no live
-- dashboard breaks mid-deploy.

-- ── 1. The application profile, on the canonical rep identity ─────────────────────────────────
alter table public.referral_partners
  add column if not exists application_status text
    check (application_status in ('setup','submitted','approved','waitlisted','declined')),
  add column if not exists rep_coverage text
    check (rep_coverage in ('ifc','panhellenic','both','other')),
  add column if not exists graduation_year int,
  add column if not exists course_status text
    check (course_status in ('taking_now','taken','not_yet')),
  add column if not exists own_chapter_id uuid references public.campus_greek_chapters(id),
  add column if not exists campus_roles jsonb not null default '[]'::jsonb,
  add column if not exists pitch text,
  add column if not exists onboarding_submitted_at timestamptz,
  add column if not exists call_at timestamptz,
  add column if not exists call_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- Grandfather: reps who were already ACTIVE before V2 keep working exactly as before (their
-- assignments/kits predate coverage maps). Everyone else starts at the setup screen.
update public.referral_partners
  set application_status = case when rep_status = 'active' then 'approved' else 'setup' end
  where type = 'campus_rep' and application_status is null;
alter table public.referral_partners alter column application_status set default 'setup';

-- ── 2. The coverage map — one row per chapter a rep says they can reach ───────────────────────
-- 'member' and 'knows_someone' only; "no connection" is the absence of a row. This is the
-- number Lee approves on, and later the source approval assigns chapters from.
create table if not exists public.rep_chapter_reach (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id),
  campus_greek_chapter_id uuid not null references public.campus_greek_chapters(id),
  reach text not null check (reach in ('member','knows_someone')),
  created_at timestamptz not null default now(),
  unique (partner_id, campus_greek_chapter_id)
);
create index if not exists rcr_partner_idx on public.rep_chapter_reach (partner_id);
alter table public.rep_chapter_reach enable row level security;

-- ── 3. The DM workflow, on the assignment (the rep's working row per chapter) ─────────────────
-- We supply the chapter's Instagram handle from enrichment; the rep sends from their own
-- account. Status is self-reported the same honest way house_posted is.
alter table public.rep_chapter_assignments
  add column if not exists dm_status text not null default 'not_contacted'
    check (dm_status in ('not_contacted','dm_sent','replied')),
  add column if not exists dm_sent_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_text text;

-- ── 4. New activity kinds for the V2 flow ─────────────────────────────────────────────────────
alter table public.rep_activity drop constraint if exists rep_activity_kind_check;
alter table public.rep_activity add constraint rep_activity_kind_check check (kind in (
  'contact_submitted','contact_verified','contact_qc_approved','contact_qc_rejected',
  'chapter_reserved','chapter_qualified','chapter_released',
  'share_kit_opened','share_kit_sms','share_kit_email','share_kit_shared',
  'link_copied','flyer_downloaded','qr_downloaded','house_posted',
  'chapter_claimed','admin_reassigned','admin_view_as','rep_login','rep_logout',
  'onboarding_submitted','application_approved','application_waitlisted','application_declined',
  'call_scheduled','dm_copied','dm_replied'
));
