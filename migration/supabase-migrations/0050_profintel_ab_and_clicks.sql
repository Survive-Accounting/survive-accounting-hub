-- 0050_profintel_ab_and_clicks — A/B testing + click/engagement tracking.
--   profintel_sends: which template variant a send used, and click tracking
--     (clicked_at first-click, click_count total, last_clicked_url).
--   profintel_template: a second variant (subject_b/body_b) + an A/B on/off flag.
--     Variant A stays the existing subject/body. Idempotent.
alter table public.profintel_sends
  add column if not exists variant text,
  add column if not exists clicked_at timestamptz,
  add column if not exists click_count integer not null default 0,
  add column if not exists last_clicked_url text;

alter table public.profintel_template
  add column if not exists subject_b text,
  add column if not exists body_b text,
  add column if not exists ab_enabled boolean not null default false;

create index if not exists profintel_sends_variant_idx on public.profintel_sends (variant);
create index if not exists profintel_sends_clicked_idx
  on public.profintel_sends (clicked_at) where clicked_at is not null;
