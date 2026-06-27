-- 0034_greek_phase1_schema.sql
-- Greek vertical, Phase 1 schema COMPLETION. The backbone already exists:
--   * greek_orgs            — 105 national orgs already seeded (NPC/NIC/NPHC).
--   * campus_greek_chapters — org+campus chapters (designation, status, urls).
--   * verticals.ts          — the "greek" vertical is already registered.
-- This migration adds the MISSING anti-hallucination + lead/health columns so
-- Phases 2-4 (research) can store data SAFELY: every researched datum carries a
-- source + confidence, and any row with research-derived contact info is flagged
-- needs_verification. NEVER fabricate — null/'unavailable' over a guess.
-- Idempotent. Numbered 0034 to avoid colliding with the design branch's 0032/0033.

-- ---------- chapter-level research fields (additive) ----------
alter table public.campus_greek_chapters
  add column if not exists confidence         text default 'unverified', -- verified | likely | unverified
  add column if not exists needs_verification boolean default false,
  add column if not exists research_source    text,
  add column if not exists research_meta      jsonb,   -- per-field {field: {source, confidence}}
  -- Phase 3 lead/marketing data (each null until found in a real public source):
  add column if not exists website_url        text,
  add column if not exists instagram_url      text,
  add column if not exists facebook_url       text,
  add column if not exists tiktok_url         text,
  add column if not exists phone              text,
  add column if not exists mailing_address    text,
  add column if not exists greek_rank         text,
  add column if not exists chapter_size       integer,
  add column if not exists gpa                numeric(4,3),
  add column if not exists gpa_year           integer,
  add column if not exists gpa_history        jsonb,   -- [{year, gpa}] — 2-3 yrs if publicly published
  add column if not exists on_probation       boolean,
  add column if not exists trending_down      boolean,
  add column if not exists public_notes       text;

-- ---------- the people (Phase 4) — contacts to eventually email ----------
create table if not exists public.greek_chapter_contacts (
  id                 uuid primary key default gen_random_uuid(),
  chapter_id         uuid not null references public.campus_greek_chapters(id) on delete cascade,
  role               text not null,        -- president | treasurer | academic_advisor | alumni_advisor
  name               text,
  email              text,
  phone              text,
  source             text,                 -- where it came from (URL / page)
  confidence         text default 'unverified',  -- verified | likely | unverified
  needs_verification boolean default true, -- research-derived contact info: ALWAYS verify before outreach
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists greek_chapter_contacts_chapter_idx on public.greek_chapter_contacts (chapter_id);
create index if not exists greek_chapter_contacts_role_idx on public.greek_chapter_contacts (role);
create index if not exists campus_greek_chapters_needs_verif_idx on public.campus_greek_chapters (needs_verification);

notify pgrst, 'reload schema';
