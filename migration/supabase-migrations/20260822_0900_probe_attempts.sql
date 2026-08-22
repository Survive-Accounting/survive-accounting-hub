-- 20260822_0900_probe_attempts.sql — Exhibit Lab probe attempts (Exhibit Lab v2, §7).
-- MANUAL-APPLY via run_sql.ts (dry run first). Idempotent. NOT APPLIED BY THE BRANCH —
-- handed to Lee; the Lab fails soft (local queue) until it exists.
--
-- Mirrors practice_attempts: one row per EVENT on an exhibit step — an attempt (with the
-- response, correctness when machine-checkable, and ask→answer ms) or an explicit skip.
-- RECORD FROM DAY ONE, BUILD NOTHING ON TOP: there is no read path in this pass — no
-- routing, no remediation, no analytics. Keys are the STABLE ids (exhibit id, probe id,
-- step id, ref key "exhibit:probe"), never display labels, so renaming a step never
-- corrupts history. Written by the anon client through a server fn (service role);
-- RLS deny-by-default.
create table if not exists public.probe_attempts (
  id uuid primary key default gen_random_uuid(),
  exhibit_id text not null,          -- "cycle" | "rubric" (ExhibitId)
  probe_id text not null,            -- ProbeId, e.g. "four_questions"
  step text not null,                -- RunStep id, e.g. "r1.type"
  event text not null default 'attempt' check (event in ('attempt', 'skip')),
  response text,                     -- null for skip
  correct boolean,                   -- null for skip / ungraded (text reflections)
  ms integer,                        -- ask → answer/skip
  ref_key text not null,             -- "exhibit:probe" — the addressable ExhibitProbeRef
  seed text,                         -- JSON of the ref's seed (scenario, step, mode), ≤120 chars
  session_id text not null,          -- client session (sessionStorage uuid)
  user_id uuid references auth.users(id) on delete set null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists probe_attempts_ref_idx on public.probe_attempts (ref_key, created_at desc);
create index if not exists probe_attempts_step_idx on public.probe_attempts (exhibit_id, probe_id, step);
create index if not exists probe_attempts_session_idx on public.probe_attempts (session_id);
alter table public.probe_attempts enable row level security;  -- service-role only
