CREATE UNIQUE INDEX IF NOT EXISTS campus_course_sections_unique_section_idx
  ON public.campus_course_sections (campus_id, course_code, section_number, term)
  WHERE section_number IS NOT NULL AND course_code IS NOT NULL;