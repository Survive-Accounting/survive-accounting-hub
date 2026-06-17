ALTER TABLE public.student_intake_submissions
ADD COLUMN IF NOT EXISTS accounting_major_status text
CHECK (accounting_major_status IN ('yes','no','definitely_not'));