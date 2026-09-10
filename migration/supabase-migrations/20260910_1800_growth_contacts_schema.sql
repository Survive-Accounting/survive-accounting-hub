-- 20260910_1800_growth_contacts_schema.sql — the unified growth-contacts schema (CONTACTS-SCHEMA.md).
--
-- ADDITIVE ON growth_contact_qc, not a new table. That table is what the DM board, the chapter
-- roster grid, the send schedule and find-contacts all read; a parallel table would fork the data
-- and leave half the product looking at the old half. The importer keeps writing the existing
-- columns (name, role, instagram, email, entity_type, entity_id, council_type) alongside the new
-- structured ones, so every surface built before today keeps working unchanged.
--
-- The 25 columns map on as:
--   contact_id .......... new, unique — everything upserts on it
--   school .............. campus_id (resolved on import)
--   council ............. council_type (existing) + council (new, canonical label)
--   org_type/org_name ... new; entity_type/entity_id still written for the existing joins
--   contact_kind ........ new (org_inbox | student_officer | staff)
--   exec_title .......... role (existing) mirrored into exec_title
--   first/last/full_name  new; name (existing) keeps full_name
--   org_ig/personal_ig .. new; instagram (existing) keeps whichever handle we would DM
--   alt_ig, councils_covered, needs_review, notes, source ... new
--   review_reason ....... already exists, reused
--   dm_* ................ new, app-owned; growth_ig_dm stays the live DM thread store
--
-- Apply by pasting into the Supabase SQL editor (or run_sql.ts --apply). The SELECT at the end
-- lists the new columns; fewer than 19 rows means it did not take.

BEGIN;

ALTER TABLE public.growth_contact_qc
  ADD COLUMN IF NOT EXISTS contact_id text,
  ADD COLUMN IF NOT EXISTS council text,
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS org_name text,
  ADD COLUMN IF NOT EXISTS contact_kind text,
  ADD COLUMN IF NOT EXISTS exec_title text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS org_ig text,
  ADD COLUMN IF NOT EXISTS personal_ig text,
  ADD COLUMN IF NOT EXISTS alt_ig text,
  ADD COLUMN IF NOT EXISTS councils_covered text,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS dm_status text,
  ADD COLUMN IF NOT EXISTS dm_channel text,
  ADD COLUMN IF NOT EXISTS dm_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS dm_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS dm_owner text,
  ADD COLUMN IF NOT EXISTS dm_notes text;

-- The upsert key. Partial + unique: rows predating this migration have no contact_id and must not
-- collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS growth_contact_qc_contact_id_idx
  ON public.growth_contact_qc (contact_id) WHERE contact_id IS NOT NULL;

-- The natural key the importer falls back to when a row arrives with no id (or a changed one), so
-- re-cleaning the same person never inserts a second copy of them.
CREATE INDEX IF NOT EXISTS growth_contact_qc_natural_idx
  ON public.growth_contact_qc (campus_id, lower(coalesce(org_name, '')), lower(coalesce(full_name, '')), lower(coalesce(email, '')));

CREATE INDEX IF NOT EXISTS growth_contact_qc_needs_review_idx
  ON public.growth_contact_qc (needs_review) WHERE needs_review;

COMMIT;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'growth_contact_qc'
  AND column_name IN (
    'contact_id','council','org_type','org_name','contact_kind','exec_title','first_name','last_name',
    'full_name','org_ig','personal_ig','alt_ig','councils_covered','needs_review','notes','source',
    'dm_status','dm_channel','dm_sent_at','dm_replied_at','dm_owner','dm_notes'
  )
ORDER BY column_name;
