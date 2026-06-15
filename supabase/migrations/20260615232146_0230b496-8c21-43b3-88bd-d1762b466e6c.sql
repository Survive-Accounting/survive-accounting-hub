DROP INDEX IF EXISTS public.campus_course_sections_unique_section_idx;
CREATE UNIQUE INDEX campus_course_sections_unique_section_idx
  ON public.campus_course_sections (campus_id, course_code, section_number, term);