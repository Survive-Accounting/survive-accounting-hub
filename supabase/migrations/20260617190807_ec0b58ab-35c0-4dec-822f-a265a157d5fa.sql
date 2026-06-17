
CREATE TABLE IF NOT EXISTS public.tutoring_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  syllabus_file_url TEXT,
  course_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewing','booking_link_sent','needs_more_info','not_a_fit','archived')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutoring_requests TO authenticated;
GRANT INSERT ON public.tutoring_requests TO anon;
GRANT ALL ON public.tutoring_requests TO service_role;

ALTER TABLE public.tutoring_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit tutoring requests"
  ON public.tutoring_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated can read tutoring requests"
  ON public.tutoring_requests FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can update tutoring requests"
  ON public.tutoring_requests FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete tutoring requests"
  ON public.tutoring_requests FOR DELETE
  USING (true);

CREATE TRIGGER tutoring_requests_set_updated_at
  BEFORE UPDATE ON public.tutoring_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX tutoring_requests_status_created_idx
  ON public.tutoring_requests (status, created_at DESC);
