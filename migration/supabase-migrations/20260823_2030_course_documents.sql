-- Course Intel — syllabus/course-document discovery.
-- course_document: one row per PUBLIC document we discovered for a campus/prof
--   (syllabus, study guide, schedule, ...). Hash + timestamps so re-runs skip
--   unchanged docs (don't re-pay to parse). Only bibliographic/structural
--   signals are derived; no copyrighted prose is stored.
-- course_evidence: derived structured signals from a document (exam→chapter
--   ranges, textbook references) that feed the exam→topic mapping.
begin;

create table if not exists public.course_document (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid null references public.campuses(id) on delete cascade,
  professor_name text null,
  course_code text null,
  course_family text null default 'intro_1',
  document_type text not null default 'unknown',  -- syllabus|study_guide|schedule|homework|lecture|catalog|faculty_page|practice_exam|unknown
  value_tier int not null default 4,              -- 1 exam-evidence .. 4 identity
  title text null,
  source_url text not null,
  source_domain text null,
  file_type text null,                            -- pdf|html|docx|pptx
  textbook_id uuid null references public.textbooks(id) on delete set null,
  content_hash text null,
  is_public_source boolean not null default true,
  access text not null default 'public',          -- public|blocked
  processing_status text not null default 'discovered', -- discovered|fetched|parsed|error|skipped
  term text null,
  year int null,
  first_seen timestamptz not null default now(),
  last_checked timestamptz null,
  last_changed timestamptz null,
  discovered_by text null,                        -- serp|firecrawl_map|manual
  notes text null,
  unique (campus_id, source_url)
);
create index if not exists course_document_campus_idx on public.course_document (campus_id);
create index if not exists course_document_status_idx on public.course_document (processing_status);
alter table public.course_document enable row level security;

create table if not exists public.course_evidence (
  id uuid primary key default gen_random_uuid(),
  course_document_id uuid null references public.course_document(id) on delete cascade,
  campus_id uuid null,
  professor_name text null,
  course_family text null default 'intro_1',
  evidence_type text not null,                    -- exam_chapter_range|textbook_reference|topic_signal|schedule
  exam_label text null,                           -- "exam 1"
  exam_chapters jsonb null,                       -- [1,2,3]
  textbook_ref text null,
  edition_ref text null,
  raw_text text null,
  confidence text not null default 'Medium',      -- High|Medium|Low
  effective_term text null,
  superseded_by uuid null references public.course_evidence(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists course_evidence_document_idx on public.course_evidence (course_document_id);
create index if not exists course_evidence_campus_idx on public.course_evidence (campus_id);
alter table public.course_evidence enable row level security;

commit;
