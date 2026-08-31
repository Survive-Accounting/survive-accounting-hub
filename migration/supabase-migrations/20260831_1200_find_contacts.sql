-- 20260831_1200_find_contacts.sql — IN-APP CONTACT FINDING (manual-apply)
--
-- King's workflow was: dashboard → copy prompt → Gemini → copy links → Claude → xlsx →
-- verify → paste back. We have an AI gateway, so it becomes: click Find contacts →
-- review table → import. Two model calls, one review step.
--
-- This migration adds only what the REVIEW and the VERIFICATION need. It creates no new
-- contact store: council officers keep landing in campus_council_contacts, which already
-- carries name/role/email/phone/instagram_url/source_url/confidence.
--
-- Idempotent. Additive only.

-- ── 1. Provenance + human verification on the contact itself ─────────────────────────────────
-- A model that fetched a page is NOT the same as a person confirming the handle belongs to that
-- person, so verification is stored as WHO and WHEN, never as a boolean the importer can set.
alter table public.campus_council_contacts
  add column if not exists created_by text,
  -- how the handle was obtained: 'listed' (printed on the council page) | 'found' (located by
  -- search, needs a human) | null (not found). Never a guess constructed from a name.
  add column if not exists instagram_source text
    check (instagram_source in ('listed','found','manual')),
  add column if not exists instagram_confidence text
    check (instagram_confidence in ('high','low')),
  add column if not exists ig_verified_at timestamptz,
  add column if not exists ig_verified_by text,
  add column if not exists source_checked_at timestamptz,
  add column if not exists source_checked_by text;

-- ── 2. One row per Find-contacts run — cost, tokens, and what it produced ─────────────────────
-- Cost comes straight from the gateway's usage.cost, so the running total in the enrichment
-- header is the real number rather than a local estimate that drifts from the invoice.
create table if not exists public.find_contact_runs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  step text not null check (step in ('councils','officers')),
  model text not null,
  ok boolean not null default true,
  error text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  from_cache boolean not null default false,
  results_count int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists fcr_campus_idx on public.find_contact_runs (campus_id, created_at desc);

-- ── 3. The Instagram auto-find scoreboard ────────────────────────────────────────────────────
-- Records whether a 'found' handle was CONFIRMED or CLEARED by a person. After a few campuses
-- this is what says whether the automatic attempt earns its tokens or should be switched off in
-- favour of the manual paste path. Confirmations are also derivable from ig_verified_at, but a
-- CLEARED handle erases itself from the contact row — so the outcome needs its own record.
create table if not exists public.ig_find_outcomes (
  id bigint generated always as identity primary key,
  campus_id uuid references public.campuses(id),
  contact_id uuid,
  outcome text not null check (outcome in ('confirmed','cleared','manual')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists ifo_campus_idx on public.ig_find_outcomes (campus_id, created_at desc);

-- Deny-by-default, like every other growth table: access is via server functions on the
-- service role only.
alter table public.find_contact_runs enable row level security;
alter table public.ig_find_outcomes enable row level security;
