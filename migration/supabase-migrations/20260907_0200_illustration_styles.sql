-- THE ILLUSTRATION STYLE REGISTRY, AS DATA (Lee's v6 workshop, 2026-09-06 —
-- docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, Part 2): "Build a style editor so the illustration
-- style can be changed from the app and regenerated, without a code change each time."
-- "Storage: move ILLUSTRATION_STYLES from hardcoded to DB-backed, seeded with the current
-- entries so nothing breaks."
--
-- One row per (id, version). The code keeps the same styles as STYLE_SEEDS
-- (src/components/blastoff/illustration.ts) — the fallback when this table is missing AND the
-- seed that fills it (seedIllustrationStyles, idempotent: only (id, version) pairs not yet here
-- are written). Reading (getRegistry) overlays the seeds with these rows: the highest version
-- per id wins, a DB row winning a tie.
--
-- WHY EVERY VERSION IS ITS OWN ROW. "Save as new version" inserts a row and leaves the old one;
-- "Save without bumping" updates the latest row in place ("typo fixes that shouldn't invalidate
-- the library"). The old rows are never deleted: the editor's test panel runs the same subject
-- against every saved version side by side, and an illustration stamped with an older version
-- shows stale in the bank (isStaleIllustration) — the existing stale mechanism does the rest.
--
-- The SETTINGS beside it (which style is the exam default, which the strategy shorts', and the
-- edited BRIEF_SYSTEM) live in the existing site_settings.settings jsonb under `illustration`
-- → { defaultStyleId, strategyStyleId, briefSystem } — the rep-onboarding-videos pattern, no
-- second table.
--
-- Additive, idempotent, no data rewritten. The code gates loudly: saving a style with this
-- table missing throws "run migration/supabase-migrations/20260907_0200_illustration_styles.sql";
-- reading without it silently serves the code seeds (source: "code") so nothing that only
-- reads the registry ever breaks.
--
-- RLS: deny-by-default like illustration_library (20260905_2200) — all access rides the
-- service-role server fns in src/lib/illustration-registry.functions.ts.
BEGIN;

create table if not exists public.illustration_styles (
  id text not null,
  version integer not null,
  label text not null,
  provider text not null default 'recraft',
  model text not null,
  size text not null,
  prompt_prefix text not null,
  prompt_suffix text not null,
  -- Recraft `controls`: { background_color: { rgb: [r,g,b] }, colors: [{ rgb, weight }] }.
  -- Weights each 0–1 and summing to at most 1 — Recraft rejects the call above 1 (the
  -- dreamstate v2 lesson: it shipped at 1.5 and every generation failed). Validated in code.
  controls jsonb not null,
  -- The env var that may hold a Recraft custom style id for this preset.
  style_id_env text not null,
  default_animation text not null default 'drift',
  retired boolean not null default false,
  -- What changed, in Lee's words — the design record, per version.
  note text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, version)
);

comment on table public.illustration_styles is
  'Illustration style registry, one row per (id, version). Seeded from STYLE_SEEDS in src/components/blastoff/illustration.ts; edited at /admin/illustrations/styles. Old versions stay (stale detection + the test panel).';
comment on column public.illustration_styles.controls is
  'Recraft controls: background_color.rgb + colors[].{rgb, weight}; weights sum <= 1.';
comment on column public.illustration_styles.note is
  'What changed in this version, Lee''s words.';

alter table public.illustration_styles enable row level security;
-- no policies: deny-by-default; service-role bypasses RLS.

COMMIT;

-- Proof it applied: the table exists with its composite key.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'illustration_styles'
order by ordinal_position;
