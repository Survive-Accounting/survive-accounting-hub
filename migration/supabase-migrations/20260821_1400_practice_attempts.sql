-- 20260821_1400_practice_attempts.sql — CEQ practice analytics from day one (spec: Analytics).
-- MANUAL-APPLY via run_sql.ts. Idempotent.
--
-- One row per EVENT in cram mode: an answer (with the choice, correctness, and reveal→lock-in
-- ms), a skip (stepped past without answering), or an abandon (the last question reached when
-- the set was left). Keys are the STABLE ids (deck id + CEQ node id), never display numbers, so
-- re-ordering a set never corrupts history. Written by the anon client through a server fn
-- (service role); RLS deny-by-default.
create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,              -- DeckDef.id
  ceq_id text not null,              -- CEQ node id
  event text not null default 'answer' check (event in ('answer', 'skip', 'abandon')),
  choice_id text,                    -- null for skip/abandon
  correct boolean,                   -- null for skip/abandon
  ms integer,                        -- reveal → lock-in (answer only)
  attempt_number int not null default 1,  -- 1 = first pass, 2+ = "retry the ones you missed"
  session_id text not null,          -- client session (sessionStorage uuid)
  user_id uuid references auth.users(id) on delete set null,
  campus text,                       -- campus slug/name when known
  surface text,                      -- home | campus | greek | learn
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists practice_attempts_ceq_idx on public.practice_attempts (ceq_id, created_at desc);
create index if not exists practice_attempts_set_idx on public.practice_attempts (set_id, created_at desc);
create index if not exists practice_attempts_session_idx on public.practice_attempts (session_id);
alter table public.practice_attempts enable row level security;  -- service-role only
