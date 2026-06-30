-- 0036_profintel.sql
-- ProfIntel — a careful, one-lead-at-a-time professor-outreach flow (separate from
-- the bulk campaign system). Lee picks a campus, selects leads, the tool pre-fills
-- each with an editable email template, he reviews/edits + marks ready + schedules
-- a send day/time. NOTHING sends automatically yet (drafts-only); a future worker
-- can pick up status='scheduled' rows once Lee flips real sending on.
-- Idempotent. After the high-water mark (0035). Anon CRUD (AdminGate'd UI), matching
-- the existing outreach_leads / campus_lead_suggestions access pattern.

-- Single editable base template (one row, id=1). Tokens: {first_name}, {last_name},
-- {full_name}, {school}, {course}, {rmp_rating}.
create table if not exists public.profintel_template (
  id         integer primary key default 1,
  subject    text not null default 'A quick note from a fellow accounting tutor',
  body       text not null default 'Hi {first_name},\n\nI''m Lee — I tutor {course} students and put together exam-focused practice. I''d love to share it with your {school} students.\n\nWould you be open to a quick chat?\n\nBest,\nLee Ingram\nSurvive Accounting',
  updated_at timestamptz default now(),
  constraint profintel_template_singleton check (id = 1)
);
insert into public.profintel_template (id) values (1) on conflict (id) do nothing;

-- Per-lead email drafts + schedule.
create table if not exists public.profintel_sends (
  id             uuid primary key default gen_random_uuid(),
  campus_id      uuid references public.campuses(id) on delete set null,
  lead_id        uuid,                 -- campus_lead_suggestions.id (loose ref)
  to_name        text,
  to_email       text,
  school         text,                 -- denormalized for the schedule view
  course_matches text,                 -- denormalized RMP matched codes
  subject        text,
  body           text,
  ready          boolean not null default false,
  scheduled_at   timestamptz,
  status         text not null default 'draft',   -- draft | scheduled | sent | canceled
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists profintel_sends_campus_idx on public.profintel_sends (campus_id);
create index if not exists profintel_sends_status_idx on public.profintel_sends (status, scheduled_at);

alter table public.profintel_template enable row level security;
alter table public.profintel_sends enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profintel_template' and policyname='profintel_template_all') then
    create policy profintel_template_all on public.profintel_template for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profintel_sends' and policyname='profintel_sends_all') then
    create policy profintel_sends_all on public.profintel_sends for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
