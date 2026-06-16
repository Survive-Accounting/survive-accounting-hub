
CREATE TABLE public.student_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  school_name text,
  course_family text,
  course_code_or_name text,
  professor_name text,
  next_exam_date date,
  is_accounting_major boolean,
  is_greek_member boolean,
  greek_org_name text,
  how_did_you_hear_about_me text,
  notes text,
  syllabus_file_url text,
  syllabus_uploaded_at timestamptz,
  source text,
  source_campaign_id uuid,
  source_lead_id uuid,
  source_url_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  routing_result text CHECK (routing_result IN ('bookable_needs_syllabus','bookable_ready','waitlist_review','unsupported')),
  routing_reason text,
  booking_link_shown boolean NOT NULL DEFAULT false,
  waitlist_joined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_intake_submissions TO authenticated;
GRANT INSERT ON public.student_intake_submissions TO anon;
GRANT ALL ON public.student_intake_submissions TO service_role;

ALTER TABLE public.student_intake_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous students) can submit a new intake
CREATE POLICY "Anyone can insert intake submissions"
  ON public.student_intake_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated admins can read/update/delete (matches existing project pattern of admin-gated reads)
CREATE POLICY "Authenticated can read intake submissions"
  ON public.student_intake_submissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can update intake submissions"
  ON public.student_intake_submissions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete intake submissions"
  ON public.student_intake_submissions
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX idx_student_intake_submissions_email ON public.student_intake_submissions(email);
CREATE INDEX idx_student_intake_submissions_campus ON public.student_intake_submissions(campus_id);
CREATE INDEX idx_student_intake_submissions_created_at ON public.student_intake_submissions(created_at DESC);

CREATE TRIGGER trg_student_intake_submissions_updated_at
  BEFORE UPDATE ON public.student_intake_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
