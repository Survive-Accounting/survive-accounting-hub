ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS archived_by_lee boolean NOT NULL DEFAULT false;
ALTER TABLE public.student_intake_submissions ADD COLUMN IF NOT EXISTS archived_by_lee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS sms_messages_archived_idx ON public.sms_messages(archived_by_lee) WHERE archived_by_lee = false;
CREATE INDEX IF NOT EXISTS student_intake_archived_idx ON public.student_intake_submissions(archived_by_lee) WHERE archived_by_lee = false;