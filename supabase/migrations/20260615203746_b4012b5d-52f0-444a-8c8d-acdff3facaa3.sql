ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN IF NOT EXISTS teaches_intro_1 boolean,
  ADD COLUMN IF NOT EXISTS teaches_intro_2 boolean,
  ADD COLUMN IF NOT EXISTS teaches_intermediate_1 boolean,
  ADD COLUMN IF NOT EXISTS teaches_intermediate_2 boolean,
  ADD COLUMN IF NOT EXISTS courses_found jsonb,
  ADD COLUMN IF NOT EXISTS teaching_evidence_url text,
  ADD COLUMN IF NOT EXISTS teaching_evidence_notes text;