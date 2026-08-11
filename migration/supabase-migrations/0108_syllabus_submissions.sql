-- 0108_syllabus_submissions.sql — landing "Send your syllabus" intake (files + email).
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- A student on an unmapped campus can send their syllabus / study guide so Lee can tailor materials.
-- Files land in a PRIVATE storage bucket; one row per submission records the email + object paths.
-- Deny-by-default RLS: no public policies — writes/reads go through the service-role server fn
-- (submitSyllabus), never the anon client. PII (email) + uploaded files must stay closed.

-- Private bucket for the uploaded files.
insert into storage.buckets (id, name, public)
values ('syllabus-submissions', 'syllabus-submissions', false)
on conflict (id) do nothing;

create table if not exists public.syllabus_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  campus_id   uuid references public.campuses(id) on delete set null,  -- selected school (null if none)
  campus_name text,                                                    -- denormalized label for quick triage
  file_paths  text[] not null default '{}',   -- object paths inside the syllabus-submissions bucket
  file_names  text[] not null default '{}',   -- original filenames, index-aligned with file_paths
  note        text,
  status      text not null default 'new' check (status in ('new', 'reviewed', 'done'))
);
create index if not exists syllabus_submissions_created_idx on public.syllabus_submissions(created_at desc);

alter table public.syllabus_submissions enable row level security;
-- No permissive public policies: anon/authenticated are denied. The landing modal writes through a
-- service-role server function (submitSyllabus), which bypasses RLS.

-- Refresh PostgREST's schema cache so the new table is reachable via the API.
notify pgrst, 'reload schema';
