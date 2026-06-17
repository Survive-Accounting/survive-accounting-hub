
-- Phase 1: link SMS conversations to student intake submissions + onboarding tracking.

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS submission_id uuid
  REFERENCES public.student_intake_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sms_conversations_submission_idx
  ON public.sms_conversations(submission_id);

CREATE INDEX IF NOT EXISTS sms_conversations_short_ref_idx
  ON public.sms_conversations(short_ref);

ALTER TABLE public.student_intake_submissions
  ADD COLUMN IF NOT EXISTS onboarding_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_info_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS required_onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_reaction text,
  ADD COLUMN IF NOT EXISTS stress_factors text,
  ADD COLUMN IF NOT EXISTS future_interests text;
