ALTER TABLE public.student_intake_submissions
  ADD COLUMN IF NOT EXISTS greek_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS future_interests_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS syllabus_step_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_finished_at timestamptz;