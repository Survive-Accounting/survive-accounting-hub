-- ============================================================================
-- SCHOOL PICKER — PHASE 1 · SQL LEE MUST RUN  (read before running; nothing auto-runs)
-- ============================================================================
-- Context: the generator (gen_schools.ts) now shows the DISPLAY-READY set
--   (not excluded) + slug + (SEC OR course-code + colour + >=1 Greek chapter).
-- With current data that yields 197 schools. This SQL restores the two schools
-- Lee confirmed should be un-excluded, taking the picker to 199.
--
-- After running this, regenerate the committed snapshot (also happens at deploy):
--   cd <worktree> && set -a && . ./.env && set +a && \
--     bun run migration/supabase-migrations/gen_schools.ts
-- Expect: "wrote 199 schools — SEC:16  Big Ten:15  Big 12:15  ACC:12  Other:141"
-- and the two bolt-palette tests (purdue / cincinnati) go green.
-- ============================================================================

-- 1) UN-EXCLUDE Cincinnati (Big 12) and Purdue (Big Ten). Both are fully enriched
--    (course code + colour + Greek chapters); they were marked 'excluded'. Pin them
--    'ready' via the override so growth_refresh_campus_status() cannot re-exclude them.
update public.campuses
   set campus_status_override = 'ready',
       campus_status          = 'ready'
 where slug in ('university-of-cincinnati', 'purdue-university')
   and campus_status = 'excluded';   -- guard: only touch if still excluded

-- Verify:
-- select slug, campus_status, campus_status_override
--   from public.campuses
--  where slug in ('university-of-cincinnati','purdue-university');

-- ============================================================================
-- OPTIONAL / PHASE 3 — NOT run here. Data-hygiene note for one-row-per-school.
-- ----------------------------------------------------------------------------
-- The generator already shows ONE Wisconsin (keeps 'university-of-wisconsin-madison',
-- drops the merge artifact 'university-of-wisconsinmadison-merged' at generation time,
-- logged loudly). No SQL is required for the picker to be correct.
--
-- BUT the dropped '-merged' row carries 60 Greek chapters vs 21 on the canonical row,
-- so the canonical Wisconsin page would show fewer chapters. Before excluding the
-- artifact in the DB, decide whether to migrate its chapters onto the canonical campus:
--
--   -- (review first) chapters on each Wisconsin row:
--   -- select c.slug, count(g.*) from campuses c
--   --   left join campus_greek_chapters g on g.campus_id = c.id
--   --  where c.slug like 'university-of-wisconsin%madison%' group by c.slug;
--
-- Then, once chapters are consolidated, you may hard-exclude the artifact:
--   -- update public.campuses set campus_status='excluded', campus_status_override='excluded'
--   --  where slug = 'university-of-wisconsinmadison-merged';
-- ============================================================================
