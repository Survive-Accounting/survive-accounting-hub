-- 0093_principles_and_tags.sql
-- PRINCIPLES AS TAGGABLE OBJECTS. A seeded vocabulary of the 4 assumptions + 4
-- principles, plus a scenario↔principle tag join so the picker/decks can FILTER
-- by principle ("every card tagged Revenue Recognition" for the Ch 9 payoff).
--
-- CARD + MEMO tags live in the scene JSON (node data.principleTags) — those are
-- canvas nodes, not DB rows — so this migration only covers the vocabulary and the
-- SCENARIO join. blurb is LEFT EMPTY: Lee writes it. Do NOT auto-tag anything.
--
-- Named `principles` (not the existing /je `je_principles`, which stays untouched).
-- Idempotent; safe to re-run. Numbered after 0092.

-- ============================================================================
-- PART 1 — principles vocabulary
-- ============================================================================
create table if not exists public.principles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('assumption', 'principle')),
  slug text unique not null,
  blurb text,                     -- LEFT EMPTY on seed — Lee authors it
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.principles enable row level security;
drop policy if exists "anon select principles" on public.principles;
create policy "anon select principles" on public.principles for select to anon using (true);
drop policy if exists "auth all principles" on public.principles;
create policy "auth all principles" on public.principles for all to authenticated using (true) with check (true);

-- Seed the 8 (blurb NULL — Lee's voice). Idempotent by slug.
insert into public.principles (name, kind, slug, sort)
select v.name, v.kind, v.slug, v.sort
from (values
  ('Business Entity', 'assumption', 'business-entity', 1),
  ('Monetary Unit', 'assumption', 'monetary-unit', 2),
  ('Periodicity', 'assumption', 'periodicity', 3),
  ('Going Concern', 'assumption', 'going-concern', 4),
  ('Historical Cost', 'principle', 'historical-cost', 5),
  ('Revenue Recognition', 'principle', 'revenue-recognition', 6),
  ('Expense Recognition (Matching)', 'principle', 'expense-recognition-matching', 7),
  ('Full Disclosure', 'principle', 'full-disclosure', 8)
) as v(name, kind, slug, sort)
where not exists (select 1 from public.principles p where p.slug = v.slug);

-- ============================================================================
-- PART 2 — scenario↔principle tags (many-to-many). Lee tags scenarios manually;
-- nothing is auto-tagged. The Ch 9 filter reads this join for scenarios and reads
-- node data.principleTags for cards/memos (canvas-side).
-- ============================================================================
create table if not exists public.scenario_principles (
  scenario_id uuid not null references public.je_scenarios(id) on delete cascade,
  principle_id uuid not null references public.principles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scenario_id, principle_id)
);

create index if not exists scenario_principles_principle_idx on public.scenario_principles(principle_id);

alter table public.scenario_principles enable row level security;
drop policy if exists "anon select scenario_principles" on public.scenario_principles;
create policy "anon select scenario_principles" on public.scenario_principles for select to anon using (true);
drop policy if exists "auth all scenario_principles" on public.scenario_principles;
create policy "auth all scenario_principles" on public.scenario_principles for all to authenticated using (true) with check (true);
