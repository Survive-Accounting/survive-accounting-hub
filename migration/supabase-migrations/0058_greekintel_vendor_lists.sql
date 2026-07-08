-- 0058_greekintel_vendor_lists — vendor-list queue + firms-tab source/industry.
--   • greek_firm_leads: source (990_preparer|990_fundraiser|990_contractor|
--     national_vendor_list|manual), vendor_list_org/url, category (free-text
--     keyword guess), industry (enum-ish, see INDUSTRIES in src/lib/greek-vendors.ts),
--     website_url, phone (990-sourced firms carry phone on filings; vendor/manual
--     firms carry it here)
--   • greek_orgs: national-org vendor research fields (domain, housing_entity,
--     vendor_status pending|lists_found|none_found|portal_gated, vendor_notes).
--     NOTE: there is no national_orgs table — greek_orgs IS the national catalog.
--   • vendor_lists: captured lists per national org (url and/or stored PDF)
--   • storage bucket vendor-lists (public read; anon upload) for PDF drops
--   • backfill industry from category where category already implies it
-- Idempotent. After 0057. Anon-CRUD RLS on new table (registry pattern).

alter table public.greek_firm_leads
  add column if not exists source          text not null default 'manual',
  add column if not exists vendor_list_org text,
  add column if not exists vendor_list_url text,
  add column if not exists category        text,
  add column if not exists industry        text,
  add column if not exists website_url     text,
  add column if not exists phone           text;

alter table public.greek_orgs
  add column if not exists domain         text,
  add column if not exists housing_entity text,
  add column if not exists vendor_status  text not null default 'pending',  -- pending|lists_found|none_found|portal_gated
  add column if not exists vendor_notes   text;

create table if not exists public.vendor_lists (
  id               uuid primary key default gen_random_uuid(),
  national_org     text not null,
  list_type        text not null default 'other',  -- approved_vendors|preferred_partners|exhibitors|lenders|other
  url              text,
  pdf_storage_path text,
  found_at         timestamptz not null default now(),
  notes            text
);

alter table public.vendor_lists enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='vendor_lists' and policyname='vendor_lists_all') then
    create policy vendor_lists_all on public.vendor_lists for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- Storage: public-read bucket for captured vendor-list PDFs; anon may upload.
insert into storage.buckets (id, name, public)
  values ('vendor-lists', 'vendor-lists', true)
  on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vendor_lists_upload') then
    create policy vendor_lists_upload on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'vendor-lists');
  end if;
end $$;

-- Backfill industry where an existing category already implies it (idempotent).
update public.greek_firm_leads set industry = case
    when category ~* 'insur|risk'                       then 'insurance_risk'
    when category ~* 'account|tax|cpa|audit'            then 'accounting_tax'
    when category ~* 'fundrais|capital|financial'       then 'fundraising_capital_campaigns'
    when category ~* 'property|house? ?manage|consult'  then 'house_management'
    when category ~* 'construct|renovat|maintenance'    then 'construction_renovation'
    when category ~* 'architect'                        then 'architecture_design'
    when category ~* 'food|culinary|dining|cater'       then 'food_service'
    when category ~* 'billing|dues'                     then 'billing_dues_software'
    when category ~* 'software|technolog'               then 'chapter_software'
    when category ~* 'legal|law'                        then 'legal'
    when category ~* 'bank|lend|loan|mortgage'          then 'banking_lending'
    when category ~* 'real ?estate|realty'              then 'real_estate'
    when category ~* 'furni|interior|decor'             then 'furniture_interiors'
    when category ~* 'security|safety'                  then 'security_safety'
    when category ~* 'travel|event'                     then 'travel_events'
    when category ~* 'apparel|promo|gift|marketing'     then 'apparel_promo'
    when category ~* 'recruit|rush'                     then 'recruitment_services'
    when category ~* 'educat|academ|tutor|scholar'      then 'education_academics'
    else null end
  where industry is null and category is not null;

notify pgrst, 'reload schema';
