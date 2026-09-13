-- 20260913_1000 — THE FRAME LEARNING LOOP.
--
-- Lee, 2026-09-13 (Studio: Split + Slide Generation + Style Learning, prompt 2): capture training
-- signal on frame generation, distinguishing four outcomes per frame because they are different
-- failures —
--   · generated as-is and filmed          the draft was correct
--   · edited then filmed                  style signal: the generated text AND the final text
--   · generated then deleted              over-production: the generator made a frame that
--                                         should not exist — the most useful of the four
--   · filmed then abandoned               copy that reads fine but speaks badly, with a reason
-- plus a generation VERSION per frame set (re-running never clobbers) and a queryable frame count.
--
-- WHY A LEDGER BESIDE THE PLAN. Frames live as JSON in canvas_scenes.nodes_json → decks[].blastOff
-- .frames, and that serialization is protected. So nothing moves: generation RUNS, the frames each
-- run produced (their text frozen as generated), and the EVENTS that happen to frames afterwards
-- are three append-only tables keyed by the plan's frame id. The outcomes are a VIEW over the
-- events, never a status column — a frame can be edited, filmed, abandoned and filmed again, and a
-- stored status would lie about that.
--
-- DECISIONS LEE MADE (2026-09-13):
--   1. A frame counts as FILMED when a take containing it is POSTED — written at Post time for
--      every frame in that take's run. Not "on screen while F4 rolled", which fires on every
--      rehearsal and false start.
--   2. ABANDONED is an explicit gesture: F3 on /film marks the slide on screen, and he says why.
--      The reason is the dictated text; take_ref / take_offset_ms say where in the recording.
--   3. ceq_edit_log STAYS (Shorten reads it as few-shot examples). Edits are mirrored into
--      frame_events as well.
--   4. The baseline backfill runs after this migration (20260913_1010_frame_learning_baseline.ts):
--      one `baseline` per existing plan frame, and the callout rows of ceq_edit_log copied in as
--      `edited` events. NO generation rows are fabricated for existing frames — nothing tracked
--      generated them, and pretending otherwise would poison the signal. They report
--      provenance = 'unknown'.
--
-- A DRAFT PASS DOES NOT POLLUTE. A draft run has status 'draft' and its generated_frames have
-- frame_id NULL — no event can attach to them, so frame_outcomes never sees them. They are kept
-- for comparison and are invisible to the topic's frame record.
--
-- Additive only. RLS deny-by-default like ceq_edit_log / cost_events / teleprompter_feedback: all
-- access is through service-role server fns. The views are security_invoker, so they inherit that.
-- SQL LEE MUST RUN — never auto-run.

begin;

