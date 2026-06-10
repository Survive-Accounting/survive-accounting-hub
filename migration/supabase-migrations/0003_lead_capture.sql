-- 0003: Public lead-capture tables
-- Generated from old project's Supabase types (June 2026 branch).
-- All columns nullable except id/created_at/updated_at for maximum import compatibility;
-- tighten constraints after migration if desired.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text,
  message text,
  name text,
  subject text
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text,
  name text
);

create table if not exists public.landing_page_leads (
  id uuid primary key default gen_random_uuid(),
  campus_signup_number numeric,
  course_slug text,
  created_at timestamptz not null default now(),
  email text,
  email_type text,
  intent_tag text,
  source text,
  university_domain text,
  university_name text
);

create table if not exists public.session_prep_submissions (
  id uuid primary key default gen_random_uuid(),
  appointment_at timestamptz,
  course text,
  created_at timestamptz not null default now(),
  email text,
  file_paths text[],
  name text,
  notes text,
  school text
);

create table if not exists public.student_emails (
  id uuid primary key default gen_random_uuid(),
  attempted_at timestamptz,
  chapter_id uuid references public.chapters(id) on delete set null,
  converted boolean,
  course_id uuid references public.courses(id) on delete set null,
  email text,
  founding_student boolean
);
