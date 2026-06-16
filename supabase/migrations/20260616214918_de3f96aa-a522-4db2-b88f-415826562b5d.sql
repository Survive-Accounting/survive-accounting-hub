
ALTER TABLE public.outreach_settings
  ADD COLUMN IF NOT EXISTS square_booking_url text,
  ADD COLUMN IF NOT EXISTS square_booking_url_intro_1 text,
  ADD COLUMN IF NOT EXISTS square_booking_url_intro_2 text,
  ADD COLUMN IF NOT EXISTS square_booking_url_intermediate_1 text,
  ADD COLUMN IF NOT EXISTS square_booking_url_intermediate_2 text;

ALTER TABLE public.student_intake_submissions
  ADD COLUMN IF NOT EXISTS notification_log jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.campus_course_availability
  ADD COLUMN IF NOT EXISTS booking_url text;
