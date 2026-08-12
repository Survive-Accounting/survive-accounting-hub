-- 0113_map_resolution.sql — MANUAL-APPLY. Paste into the Supabase SQL editor (project unvxagsledbsdoremqeb).
-- MAP RESOLUTION LAYER: professor maps, the Starter Map, map status, textbooks, inbound files,
-- provenance. Core idea: COPY-ON-WRITE inheritance — maps don't exist until something differs;
-- resolution walks professor → campus → Starter Map. Idempotent (safe to re-run).
--
-- Levels live in campus_exams via two nullable keys:
--   professor map : campus_id = <campus>, professor_id = <roster id>
--   campus map    : campus_id = <campus>, professor_id IS NULL
--   STARTER MAP   : campus_id IS NULL,   professor_id IS NULL
-- 'inherited' is COMPUTED (no rows at a level), never stored.

begin;

-- 1) PROFESSOR MAPS — campus_exams gains professor_id (roster id from campus_lead_suggestions;
--    soft reference, no FK — that table is ProfIntel-owned).
alter table public.campus_exams add column if not exists professor_id uuid null;

-- 2) STARTER MAP — campus_id becomes nullable; starter rows are campus_id IS NULL.
alter table public.campus_exams alter column campus_id drop not null;

-- 3) MAP META — status + textbook per (course, campus, professor) map. status is only ever
--    'edited' | 'verified'; a map with no rows is 'inherited' by computation.
create table if not exists public.map_meta (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  campus_id uuid null,
  professor_id uuid null,
  status text not null default 'edited' check (status in ('edited','verified')),
  textbook_id uuid null,
  chapter_labels_on boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists map_meta_scope_uq
  on public.map_meta (course_id, coalesce(campus_id, '00000000-0000-0000-0000-000000000000'), coalesce(professor_id, '00000000-0000-0000-0000-000000000000'));
alter table public.map_meta enable row level security; -- deny-by-default; service-role only

-- 4) TEXTBOOKS — chapter labels keyed on CHAPTER IDENTITY (chapter_key), not number, so an
--    edition renumbering is a one-field edit on textbook_chapters, never a remap.
create table if not exists public.textbooks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  edition text null,
  created_at timestamptz not null default now()
);
create table if not exists public.textbook_chapters (
  id uuid primary key default gen_random_uuid(),
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  chapter_key text not null,
  number int not null,
  title text not null default '',
  position int not null default 0,
  unique (textbook_id, chapter_key)
);
create table if not exists public.unit_textbook_links (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.chapters(id) on delete cascade,
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  chapter_key text not null,
  unique (unit_id, textbook_id)
);
alter table public.textbooks enable row level security;
alter table public.textbook_chapters enable row level security;
alter table public.unit_textbook_links enable row level security;

-- 5) INBOUND FILES — the provenance ledger. The syllabus modal dual-writes here (0108's
--    syllabus_submissions is untouched). Never student-facing.
create table if not exists public.inbound_files (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid null,
  campus_name text null,
  professor_name text null,
  student_email text null,
  files jsonb not null default '[]'::jsonb,   -- [{name, path, size, type}] in the canvas-media bucket
  submitted_at timestamptz not null default now(),
  reviewed boolean not null default false,
  notes text null,
  reviewer text null,
  source text not null default 'syllabus_modal'
);
alter table public.inbound_files enable row level security;

-- VERIFIED requires >=1 linked inbound file (enforced app-side when setting the status; this table
-- is the "this map was verified from this PDF" trail).
create table if not exists public.map_verification_files (
  id uuid primary key default gen_random_uuid(),
  map_meta_id uuid not null references public.map_meta(id) on delete cascade,
  inbound_file_id uuid not null references public.inbound_files(id) on delete cascade,
  unique (map_meta_id, inbound_file_id)
);
alter table public.map_verification_files enable row level security;

-- 6) PROVENANCE — optional source-file pointer on map edits + topic creations.
alter table public.campus_exam_topics add column if not exists source_file_id uuid null;
alter table public.chapters add column if not exists source_file_id uuid null;

-- 7) SEED THE STARTER MAP from default_exam_units (one-time; idempotent via the existence check).
--    Groups units by exam_number → "Exam N" (99 → "Final") starter exams with ordered topics.
--    default_exam_units stays as a legacy safety net; nothing reads it after the app deploy.
do $$
declare
  v_course uuid;
  v_exam record;
  v_exam_id uuid;
begin
  select id into v_course from public.courses where course_family = 'intro_1' limit 1;
  if v_course is null then
    select course_id into v_course from public.chapters
      where id in (select unit_id from public.default_exam_units limit 1);
  end if;
  if v_course is null then return; end if;

  if exists (select 1 from public.campus_exams where campus_id is null and professor_id is null) then
    return; -- starter already seeded
  end if;

  for v_exam in select distinct exam_number from public.default_exam_units order by exam_number loop
    insert into public.campus_exams (campus_id, professor_id, course_id, name, status)
      values (null, null, v_course, case when v_exam.exam_number = 99 then 'Final' else 'Exam ' || v_exam.exam_number end, 'active')
      returning id into v_exam_id;
    insert into public.campus_exam_topics (campus_exam_id, chapter_id, position)
      select v_exam_id, unit_id, coalesce(sort_order, 0)
      from public.default_exam_units where exam_number = v_exam.exam_number
      order by sort_order nulls last;
  end loop;

  -- Starter map meta (edited — it's curated, not syllabus-verified).
  insert into public.map_meta (course_id, campus_id, professor_id, status)
    values (v_course, null, null, 'edited')
    on conflict do nothing;

  -- Ole Miss has real rows → status 'edited' (NOT verified: no syllabus link yet).
  -- (null::uuid cast required — a bare NULL in a SELECT list types as text and 42804s.)
  insert into public.map_meta (course_id, campus_id, professor_id, status)
    select distinct course_id, campus_id, null::uuid, 'edited'
    from public.campus_exams
    where campus_id = '7b92a320-b196-43f2-a241-77a0805816fe' and professor_id is null
    on conflict do nothing;
end $$;

commit;

-- Verify: starter exams + topic counts, and map_meta rows.
select coalesce(ce.name,'?') as exam, count(t.id) as topics
from public.campus_exams ce left join public.campus_exam_topics t on t.campus_exam_id = ce.id
where ce.campus_id is null and ce.professor_id is null
group by ce.name order by ce.name;
select course_id, campus_id, professor_id, status from public.map_meta;
