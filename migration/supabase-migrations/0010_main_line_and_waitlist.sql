-- 0010: One main texting line for all campuses + the campus waitlist.

-- The main line is a campus_phone_numbers row with campus_id = null.
alter table public.campus_phone_numbers alter column campus_id drop not null;

-- Waitlist for students whose campus isn't in the system yet.
create table if not exists public.campus_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  campus_text text,
  course_text text,
  wants_text boolean not null default false,
  wants_call boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);
alter table public.campus_waitlist enable row level security;
create policy "anon insert campus_waitlist" on public.campus_waitlist for insert to anon with check (true);
create policy "anon read campus_waitlist" on public.campus_waitlist for select to anon using (true);
create policy "auth all campus_waitlist" on public.campus_waitlist for all to authenticated using (true) with check (true);
grant select, insert on public.campus_waitlist to anon, authenticated;
