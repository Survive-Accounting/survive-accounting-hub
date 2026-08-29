-- CHAPTER PASS 2 (K3 + K5) — two additive columns and one log table.
--
-- ONE CONCERN PER FILE is the house rule, and this is deliberately one concern: "the claim
-- engine's new state". The intent column and the report log ship together because the signup
-- report emails (K5) are only ever sent to a chapter that claimed (K3) — applying one without
-- the other leaves a half-built feature that gates itself off loudly either way.
--
-- Additive only. Nothing here rewrites or drops existing data.

BEGIN;

-- ── K3: LEAD SCORING ─────────────────────────────────────────────────────────────────────────
-- Where the chapter said it was at, in its own words, at the moment it claimed:
--   committed  — "We're ready to sponsor seats"   (Lee is alerted immediately and closes it)
--   curious    — "Tell me more first"
--   exploring  — "Just exploring for now"
-- NULL means the claim predates this column. Never shown back to the exec as a score.
ALTER TABLE public.greek_chapter_claims
  ADD COLUMN IF NOT EXISTS intent text;

-- Constrained rather than free text: three answers, and a typo should fail loudly at write time
-- instead of quietly becoming a fourth bucket nobody notices. Dropped-by-discovered-name first so
-- the file is safe to run twice.
DO $$
DECLARE conname text;
BEGIN
  SELECT c.conname INTO conname FROM pg_constraint c
   WHERE c.conrelid = 'public.greek_chapter_claims'::regclass AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%intent%'
   LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.greek_chapter_claims DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.greek_chapter_claims
  ADD CONSTRAINT greek_chapter_claims_intent_check
  CHECK (intent IS NULL OR intent IN ('committed', 'curious', 'exploring'));

-- ── K5: SIGNUP REPORT SEND LOG ───────────────────────────────────────────────────────────────
-- One row per email actually sent, so a chapter can never be told the same news twice: the surge
-- report is capped at one per chapter per 24h and the weekly digest at one per chapter per week.
-- This table IS the dedupe key — without it the cron would re-send on every run.
CREATE TABLE IF NOT EXISTS public.chapter_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_greek_chapter_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('surge', 'weekly')),
  -- The window this report covered, so a re-run for the same week is recognisably the same report.
  period_key text NOT NULL,
  -- What we told them, kept for support ("you said 12 — where did that come from?").
  signups integer NOT NULL DEFAULT 0,
  sent_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The dedupe itself. One (chapter, kind, period) may be sent exactly once.
CREATE UNIQUE INDEX IF NOT EXISTS chapter_report_sends_unique
  ON public.chapter_report_sends (campus_greek_chapter_id, kind, period_key);

CREATE INDEX IF NOT EXISTS chapter_report_sends_recent
  ON public.chapter_report_sends (campus_greek_chapter_id, created_at DESC);

COMMIT;

-- PROOF, not a comment claiming success: both must return a row.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'greek_chapter_claims' AND column_name = 'intent';

SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'chapter_report_sends';
