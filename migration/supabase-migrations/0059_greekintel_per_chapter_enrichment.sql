-- 0059_greekintel_per_chapter_enrichment — move enrichment identity from the
-- shared national org (greek_orgs) to the per-campus CHAPTER (campus_greek_chapters).
--
-- Why: greek_orgs is ONE catalog row per national org (e.g. "Kappa Kappa Gamma"),
-- but each campus's house corporation is a SEPARATE nonprofit with its own EIN
-- and 990s. 91 KKG chapters all point at one greek_orgs row, so per-org
-- enrichment could only hold ONE campus's data and the unique(org_id,tax_year)
-- constraint blocked two campuses from filing the same tax year. Enrichment now
-- keys on the chapter.
--
--   • campus_greek_chapters: ein / address / propublica_url / enrichment_status
--     (pending|enriched|no_filing_found) / enrichment_note
--   • greek_org_filings + greek_org_people: add chapter_id; re-key uniqueness to
--     the chapter. org_id stays POPULATED (from the chapter's greek_org_id) so
--     the org-scoped rollups — signals, firms, leads/people tabs — are untouched.
-- Idempotent. After 0058. Zero enrichment rows exist yet, so no data migration.

alter table public.campus_greek_chapters
  add column if not exists ein               text,
  add column if not exists address           text,
  add column if not exists propublica_url    text,
  add column if not exists enrichment_status text not null default 'pending',  -- pending|enriched|no_filing_found
  add column if not exists enrichment_note   text;

-- Filings: chapter-scoped identity.
alter table public.greek_org_filings
  add column if not exists chapter_id uuid references public.campus_greek_chapters(id) on delete cascade;
alter table public.greek_org_filings
  drop constraint if exists greek_org_filings_org_id_tax_year_key;
create unique index if not exists greek_org_filings_chapter_year_key
  on public.greek_org_filings (chapter_id, tax_year);
create index if not exists greek_org_filings_chapter_idx on public.greek_org_filings (chapter_id);

-- People: chapter-scoped identity.
alter table public.greek_org_people
  add column if not exists chapter_id uuid references public.campus_greek_chapters(id) on delete cascade;
alter table public.greek_org_people
  drop constraint if exists greek_org_people_org_id_person_name_key;
create unique index if not exists greek_org_people_chapter_name_key
  on public.greek_org_people (chapter_id, person_name);
create index if not exists greek_org_people_chapter_idx on public.greek_org_people (chapter_id);

notify pgrst, 'reload schema';
