
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS replied_by_lee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS sms_messages_unreplied_inbound_idx ON public.sms_messages (created_at DESC) WHERE direction = 'in' AND replied_by_lee = false;

ALTER TABLE public.student_intake_submissions ADD COLUMN IF NOT EXISTS replied_by_lee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS sis_unreplied_syllabus_idx ON public.student_intake_submissions (created_at DESC) WHERE syllabus_file_url IS NOT NULL AND replied_by_lee = false;
