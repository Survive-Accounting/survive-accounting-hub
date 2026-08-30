-- "Request your school" — when a student's school isn't in the live picker, capture the
-- ask. A demand signal and a lead in one. Lee reviews these and can spin up a backlog
-- campus (or attach the email to an existing one).

create table if not exists public.growth_school_requests (
  id           uuid primary key default gen_random_uuid(),
  school_name  text not null,
  email        text,
  campus_id    uuid references public.campuses(id) on delete set null, -- set if we matched an existing campus
  created_at   timestamptz not null default now()
);

comment on table public.growth_school_requests is
  'Student requests for a school not yet in the live picker. Demand signal + lead; Lee promotes to a backlog campus.';

create index if not exists growth_school_requests_created_idx on public.growth_school_requests (created_at desc);

alter table public.growth_school_requests enable row level security;
