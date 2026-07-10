-- 0057_greekintel_va_queue — VA enrichment queue + firms + research-only campuses.
--   • greek_org_filings: preparer address/phone (firm/fee already in 0056)
--   • greek_orgs: org-level enrichment status/note (queue: pending|enriched|no_filing_found)
--   • greek_org_people: person enrichment status + contact/career fields (people queue)
--   • campuses.is_research_only: excluded from student pickers / ProfIntel / orders
--   • greek_firm_leads: lead-tracking status/notes for preparer/fundraiser firms
-- Idempotent. After 0056. Anon-CRUD RLS on new table.

alter table public.greek_org_filings
  add column if not exists preparer_address text,
  add column if not exists preparer_phone   text;

alter table public.greek_orgs
  add column if not exists enrichment_status text not null default 'pending',  -- pending|enriched|no_filing_found
  add column if not exists enrichment_note   text;

alter table public.greek_org_people
  add column if not exists enrichment_status text not null default 'pending',  -- pending|enriched|not_found
  add column if not exists employer     text,
  add column if not exists role_now     text,
  add column if not exists alma_mater   text,
  add column if not exists business_url text;

alter table public.campuses add column if not exists is_research_only boolean not null default false;

create table if not exists public.greek_firm_leads (
  id         uuid primary key default gen_random_uuid(),
  firm_name  text not null unique,
  status     text not null default 'new',  -- new|contacted|meeting|client|passed
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.greek_firm_leads enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='greek_firm_leads' and policyname='greek_firm_leads_all') then
    create policy greek_firm_leads_all on public.greek_firm_leads for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
