CREATE TABLE public.campus_course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  course_family text,
  course_code text,
  course_title text,
  term text,
  section_number text,
  instructor_name text,
  instructor_email text,
  meeting_days text,
  meeting_time text,
  location text,
  enrollment_current integer,
  enrollment_capacity integer,
  waitlist_count integer,
  source_url text,
  confidence text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_course_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_course_sections TO anon;
GRANT ALL ON public.campus_course_sections TO service_role;

ALTER TABLE public.campus_course_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all campus_course_sections" ON public.campus_course_sections
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all campus_course_sections" ON public.campus_course_sections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_ccs_campus ON public.campus_course_sections(campus_id);
CREATE INDEX idx_ccs_family ON public.campus_course_sections(course_family);
CREATE INDEX idx_ccs_code ON public.campus_course_sections(course_code);
CREATE INDEX idx_ccs_instructor ON public.campus_course_sections(instructor_name);
CREATE INDEX idx_ccs_term ON public.campus_course_sections(term);

CREATE TRIGGER set_updated_at_campus_course_sections
  BEFORE UPDATE ON public.campus_course_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();