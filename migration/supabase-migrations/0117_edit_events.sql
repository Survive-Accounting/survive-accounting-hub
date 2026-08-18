-- 0117 — EDIT EVENTS: the Pipeline's trim-telemetry log (P4).
--
-- WHY (08-18): every trim in the Pipeline view — auto-proposed, dragged, or
-- nudged — is a data point about the X/Y pre/post-roll rule. After a few
-- hundred real edits this table answers, with evidence: how often does an
-- auto-proposal get ACCEPTED as-is, merely NUDGED, or OVERRIDDEN — and by how
-- many milliseconds? That is what tunes the rule. No dashboards; the app has
-- an EXPORT EDIT LOG button and this is its source of truth across origins.
--
-- Same architecture as idea_notes (0115): the client is local-first with a
-- derived sync queue; `id` is TEXT and client-minted so the upsert is
-- idempotent and a queued retry can never duplicate an event. Events are
-- immutable facts — nothing here is ever updated or deleted by the app.

create table if not exists public.edit_events (
  id             text primary key,
  at             timestamptz not null,
  set_id         text not null,
  ceq_id         text,
  take_path      text not null,
  take_name      text,
  duration_s     numeric,
  slate_end_ms   integer,
  onset_ms       integer,
  offset_ms      integer,
  proposed_in_s  numeric,
  proposed_out_s numeric,
  final_in_s     numeric not null,
  final_out_s    numeric not null,
  how            text not null check (how in ('propose', 'drag', 'nudge')),
  disposition    text not null check (disposition in ('proposed', 'accepted', 'nudged', 'overridden')),
  rule_version   text not null,
  pre_roll_ms    integer not null,
  post_roll_ms   integer not null,
  created_at     timestamptz not null default now()
);

comment on table public.edit_events is
  'Pipeline trim telemetry (P4). One row per trim decision: what detection said, what PROPOSE proposed, what Lee finally set, and how far apart those were. Authoring-only, never student-facing. Append-only; clients queue local-first and upsert on client-minted ids.';
comment on column public.edit_events.id is
  'Client-minted "edit-<epochms>-<seq>-<rand>" — makes the upsert idempotent so a queued retry can never duplicate an event.';
comment on column public.edit_events.disposition is
  'proposed = the PROPOSE TRIMS write itself · accepted = hand-confirmed within 10ms of the proposal · nudged = within 300ms · overridden = further, or no proposal existed.';
comment on column public.edit_events.rule_version is
  'landmarks.TRIM_RULE_VERSION at event time — distinguishes "the rule was wrong" from "the rule changed" when analyzing.';

create index if not exists edit_events_at_idx  on public.edit_events (at desc);
create index if not exists edit_events_set_idx on public.edit_events (set_id, at desc);

-- DENY BY DEFAULT. No policies are created, so anon/authenticated get nothing;
-- every read and write goes through a server function on the service role —
-- same shape as idea_notes, orders, and campus_exams.
alter table public.edit_events enable row level security;
