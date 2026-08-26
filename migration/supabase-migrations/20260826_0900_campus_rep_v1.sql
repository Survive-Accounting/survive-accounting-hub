-- 20260826_0900_campus_rep_v1.sql — CAMPUS REP V1 (manual-apply via Management API)
--
-- Extends the EXISTING referral engine + contact intelligence for the campus-rep workflow.
-- Deliberately additive-only: no existing column is altered, no data rewritten.
--
-- The consolidation law this encodes (per REP_SYSTEM_PREBUILD_AUDIT):
--   · a rep IS a referral_partners row (type='campus_rep') — no new rep identity table
--   · chapter-keyed rep records FK to campus_greek_chapters (the 6,896-row directory),
--     NEVER greek_chapters (the 5-row claimed-exec shell)
--   · money stays in referral_conversions/referral_commissions; rep_activity is NON-monetary
--   · rep-submitted contacts land in growth_public_contacts + growth_contact_qc (pending),
--     never a parallel rep_contacts table
--
-- Idempotent: safe to re-run.

-- ── 1. Rep lifecycle on the canonical rep identity ────────────────────────────────────────────
-- rep_status is the REP lifecycle (applicant → approved → active …); the existing `status`
-- column stays the ENGINE switch (active/paused/archived) that gates link resolution. The server
-- keeps them in sync; separating them means pausing a rep can't be confused with archiving a
-- partner of another type.
alter table public.referral_partners
  add column if not exists rep_status text
    check (rep_status in ('applied','approved','active','paused','deactivated')),
  add column if not exists phone_verified_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

-- ── 2. Rep × chapter becomes FIRST-CLASS on links ─────────────────────────────────────────────
-- The audit's #1 structural gap: chapter identity was only ever parsed out of destination_url.
alter table public.referral_links
  add column if not exists campus_greek_chapter_id uuid references public.campus_greek_chapters(id);
create index if not exists referral_links_chapter_idx
  on public.referral_links (campus_greek_chapter_id) where campus_greek_chapter_id is not null;

-- ── 3. rep_chapter_assignments — the sourcing-credit spine ────────────────────────────────────
-- One row = "this rep sourced this chapter this term". Created when a rep submits/verifies a
-- usable contact (RESERVED), upgraded when that contact passes QC (QUALIFIED). The partial unique
-- index is the race gate: ONE live assignment per chapter × term, first insert wins, the loser's
-- insert errors and the server reports "already reserved".
create table if not exists public.rep_chapter_assignments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id),
  campus_greek_chapter_id uuid not null references public.campus_greek_chapters(id),
  term_id text not null,                          -- terms.ts: 'fall-2026'
  status text not null default 'reserved'
    check (status in ('reserved','qualified','expired','reassigned','revoked')),
  sourced_contact_id uuid references public.growth_public_contacts(id),
  referral_link_id uuid references public.referral_links(id),
  reserved_at timestamptz not null default now(),
  qualified_at timestamptz,
  expired_at timestamptz,
  reassigned_at timestamptz,
  revoked_at timestamptz,
  is_test boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists rca_chapter_term_live_uidx
  on public.rep_chapter_assignments (campus_greek_chapter_id, term_id)
  where status in ('reserved','qualified');
create index if not exists rca_partner_idx on public.rep_chapter_assignments (partner_id);
create index if not exists rca_chapter_idx on public.rep_chapter_assignments (campus_greek_chapter_id);

-- ── 4. rep_activity — the non-monetary operational ledger ─────────────────────────────────────
-- Money NEVER lands here (that is referral_conversions/commissions). This answers "what has this
-- rep actually done", including self-reported events that must not be conflated with verified
-- ones (house_posted is self-reported by design).
create table if not exists public.rep_activity (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.referral_partners(id),
  campus_greek_chapter_id uuid references public.campus_greek_chapters(id),
  growth_contact_id uuid references public.growth_public_contacts(id),
  referral_link_id uuid references public.referral_links(id),
  kind text not null check (kind in (
    'contact_submitted','contact_verified','contact_qc_approved','contact_qc_rejected',
    'chapter_reserved','chapter_qualified','chapter_released',
    'share_kit_opened','share_kit_sms','share_kit_email','share_kit_shared',
    'link_copied','flyer_downloaded','qr_downloaded','house_posted',
    'chapter_claimed','admin_reassigned','admin_view_as','rep_login','rep_logout'
  )),
  meta jsonb not null default '{}'::jsonb,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rep_activity_partner_idx on public.rep_activity (partner_id, created_at desc);
create index if not exists rep_activity_chapter_idx on public.rep_activity (campus_greek_chapter_id)
  where campus_greek_chapter_id is not null;

-- ── 5. Rep submission lands in the CANONICAL contact store ────────────────────────────────────
-- growth_public_contacts gains the smallest fields the rep workflow needs: a phone (E.164,
-- reps often only have a number) and provenance to the submitting rep. source_type for these rows
-- is 'rep_submission' (the column is free-vocabulary text; no constraint to widen).
alter table public.growth_public_contacts
  add column if not exists phone text,
  add column if not exists submitted_by_partner_id uuid references public.referral_partners(id);
-- A rep submission has no source page — its provenance IS the rep (submitted_by_partner_id +
-- source_type='rep_submission'). The NOT NULL was a scraper-era assumption; relax it rather than
-- invent fake URLs.
alter table public.growth_public_contacts alter column source_url drop not null;
create index if not exists gpc_submitted_by_idx
  on public.growth_public_contacts (submitted_by_partner_id) where submitted_by_partner_id is not null;

-- ── 6. Chapter claim carries sourcing attribution ─────────────────────────────────────────────
-- Stamped at claim submit when the chapter has a live assignment for the current term. The claim
-- then appears in the sourcing rep's stats without the rep ever being responsible for it.
alter table public.greek_chapter_claims
  add column if not exists sourcing_partner_id uuid references public.referral_partners(id),
  add column if not exists sourcing_assignment_id uuid references public.rep_chapter_assignments(id);

-- ── 7. Small additive study attribution (audit §22 — deliberately minimal) ────────────────────
-- practice_attempts learns the ref code from the sa_ref cookie at write time (best-effort,
-- nullable, no join at write). This makes questions-answered/study-time attributable to a
-- link → partner going FORWARD without redesigning the learning-event architecture.
alter table public.practice_attempts
  add column if not exists ref_code text;

-- ── 8. RLS: deny-by-default like every other referral/growth table ────────────────────────────
-- No policies on purpose — all access is via server functions on the service role.
alter table public.rep_chapter_assignments enable row level security;
alter table public.rep_activity enable row level security;
