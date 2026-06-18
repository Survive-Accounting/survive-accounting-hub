ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS program_shorthand text;

COMMENT ON COLUMN public.campuses.program_shorthand IS
  'Short nickname for the accounting program (e.g. "Culver" for "Culver School of Business"). Used as the {program shorthand} merge tag in outreach emails.';