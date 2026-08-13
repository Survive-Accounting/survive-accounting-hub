-- 0100_frame_take_coverage.sql — MULTI-FRAME TAKES.
--
-- A single OBS clip can cover a RUN of frames filmed in one continuous take
-- (sometimes one frame, sometimes a string that crosses beats — e.g. the last
-- Hook frame into the first Teach frame). `frame_ids` holds every frame the take
-- covers, in film order; `frame_id` stays the RUN'S FIRST frame (drives take_n
-- numbering + the Mux passthrough name, unchanged). A single-frame take has
-- frame_ids = [frame_id]. Publish plays each such take ONCE across its run.
--
-- Idempotent; additive. Existing single-frame takes keep working (NULL frame_ids
-- ⇒ the client treats coverage as [frame_id]).

alter table public.frame_takes
  add column if not exists frame_ids text[];

-- backfill existing rows so coverage is always populated going forward
update public.frame_takes set frame_ids = array[frame_id] where frame_ids is null;
