-- 20260820_1209_chapter_import_flags.sql
--
-- ONE CONCERN: the per-chapter provenance/quality columns the 66-campus roster import
-- (chapters-66-FINAL.csv, 2,060 rows) persists on campus_greek_chapters.
--
--   nickname         what students actually call the chapter ("ADPi", "Pike") — used in share
--                    copy and flyers; NEVER chapter_designation, which is store-only
--   verified         TRUE = row comes from a current public roster; FALSE = carried from the
--                    older SEC seed and not revalidated
--   roster_status    'complete' | 'incomplete' — campus-level flag stamped per row so an
--                    incomplete-roster campus is visible from any of its chapters
--   is_national_org  TRUE = matched against the 89-org national list; FALSE = local/regional
--   source_url       provenance URL for the roster this row came from
--   as_of            date the roster was collected
--
-- Idempotent (IF NOT EXISTS), no data rewrites, applied by hand in the Supabase SQL editor.
-- The import script (import_chapters_66.ts) refuses to --apply until these columns exist.

BEGIN;

ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS roster_status text NOT NULL DEFAULT 'complete';
ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS is_national_org boolean;
ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.campus_greek_chapters ADD COLUMN IF NOT EXISTS as_of date;

COMMIT;

-- PROOF IT RAN (a silent no-op run would show the columns missing):
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'campus_greek_chapters'
  AND column_name IN ('nickname', 'verified', 'roster_status', 'is_national_org', 'source_url', 'as_of')
ORDER BY column_name;
-- EXPECT: 6 rows.
