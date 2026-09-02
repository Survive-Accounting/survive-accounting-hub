-- ============================================================================
-- SCHOOL PICKER — PHASE 3 · SQL LEE MUST RUN  (colour / course-code backfill)
-- ============================================================================
-- Adds the stored data the picker's display-ready gate needs (colour, + one
-- course code) to six schools that already have a course code + Greek chapters
-- but no colour. Running this + a redeploy adds all six to the picker.
--
-- Colours are OFFICIAL brand hexes, verified against each school's brand guide
-- (Sep 2026). Michigan's intro-1 course = ACC 300 (Ross "Financial Accounting",
-- the first financial-accounting course in the BBA series), verified.
--
-- ORDER OF OPERATIONS to see the change live:
--   1. run PICKER_PHASE1.sql (un-exclude Cincinnati + Purdue), then this file
--   2. redeploy main (Vercel build runs gen_schools.ts, which reads these colours)
-- Expected after both + redeploy: ~205 schools
--   (197 base + Cincinnati + Purdue + UCLA + Cal + Duke + Wake Forest + Michigan
--    + Middle Tennessee).  Guards make every statement idempotent.
-- ============================================================================

-- Power Four — colour only (each already has course code + >=1 Greek chapter)
update public.campuses set color_primary = '#2774AE', color_secondary = '#FFD100'
 where slug = 'university-of-california-los-angeles-r' and color_primary is null;   -- UCLA (Big Ten)

update public.campuses set color_primary = '#002676', color_secondary = '#FDB515'
 where slug = 'university-of-california-berkeley' and color_primary is null;        -- California/Berkeley (ACC)

update public.campuses set color_primary = '#012169', color_secondary = '#00539B'
 where slug = 'duke-university' and color_primary is null;                          -- Duke (ACC)

update public.campuses set color_primary = '#9E7E38', color_secondary = '#000000'
 where slug = 'wake-forest-university' and color_primary is null;                   -- Wake Forest (ACC)

-- Middle Tennessee (Other). NOTE: official secondary is white (#FFFFFF); the bolt's
-- light-colour rule may render it blue-dominant. Swap c2 if you want more contrast.
update public.campuses set color_primary = '#0066CC', color_secondary = '#FFFFFF'
 where slug = 'middle-tennessee-state-university' and color_primary is null;        -- MTSU

-- Michigan (Big Ten) — needs BOTH colour and an intro-1 course code.
update public.campuses set color_primary = '#00274C', color_secondary = '#FFCB05'
 where slug = 'university-of-michigan' and color_primary is null;
-- intro_1 = ACC 300. Guarded to only fill when empty, so it can't clobber real codes.
update public.campuses
   set course_family_codes_json = '{"intro_1":"ACC 300"}'
 where slug = 'university-of-michigan'
   and (course_family_codes_json is null or course_family_codes_json::text in ('{}', 'null'));

-- Verify:
-- select slug, campus_status, color_primary, color_secondary, course_family_codes_json
--   from public.campuses
--  where slug in ('university-of-california-los-angeles-r','university-of-california-berkeley',
--                 'duke-university','wake-forest-university','middle-tennessee-state-university',
--                 'university-of-michigan');

-- ============================================================================
-- FLAGGED — pre-existing course codes that look wrong (NOT changed here; verify separately):
--   * California/Berkeley: intro_1 = 'UGBA XB102A' — looks like a UC Extension code.
--     Berkeley's undergrad intro is UGBA 102A ("Introduction to Financial Accounting").
--   * Duke: intro_1 = 'ACCOUNTG 590' — 590 is graduate-level; confirm Duke's undergrad intro.
--
-- STILL NOT DISPLAY-READY after this (Phase 4 / Pre-launch setup — need more than colour):
--   * Stanford      — needs an intro-1 course code + colour (no clean undergrad intro found)
--   * BYU           — shell, no slug/code/colour/Greek (sheet: no Greek system — deprioritise)
--   * Boston College — shell, no slug/code/colour/Greek
--   * North Florida — has code (ACG2021) but no slug + 0 Greek chapters (needs chapter import)
-- ============================================================================
