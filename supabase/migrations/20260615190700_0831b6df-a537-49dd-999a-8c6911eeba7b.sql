
-- 1) Global course-family defaults on the singleton outreach_settings row
alter table public.outreach_settings
  add column if not exists intro_1_availability text not null default 'available',
  add column if not exists intro_2_availability text not null default 'available',
  add column if not exists intermediate_1_availability text not null default 'waitlist',
  add column if not exists intermediate_2_availability text not null default 'waitlist';

do $$ begin
  alter table public.outreach_settings
    add constraint outreach_settings_intro_1_chk check (intro_1_availability in ('available','waitlist','unavailable'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.outreach_settings
    add constraint outreach_settings_intro_2_chk check (intro_2_availability in ('available','waitlist','unavailable'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.outreach_settings
    add constraint outreach_settings_intermediate_1_chk check (intermediate_1_availability in ('available','waitlist','unavailable'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.outreach_settings
    add constraint outreach_settings_intermediate_2_chk check (intermediate_2_availability in ('available','waitlist','unavailable'));
exception when duplicate_object then null; end $$;

-- 2) New table — per-campus overrides
create table if not exists public.campus_course_availability (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  course_family text not null check (course_family in ('intro_1','intro_2','intermediate_1','intermediate_2')),
  textbook_match_status text not null default 'unknown'
    check (textbook_match_status in ('matched','likely_match','not_matched','unknown')),
  tutoring_availability text
    check (tutoring_availability is null or tutoring_availability in ('available','waitlist','unavailable')),
  requires_syllabus_review boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, course_family)
);

grant select on public.campus_course_availability to anon;
grant select, insert, update, delete on public.campus_course_availability to authenticated;
grant all on public.campus_course_availability to service_role;

alter table public.campus_course_availability enable row level security;

create policy "anon read campus_course_availability"
  on public.campus_course_availability for select to anon using (true);
create policy "auth all campus_course_availability"
  on public.campus_course_availability for all to authenticated using (true) with check (true);

create index if not exists campus_course_availability_campus_idx
  on public.campus_course_availability (campus_id);

drop trigger if exists campus_course_availability_set_updated_at on public.campus_course_availability;
create trigger campus_course_availability_set_updated_at
  before update on public.campus_course_availability
  for each row execute function public.set_updated_at();

-- 3) Extend outreach_waitlist_signups for course-level waitlist captures
alter table public.outreach_waitlist_signups
  add column if not exists campus_id uuid references public.campuses(id) on delete set null,
  add column if not exists phone text,
  add column if not exists course_family text,
  add column if not exists syllabus_file_path text,
  add column if not exists notes text;

do $$ begin
  alter table public.outreach_waitlist_signups
    add constraint outreach_waitlist_signups_course_family_chk
    check (course_family is null or course_family in ('intro_1','intro_2','intermediate_1','intermediate_2'));
exception when duplicate_object then null; end $$;

-- Allow public landing-page submissions
grant insert on public.outreach_waitlist_signups to anon;

do $$ begin
  create policy "anon insert outreach_waitlist_signups"
    on public.outreach_waitlist_signups for insert to anon with check (true);
exception when duplicate_object then null; end $$;
