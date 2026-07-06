-- 0049_profintel_warmup — automated cold-domain warmup for ProfIntel sending.
-- The daily send cap ramps automatically (15 → 22 → 30 → 38 → 40 over ~4 weeks),
-- anchored to the date the FIRST real email sends. daily_send_cap stays as the
-- ceiling (40); the worker computes today's effective cap = min(ramp, ceiling).
-- Idempotent.
alter table public.profintel_settings
  add column if not exists warmup_start_date date;

comment on column public.profintel_settings.warmup_start_date is
  'Set to the date the first ProfIntel email sends. Anchors the automatic warmup ramp. Null until first send.';
