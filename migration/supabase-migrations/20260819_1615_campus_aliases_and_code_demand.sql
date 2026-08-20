-- 20260819_1615 — school search aliases, plus demand logging for missing course codes.
--
-- ONLY TWO THINGS NEED DDL. The seed also supplies canonical short names and colourways, and
-- `campuses` ALREADY has columns for both (`short_name`, `color_primary`, `color_secondary`), so
-- those are plain UPDATEs and are applied by script, not here.
--
-- 1. SEARCH ALIASES. There is no column for them. `course_aliases_json` is course codes, not
--    school names. Aliases are matched but never displayed, so a student typing "Bama", "UIUC" or
--    "Pike house at Purdue" lands on the right school under its canonical name.
--
-- 2. CODE DEMAND. Selecting a school with no intro_1 code is the single most useful signal we
--    collect: it is a student telling us which course code to find next, ranked by real demand
--    rather than by guesswork. Logged as its own table because it is append-only, high-volume,
--    and must never slow down or fail a selection.

BEGIN;

ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}';

-- Alias lookup is a contains-any query over a small array; GIN is the index for that.
CREATE INDEX IF NOT EXISTS campuses_search_aliases_idx ON public.campuses USING GIN (search_aliases);

CREATE TABLE IF NOT EXISTS public.campus_code_demand (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  -- Kept alongside the FK ON PURPOSE. A campus row can be merged away (Tennessee, UCLA, UCSB,
  -- Wisconsin all have duplicates today) and the demand signal must survive that, or merging a
  -- campus would silently delete the evidence that students wanted it.
  campus_slug text,
  campus_name text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_code_demand_campus_idx  ON public.campus_code_demand (campus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_code_demand_created_idx ON public.campus_code_demand (created_at DESC);

-- DENY BY DEFAULT — written through the service role in a server function only.
ALTER TABLE public.campus_code_demand ENABLE ROW LEVEL SECURITY;

COMMIT;

-- PROVE IT WORKED. Both rows must appear; if either is missing the migration did not commit.
SELECT 'search_aliases column' AS check, count(*)::text AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campuses' AND column_name = 'search_aliases'
UNION ALL
SELECT 'campus_code_demand table', count(*)::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'campus_code_demand';
