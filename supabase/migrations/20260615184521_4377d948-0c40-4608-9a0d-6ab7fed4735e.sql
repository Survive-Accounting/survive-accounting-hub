-- Staging table for AI-suggested leads. Never written to outreach_leads
-- directly; a human accepts a suggestion before it becomes a real lead.

create table if not exists public.campus_lead_suggestions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  title text,
  department text,
  lead_type text not null default 'professor'
    check (lead_type in ('professor','admin_staff','bap_advisor','tutoring_center','other')),
  is_phd boolean not null default false,
  is_cpa boolean not null default false,
  source_url text,
  confidence numeric,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','needs_lee')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.campus_lead_suggestions to anon, authenticated;
grant all on public.campus_lead_suggestions to service_role;

alter table public.campus_lead_suggestions enable row level security;

create policy "anon all campus_lead_suggestions"
  on public.campus_lead_suggestions for all to anon
  using (true) with check (true);

create policy "auth all campus_lead_suggestions"
  on public.campus_lead_suggestions for all to authenticated
  using (true) with check (true);

create index if not exists campus_lead_suggestions_campus_idx
  on public.campus_lead_suggestions(campus_id);
create index if not exists campus_lead_suggestions_status_idx
  on public.campus_lead_suggestions(status);
create index if not exists campus_lead_suggestions_email_lower_idx
  on public.campus_lead_suggestions(lower(email));

-- Shared updated_at trigger function (first use in this project).
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campus_lead_suggestions_set_updated_at on public.campus_lead_suggestions;
create trigger campus_lead_suggestions_set_updated_at
  before update on public.campus_lead_suggestions
  for each row execute function public.set_updated_at();
