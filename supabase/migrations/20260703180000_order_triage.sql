-- Order triage layer: quote / build-estimate / promised-delivery / tool-coverage
-- fields, plus two new workflow statuses ('gameplan_sent', 'approved'). All new
-- columns are nullable (no backfill). The status CHECK is widened (superset of
-- the old set — existing rows, all 'new', stay valid). Applied live via the
-- Management API on 2026-07-03.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quote_cents int,
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_build_minutes int,
  ADD COLUMN IF NOT EXISTS promised_delivery_date date,
  ADD COLUMN IF NOT EXISTS tool_exists boolean,
  ADD COLUMN IF NOT EXISTS triage_notes text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['new','gameplan_sent','approved','in_progress','delivered','paid','cancelled']));
