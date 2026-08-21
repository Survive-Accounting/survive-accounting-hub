-- 20260820_1500_progress_position_and_duration.sql — resume-at-timestamp + runtime badges.
-- MANUAL-APPLY via run_sql.ts (project unvxagsledbsdoremqeb). Idempotent.
--
-- 1) RESUME POSITION — student_set_progress (0101) stored only a 3-state flag, so "Resume"
--    could only mean "start over". position_sec is the last watched second, written on
--    pause/close/interval; the player seeks to it on open when state='in_progress'.
--    duration_sec is denormalized alongside so the poster can show a progress fraction
--    without a second lookup. RLS from 0101 already covers these columns (row-level).
alter table public.student_set_progress add column if not exists position_sec integer not null default 0;
alter table public.student_set_progress add column if not exists duration_sec integer;

-- 2) RUNTIME — lesson_videos (0095) never stored the final asset's duration; the student
--    tree's runtimeSec has been null since #7. The publish poll writes it when the FINAL
--    Mux asset flips ready (asset.duration is on the Mux GET the poll already makes).
alter table public.lesson_videos add column if not exists duration_sec integer;
