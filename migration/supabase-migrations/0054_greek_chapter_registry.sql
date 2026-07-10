-- 0054_greek_chapter_registry — Greek org registry v1 built on the EXISTING model:
--   national catalog public.greek_orgs (105 rows) ← per-campus public.campus_greek_chapters
-- Adds the research fields the registry needs (house corp / advisor / campus council
-- / display letters) to campus_greek_chapters, plus campuses.fsl_url. Seeds the three
-- Ole Miss pilot chapters (linked to the catalog) at 'researching' so the page isn't
-- empty. Registry only — no outreach/scraping. Idempotent. After 0053.

alter table public.campus_greek_chapters
  add column if not exists council            text,   -- campus council: ifc|panhellenic|nphc|mgc|other
  add column if not exists letters            text,   -- display, e.g. "ATO"
  add column if not exists house_corp_name    text,
  add column if not exists house_corp_990_url text,
  add column if not exists advisor_name       text,
  add column if not exists advisor_notes      text;

alter table public.campuses add column if not exists fsl_url text;  -- FSL directory URL (seed later)

-- Seed Ole Miss pilots, linking to the existing national-catalog rows. Idempotent:
-- skips any (campus, national org) chapter that already exists.
insert into public.campus_greek_chapters
  (campus_id, greek_org_id, chapter_designation, council, letters, status)
select
  '7b92a320-b196-43f2-a241-77a0805816fe'::uuid, g.id, d.designation, 'ifc', d.letters, 'researching'
from (values
  ('Alpha Tau Omega', 'Delta Psi', 'ATO'),
  ('Phi Kappa Psi',   null,        'Phi Psi'),
  ('Phi Kappa Tau',   null,        'Phi Tau')
) as d(org, designation, letters)
join public.greek_orgs g on lower(g.name) = lower(d.org)
where not exists (
  select 1 from public.campus_greek_chapters c
  where c.campus_id = '7b92a320-b196-43f2-a241-77a0805816fe'::uuid and c.greek_org_id = g.id
);

notify pgrst, 'reload schema';
