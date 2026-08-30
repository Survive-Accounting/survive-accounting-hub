-- Growth Board V2 — the "launch list".
--
-- King's board shows a curated set of campuses we're actually going to market. Every
-- ranked campus is IN the launch list by default; parking one removes it from King's
-- working list (and, in a later phase, from the school pickers students see). This is
-- the "prune down campuses that don't need outreach yet" control from the V2 plan.
--
-- Stored on the existing per-campus pins table so there's one row per campus for all
-- manual growth state (pin, manual priority, and now parked).

alter table public.growth_campus_pins
  add column if not exists parked boolean not null default false;

comment on column public.growth_campus_pins.parked is
  'Growth V2: true = removed from the launch list (no outreach, hidden from King''s default view). Default false = in the launch list.';
