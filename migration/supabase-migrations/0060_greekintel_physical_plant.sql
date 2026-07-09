-- 0060_greekintel_physical_plant — chapter physical-plant + founding data, and
-- filing Schedule D building/equipment breakdown.
--
-- These live on the CHAPTER (campus_greek_chapters), NOT greek_orgs. greek_orgs
-- is ONE shared catalog row per national org (91 KKG chapters → 1 row); a house's
-- year_built / square footage / parcel value / assessor URL is per-campus, and a
-- chapter's charter year + whether it's the founding chapter are per-campus too
-- (the Wikipedia backfill keys on national + CAMPUS name). Putting them on
-- greek_orgs would recreate the shared-row bug that 0059 fixed.
--
--   • campus_greek_chapters: chartered_year, is_founding_chapter, year_built,
--     square_footage, parcel_value_land, parcel_value_building, county_assessor_url
--   • greek_org_filings: buildings_gross, equipment_gross (Schedule D Part VI).
--     The ProPublica API does NOT expose these (only secrdmrtgsend → mortgages,
--     already pulled); they're manual entry from the PDF's Schedule D.
-- Idempotent. After 0059.

alter table public.campus_greek_chapters
  add column if not exists chartered_year        integer,
  add column if not exists is_founding_chapter   boolean not null default false,
  add column if not exists year_built            integer,
  add column if not exists square_footage        integer,
  add column if not exists parcel_value_land     bigint,
  add column if not exists parcel_value_building bigint,
  add column if not exists county_assessor_url   text;

alter table public.greek_org_filings
  add column if not exists buildings_gross  numeric,
  add column if not exists equipment_gross  numeric;

notify pgrst, 'reload schema';
