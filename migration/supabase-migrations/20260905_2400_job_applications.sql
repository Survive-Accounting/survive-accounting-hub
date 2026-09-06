-- CAREERS / JOB APPLICATIONS (2026-09-05). Lee: "the jobs page I wanna build. Just put it in the
-- footer and advertise it a little, send it to people." Five roles on one public /careers page
-- (tutor content creator, national campaign manager, operations lead, platform engineer,
-- campus rep — the last one hands off to the existing /rep/join flow instead of this form), one
-- shared application form. Every submission is stored AND emailed to Lee (src/lib/email.server.ts)
-- — the row is the durable record; the email is what Lee actually sees first.
--
-- RLS: deny-by-default like every other new table this session — all access rides the
-- service-role server fn in src/lib/careers.functions.ts.
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  name text not null,
  email text not null,
  phone text null,
  -- Only meaningful for the tutor-content-creator role — the write-in subject
  -- ("organic chemistry, finance, statistics... let people write in the subject").
  subject text null,
  why text null,
  notes text null,
  resume_url text null,
  resume_name text null,
  created_at timestamptz not null default now(),
  constraint job_applications_role_ck check (
    role in ('tutor-content-creator', 'national-campaign-manager', 'operations-lead', 'platform-engineer', 'other')
  )
);

create index if not exists job_applications_created_idx on public.job_applications (created_at desc);

alter table public.job_applications enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.
