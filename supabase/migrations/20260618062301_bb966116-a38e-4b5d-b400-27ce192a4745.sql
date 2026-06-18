ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS has_bachelors_accounting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_masters_accounting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_phd_accounting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS program_levels_evidence jsonb;