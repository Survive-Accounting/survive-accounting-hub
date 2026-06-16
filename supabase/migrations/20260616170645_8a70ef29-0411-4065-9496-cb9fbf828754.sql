
-- Phase 3: Clean Professor Research mode
-- Add research_mode tagging to lead suggestions and batch jobs.

ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN IF NOT EXISTS research_mode text NOT NULL DEFAULT 'broad',
  ADD COLUMN IF NOT EXISTS research_label text;

-- Backfill: anything created before this migration is part of the broad run.
UPDATE public.campus_lead_suggestions
   SET research_mode = 'broad'
 WHERE research_mode IS NULL;

CREATE INDEX IF NOT EXISTS campus_lead_suggestions_research_mode_idx
  ON public.campus_lead_suggestions (research_mode);

ALTER TABLE public.campus_research_jobs
  ADD COLUMN IF NOT EXISTS research_mode text NOT NULL DEFAULT 'broad';
