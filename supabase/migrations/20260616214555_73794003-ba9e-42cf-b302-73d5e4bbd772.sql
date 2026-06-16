
-- Anyone can upload a syllabus (form is public)
CREATE POLICY "Anyone can upload student syllabi"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'student-syllabi');

-- Only authenticated (admin) users can read
CREATE POLICY "Authenticated can read student syllabi"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'student-syllabi');

-- Only authenticated (admin) users can delete
CREATE POLICY "Authenticated can delete student syllabi"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'student-syllabi');
