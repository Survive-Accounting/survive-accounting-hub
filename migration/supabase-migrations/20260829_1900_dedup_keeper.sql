-- Dedup merge support: each flagged duplicate points at the record it should merge INTO
-- (the keeper — the active identity). The merge tool groups losers by keeper, shows the
-- field-by-field comparison, and on approval copies the richest value per field onto the
-- keeper and marks the loser 'excluded'.

alter table public.campuses
  add column if not exists dedup_keeper_id uuid references public.campuses(id) on delete set null,
  add column if not exists merged_into_id  uuid references public.campuses(id) on delete set null,
  add column if not exists merged_at        timestamptz;

comment on column public.campuses.dedup_keeper_id is
  'For a dedup_review record: the keeper campus it should merge into. Null on keepers.';
comment on column public.campuses.merged_into_id is
  'Set once a merge is applied: this record was merged into that keeper and excluded.';

create index if not exists campuses_dedup_keeper_idx on public.campuses (dedup_keeper_id);