-- ─────────────────────────────────────────────────────────────────────────── generation runs ──
create table if not exists public.frame_generations (
  id uuid primary key default gen_random_uuid(),
  -- the deck (set) the run belongs to, and the chapters row when known
  set_id text not null,
  topic_id text null,
  -- what "the same topic" means for versioning: topic:<id> · set:<id> · reel:<setId>#<headFrameId>
  scope_key text not null,
  version integer not null,
  -- the run this one re-ran, or split further (split-of-a-split lineage)
  parent_generation_id uuid null references public.frame_generations (id) on delete restrict,
  generator text not null,
  status text not null default 'draft',
  -- stored at generation time: count is a signal (prompt 3)
  frame_count integer not null,
  reel_count integer null,
  model text null,
  -- a label or hash of the system prompt that produced it
  prompt_version text null,
  -- the never-do entries injected into the call (prompt 4)
  constraint_ids uuid[] null,
  -- what went in (the Reel's slides, his spoken note) and the raw answer, kept even if never built
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  cost_usd numeric(10, 4) null,
  created_by text null,
  created_at timestamptz not null default now(),
  built_at timestamptz null,
  constraint frame_generations_scope_version_uq unique (scope_key, version),
  constraint frame_generations_version_ck check (version >= 1),
  constraint frame_generations_counts_ck check (frame_count >= 0 and (reel_count is null or reel_count >= 0)),
  constraint frame_generations_generator_ck check (generator in ('split_run', 'slide_text', 'strategy_short', 'draft_pass')),
  constraint frame_generations_status_ck check (status in ('draft', 'built', 'discarded', 'superseded')),
  constraint frame_generations_built_at_ck check (status <> 'built' or built_at is not null)
);
comment on table public.frame_generations is
  'One frame-generation run per row (a "frame set"): what went in, the raw proposal, the frame count, and a version per scope_key so a re-run is a second comparable set rather than an overwrite. Drafts are kept and never reach frame_outcomes.';
create index if not exists frame_generations_set_idx on public.frame_generations (set_id, created_at desc);
create index if not exists frame_generations_status_idx on public.frame_generations (status, created_at desc);
alter table public.frame_generations enable row level security;

-- ──────────────────────────────────────────────────────────────── the frames a run produced ──
create table if not exists public.generated_frames (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.frame_generations (id) on delete restrict,
  -- which proposed Reel (split runs), and the order inside it
  reel_index integer null,
  position integer not null,
  kind text not null,
  -- THE COPY AS GENERATED, frozen: title / text / bullets / display / needs / ceqId. The "before".
  generated jsonb not null,
  -- the plan frame id once built; NULL while the run is a draft
  frame_id text null,
  created_at timestamptz not null default now(),
  constraint generated_frames_position_ck check (position >= 0 and (reel_index is null or reel_index >= 0))
);
comment on table public.generated_frames is
  'One frame a generation run produced, with its copy frozen as generated. frame_id is set when the run is built into a plan; a draft run''s frames keep it NULL.';
-- one slot per position in a Reel (reel_index NULL counts as its own Reel)
create unique index if not exists generated_frames_slot_uq on public.generated_frames (generation_id, coalesce(reel_index, -1), position);
create index if not exists generated_frames_frame_idx on public.generated_frames (frame_id) where frame_id is not null;
alter table public.generated_frames enable row level security;

-- ───────────────────────────────────────────────────────── everything that happens to a frame ──
create table if not exists public.frame_events (
  id uuid primary key default gen_random_uuid(),
  frame_id text not null,
  set_id text not null,
  -- NULL for frames with no known generation (every frame that existed before this migration)
  generated_frame_id uuid null references public.generated_frames (id) on delete restrict,
  event text not null,
  -- edited: the words either side. deleted: `before` is the WHOLE frame — the tombstone that makes
  -- a deletion recoverable. baseline: `after` is the frame as it stood when tracking began.
  before jsonb null,
  after jsonb null,
  source text null,
  -- filmed / take_abandoned: which take (publish key or capture session), and where in it
  take_ref text null,
  take_offset_ms integer null,
  -- take_abandoned: why the line did not work out loud — what he says after F3
  reason text null,
  created_by text null,
  created_at timestamptz not null default now(),
  constraint frame_events_event_ck check (event in ('baseline', 'built', 'edited', 'skipped', 'unskipped', 'deleted', 'restored', 'filmed', 'take_abandoned')),
  constraint frame_events_source_ck check (source is null or source in ('manual', 'shorten', 'shorten-edited', 'slide_text', 'split_run', 'backfill')),
  constraint frame_events_edited_ck check (event <> 'edited' or (before is not null and after is not null)),
  constraint frame_events_deleted_ck check (event <> 'deleted' or before is not null),
  constraint frame_events_abandoned_ck check (event <> 'take_abandoned' or (reason is not null and length(btrim(reason)) between 1 and 2000)),
  constraint frame_events_offset_ck check (take_offset_ms is null or take_offset_ms >= 0)
);
comment on table public.frame_events is
  'Append-only: every lifecycle event on a plan frame — baseline, built, edited, skipped, deleted, restored, filmed (at Post), take_abandoned (F3 on /film, with the spoken reason). frame_outcomes derives the four outcomes from these rows.';
create index if not exists frame_events_frame_idx on public.frame_events (frame_id, created_at);
create index if not exists frame_events_generated_idx on public.frame_events (generated_frame_id) where generated_frame_id is not null;
create index if not exists frame_events_event_idx on public.frame_events (event, created_at desc);
create index if not exists frame_events_set_idx on public.frame_events (set_id, created_at desc);
alter table public.frame_events enable row level security;

-- ──────────────────────────────────────────────────────────────────────────── the outcomes ──
-- Per plan frame, evaluated in this precedence (first match wins):
--   deleted             its last deleted is not followed by a restored
--   abandoned           its last take_abandoned is not followed by a filmed
--   edited_then_filmed  filmed, and at least one edited before the last filmed
--   filmed_as_is        filmed, with no edit before it
--   pending             none of the above yet
-- provenance says whether a generation stands behind the frame. "Generated then deleted" is
-- outcome = 'deleted' AND provenance = 'generated'.
create or replace view public.frame_outcomes with (security_invoker = true) as
with agg as (
  select
    e.frame_id,
    max(e.set_id) as set_id,
    (array_agg(e.generated_frame_id order by e.created_at) filter (where e.generated_frame_id is not null))[1] as generated_frame_id,
    max(e.created_at) filter (where e.event = 'filmed') as last_filmed_at,
    max(e.created_at) filter (where e.event = 'deleted') as last_deleted_at,
    max(e.created_at) filter (where e.event = 'restored') as last_restored_at,
    max(e.created_at) filter (where e.event = 'take_abandoned') as last_abandoned_at,
    count(*) as events
  from public.frame_events e
  group by e.frame_id
)
select
  a.frame_id,
  a.set_id,
  a.generated_frame_id,
  case when a.generated_frame_id is null then 'unknown' else 'generated' end as provenance,
  case
    when a.last_deleted_at is not null and (a.last_restored_at is null or a.last_restored_at < a.last_deleted_at) then 'deleted'
    when a.last_abandoned_at is not null and (a.last_filmed_at is null or a.last_filmed_at < a.last_abandoned_at) then 'abandoned'
    when a.last_filmed_at is not null and exists (
      select 1 from public.frame_events x where x.frame_id = a.frame_id and x.event = 'edited' and x.created_at < a.last_filmed_at
    ) then 'edited_then_filmed'
    when a.last_filmed_at is not null then 'filmed_as_is'
    else 'pending'
  end as outcome,
  -- the recoverable diff: what the generator wrote, and the last edit before the film
  gf.generated as generated_copy,
  (select x.after from public.frame_events x
     where x.frame_id = a.frame_id and x.event = 'edited' and (a.last_filmed_at is null or x.created_at <= a.last_filmed_at)
     order by x.created_at desc limit 1) as final_copy,
  (select x.reason from public.frame_events x
     where x.frame_id = a.frame_id and x.event = 'take_abandoned'
     order by x.created_at desc limit 1) as abandon_reason,
  a.last_filmed_at,
  a.last_deleted_at,
  a.last_abandoned_at,
  a.events
from agg a
left join public.generated_frames gf on gf.id = a.generated_frame_id;
comment on view public.frame_outcomes is
  'The four outcomes per plan frame, derived from frame_events: deleted / abandoned / edited_then_filmed / filmed_as_is / pending, with provenance generated|unknown and the generated-vs-final copy.';

-- ─────────────────────────────────────────────────────────────── the count, per set and Reel ──
create or replace view public.generation_counts with (security_invoker = true) as
select
  g.id as generation_id,
  g.set_id,
  g.scope_key,
  g.version,
  g.generator,
  g.status,
  g.created_at,
  gf.reel_index,
  count(gf.id) as frames,
  count(gf.frame_id) as built,
  count(*) filter (where o.outcome = 'deleted') as deleted,
  count(*) filter (where o.outcome in ('filmed_as_is', 'edited_then_filmed')) as filmed,
  count(*) filter (where o.outcome = 'edited_then_filmed') as edited_then_filmed,
  count(*) filter (where o.outcome = 'abandoned') as abandoned
from public.frame_generations g
left join public.generated_frames gf on gf.generation_id = g.id
left join public.frame_outcomes o on o.frame_id = gf.frame_id
group by g.id, gf.reel_index;
comment on view public.generation_counts is
  'Frame count per generation run and per proposed Reel, with how many were built, deleted, filmed, edited-then-filmed and abandoned — the count signal the split step reads.';

commit;
