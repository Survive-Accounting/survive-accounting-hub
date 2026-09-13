-- 20260913_1010 — THE FRAME LEARNING LOOP'S BASELINE, as plain SQL. Run AFTER 20260913_1000.
--
-- The same backfill as 20260913_1010_frame_learning_baseline.ts, for the Supabase SQL editor:
--   1. one `baseline` event per frame in every saved plan, with the frame as it stands now;
--   2. every `callout` row of ceq_edit_log copied in as an `edited` event, keeping its own
--      created_at and source. ceq_edit_log itself is not touched.
-- Additive and idempotent: both inserts skip rows already present, so running it twice writes 0
-- the second time. No generation rows are created.

begin;

-- 1. baselines — a repeated frame id across plans is recorded once
insert into public.frame_events (frame_id, set_id, event, after, source, created_by)
select distinct on (f->>'id')
  f->>'id', d->>'id', 'baseline', f, 'backfill', 'backfill'
from public.canvas_scenes s
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.nodes_json::jsonb -> 'decks') = 'array' then s.nodes_json::jsonb -> 'decks' else '[]'::jsonb end
) d
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(d -> 'blastOff' -> 'frames') = 'array' then d -> 'blastOff' -> 'frames' else '[]'::jsonb end
) f
where coalesce(f->>'id', '') <> ''
  and coalesce(d->>'id', '') <> ''
  and not exists (select 1 from public.frame_events e where e.event = 'baseline' and e.frame_id = f->>'id')
order by f->>'id';

-- 2. the callout edits already logged
insert into public.frame_events (frame_id, set_id, event, before, after, source, created_by, created_at)
select l.target, coalesce(l.set_id, 'unknown'), 'edited', l.before, l.after, l.source, l.created_by, l.created_at
from public.ceq_edit_log l
where l.kind = 'callout'
  and coalesce(l.target, '') <> ''
  and not exists (
    select 1 from public.frame_events e
    where e.event = 'edited' and e.frame_id = l.target and e.created_at = l.created_at and e.source = l.source
  );

commit;
