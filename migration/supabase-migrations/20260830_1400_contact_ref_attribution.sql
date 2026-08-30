-- CONTACT REFERRAL ATTRIBUTION (2026-08-30) — the `?ref=` visit log, plus two flags on the
-- contact record.
--
-- ONE CONCERN: "which contacts actually move". The visit table and the two booleans ship together
-- because the Engaged Contacts view reads all three, and half of it would be a view that sorts
-- by a score it cannot compute.
--
-- ── THIS IS NOT THE REP REFERRAL SYSTEM ───────────────────────────────────────────────────────
-- referral_links / referral_clicks belong to campus reps and feed commission. This table is the
-- COLD CONTACT equivalent and must never be joined into a payout: a rep link's ?ref= is a short
-- code, a contact's is a uuid, and lib/contact-ref.ts refuses to claim anything that is not a
-- uuid. Rep links win, always.
--
-- Additive only. Nothing here rewrites or drops existing data.

BEGIN;

-- ── THE VISIT LOG ────────────────────────────────────────────────────────────────────────────
-- One row per page view that carried a ref. This is how a forwarded link becomes visible: a
-- council officer pastes her tagged message into a presidents' group chat and every chapter that
-- opens it lands here against HER contact id.
CREATE TABLE IF NOT EXISTS public.contact_ref_visit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- The contact whose message produced this visit. Not a foreign key: growth_contact_qc rows are
  -- rebuilt by the enrichment passes, and a visit that outlives its contact row is still evidence
  -- that the link worked.
  contact_id uuid NOT NULL,
  campus_id uuid,

  -- Where they landed, so "chapter pages opened" is countable without guessing from a referrer.
  path text NOT NULL,
  -- 'chapter' | 'council' | 'campus' | 'other' — derived at write time from the path, so the
  -- view never has to parse URLs to count.
  surface text NOT NULL DEFAULT 'other',

  -- A first-party random id in a cookie, NOT an IP and NOT a fingerprint: enough to say "two
  -- visits, one person" without storing anything identifying about someone who never signed up.
  anon_id text,

  -- Link previewers (Slack, iMessage, WhatsApp, Meta) fetch every URL that gets pasted. Counting
  -- those as opens would make every forwarded message look like a hit.
  is_bot boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS contact_ref_visit_contact
  ON public.contact_ref_visit (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_ref_visit_campus
  ON public.contact_ref_visit (campus_id) WHERE campus_id IS NOT NULL;

-- Unique-visitor counting reads (contact_id, anon_id); this makes that a scan of one index.
CREATE INDEX IF NOT EXISTS contact_ref_visit_unique
  ON public.contact_ref_visit (contact_id, anon_id) WHERE is_bot = false;

-- ── THE TWO FLAGS ────────────────────────────────────────────────────────────────────────────
-- Same shape as is_role_account (20260830_1300): a plain boolean on the contact record, set by
-- hand from the Engaged Contacts view.

-- The rep pipeline is NOT built in this pass. This only makes it possible to mark someone now so
-- the list exists when it is.
ALTER TABLE public.growth_contact_qc
  ADD COLUMN IF NOT EXISTS rep_candidate boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.growth_contact_qc.rep_candidate IS
  'Flagged by hand as a possible campus rep. Storage only — no pipeline reads this yet.';

-- LEE'S THEORY, STORED SO IT CAN BE CHECKED. He believes the contacts he speaks to by phone
-- become the most engaged. This column exists so that is answerable from data in November
-- instead of arguable.
ALTER TABLE public.growth_contact_qc
  ADD COLUMN IF NOT EXISTS spoke_by_phone boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.growth_contact_qc.spoke_by_phone IS
  'True when Lee has actually spoken to this contact by phone. Exists to test whether phone contact predicts engagement.';

COMMIT;

-- PROOF, not a comment claiming success: all three must return 1.
SELECT 'contact_ref_visit table' AS proof, count(*)::text AS found
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'contact_ref_visit'
UNION ALL
SELECT 'rep_candidate column', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'growth_contact_qc' AND column_name = 'rep_candidate'
UNION ALL
SELECT 'spoke_by_phone column', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'growth_contact_qc' AND column_name = 'spoke_by_phone';
