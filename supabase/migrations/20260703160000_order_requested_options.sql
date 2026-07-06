-- Multi-select help options on /order. Students can now pick more than one of
-- {made_to_order, one_on_one, something_else}; `tier` still holds the PRIMARY
-- pick (for pricing/notify), while `requested_options` records the full set as a
-- jsonb array of the option keys. Additive, default '[]'. Applied live via the
-- Management API 2026-07-03.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requested_options jsonb NOT NULL DEFAULT '[]'::jsonb;
