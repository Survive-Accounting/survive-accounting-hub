-- 0105_campus_exams.sql — per-campus EXAM → TOPIC(chapter) maps [SEC exam-topics secret sauce]
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- THE SECRET SAUCE. For a specific CAMPUS + COURSE (Intro 1), the exams that campus actually gives
-- (Exam 1 / Exam 2 / Final) and which TOPICS (= chapters) each exam covers — i.e. what Ole Miss's
-- or LSU's real Intro-1 exams test. This is distinct from exam_units (0102), which is course-level
-- and generic; these are campus-specific and researched per school. KING builds these per campus
-- across the SEC, prioritised by business-school size.
--
-- Additive: chapters, courses, campuses and the CEQ-set model are untouched. A campus's LOCAL
-- chapter number stays in campus_chapter_overrides (0103); this table only says which chapters land
-- on which exam. "Topic" = a chapters row (the live v2 spine), matching the outline.

create table if not exists public.campus_exams (
  id         uuid primary key default gen_random_uuid(),
  campus_id  uuid not null references public.campuses(id) on delete cascade,
  course_id  uuid not null references public.courses(id)  on delete cascade,
  name       text not null,                 -- "Exam 1", "Midterm", "Final"
  position   numeric,                        -- order within the campus+course (nullable)
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists campus_exams_campus_course_idx on public.campus_exams(campus_id, course_id);

create table if not exists public.campus_exam_topics (
  campus_exam_id uuid not null references public.campus_exams(id) on delete cascade,
  chapter_id     uuid not null references public.chapters(id)     on delete cascade,
  position       numeric,                     -- optional topic order within the exam
  primary key (campus_exam_id, chapter_id)
);
create index if not exists campus_exam_topics_chapter_idx on public.campus_exam_topics(chapter_id);

alter table public.campus_exams       enable row level security;
alter table public.campus_exam_topics enable row level security;

-- READ open to anon + authenticated (exam→topic maps aren't sensitive; mirrors the exam_units
-- grant in 0102). WRITES have no policy → denied for anon/authenticated; all authoring goes through
-- the service-role server fns in campus-exams.functions.ts, which bypass RLS.
drop policy if exists "anon read campus_exams" on public.campus_exams;
create policy "anon read campus_exams" on public.campus_exams for select to anon using (true);
drop policy if exists "auth read campus_exams" on public.campus_exams;
create policy "auth read campus_exams" on public.campus_exams for select to authenticated using (true);

drop policy if exists "anon read campus_exam_topics" on public.campus_exam_topics;
create policy "anon read campus_exam_topics" on public.campus_exam_topics for select to anon using (true);
drop policy if exists "auth read campus_exam_topics" on public.campus_exam_topics;
create policy "auth read campus_exam_topics" on public.campus_exam_topics for select to authenticated using (true);
