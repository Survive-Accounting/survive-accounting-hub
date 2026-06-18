
-- Archive overnight auto-import: drop queue tables (no UI/code will reference them after this change)
DROP TABLE IF EXISTS public.outreach_faculty_batch_queue CASCADE;
DROP TABLE IF EXISTS public.outreach_faculty_batch_runs CASCADE;

-- Add RMP URL field on campuses (newline-separated, mirrors faculty_page_url)
ALTER TABLE public.campuses ADD COLUMN IF NOT EXISTS rmp_page_url text;

-- Add RMP enrichment columns on outreach_leads
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS rmp_rating numeric,
  ADD COLUMN IF NOT EXISTS rmp_num_ratings integer,
  ADD COLUMN IF NOT EXISTS rmp_would_take_again numeric,
  ADD COLUMN IF NOT EXISTS rmp_difficulty numeric,
  ADD COLUMN IF NOT EXISTS rmp_profile_url text,
  ADD COLUMN IF NOT EXISTS rmp_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS outreach_leads_rmp_difficulty_idx
  ON public.outreach_leads (rmp_difficulty DESC NULLS LAST)
  WHERE rmp_rating IS NOT NULL;
