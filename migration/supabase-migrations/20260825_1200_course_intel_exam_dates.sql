-- Course Intel — exam-date fields for the schedule-date extractor (parse-only pass).
-- Additive columns on the existing aggregate. No discovery, no student-map changes.
alter table public.course_intel_campus_status
  add column if not exists exam_1_date            date,
  add column if not exists exam_1_date_confidence text,   -- HIGH | MEDIUM | LOW
  add column if not exists exam_1_date_source_url text,
  add column if not exists exam_1_date_term       text,   -- e.g. "Fall 2026"
  add column if not exists problem_topics_found   int not null default 0;

-- Per-document exam-date + problem/topic evidence reuse the existing course_evidence
-- table via new evidence_type values ('exam_date','topic_signal') — no schema change there.
