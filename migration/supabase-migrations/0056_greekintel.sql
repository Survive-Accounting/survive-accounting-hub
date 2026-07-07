-- 0056_greekintel — GreekIntel data-model extension on greek registry v2.
--   • greek_org_filings: itemized 990 fields (manual "from the PDF" entry)
--   • campus_context: enrollment / tuition / calendar / rush windows per campus
--   • chapter_gpa: per-org term GPA (bulk TSV import) for the GPA signal layer
-- Idempotent. After 0055. Anon-CRUD RLS on new tables.

alter table public.greek_org_filings
  add column if not exists contributions          numeric,
  add column if not exists program_revenue_detail jsonb,   -- {label: amount}
  add column if not exists salaries               numeric,
  add column if not exists employees_count        integer,
  add column if not exists food_expense           numeric,
  add column if not exists repairs_expense        numeric,
  add column if not exists insurance_expense       numeric,
  add column if not exists interest_expense       numeric,
  add column if not exists grants_paid            numeric,
  add column if not exists land_buildings_gross   numeric,
  add column if not exists accum_depreciation     numeric,
  add column if not exists mortgages_payable      numeric,
  add column if not exists fundraiser_firm        text,
  add column if not exists fundraiser_fee         numeric,
  add column if not exists preparer_firm          text;

create table if not exists public.campus_context (
  campus_id            uuid primary key references public.campuses(id) on delete cascade,
  enrollment           integer,
  undergrad_enrollment integer,
  business_enrollment  integer,
  tuition_in_state     numeric,
  tuition_out_state    numeric,
  greek_population_pct numeric,
  rush_fall_start      date,
  rush_spring_start    date,
  semester_start       date,
  semester_end         date,
  midterm_window       text,
  finals_window        text,
  football_schedule_url text,
  fsl_grade_report_url text,
  notes                text,
  updated_at           timestamptz not null default now()
);

create table if not exists public.chapter_gpa (
  id           uuid primary key default gen_random_uuid(),
  greek_org_id uuid references public.greek_orgs(id) on delete cascade,
  term         text,   -- e.g. 'fall_2025'
  gpa          numeric,
  campus_rank  integer,
  member_count integer,
  source_url   text,
  created_at   timestamptz not null default now(),
  unique (greek_org_id, term)
);
create index if not exists chapter_gpa_org_idx on public.chapter_gpa (greek_org_id);

alter table public.campus_context enable row level security;
alter table public.chapter_gpa enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='campus_context' and policyname='campus_context_all') then
    create policy campus_context_all on public.campus_context for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='chapter_gpa' and policyname='chapter_gpa_all') then
    create policy chapter_gpa_all on public.chapter_gpa for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
