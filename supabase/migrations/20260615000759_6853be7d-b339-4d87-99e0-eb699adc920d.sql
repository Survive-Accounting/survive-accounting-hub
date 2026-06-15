
-- 1. Schema additions
ALTER TABLE public.outreach_va_campus_assignments
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'claimed';

-- allow nullable assigned_for_date for the new claim model
ALTER TABLE public.outreach_va_campus_assignments
  ALTER COLUMN assigned_for_date DROP NOT NULL;

-- status check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outreach_va_campus_assignments_status_check'
  ) THEN
    ALTER TABLE public.outreach_va_campus_assignments
      ADD CONSTRAINT outreach_va_campus_assignments_status_check
      CHECK (status IN ('claimed','approved','released'));
  END IF;
END $$;

-- backfill existing rows so they don't block new claims
UPDATE public.outreach_va_campus_assignments
SET status = 'released', released_at = COALESCE(released_at, now())
WHERE status = 'claimed' AND claim_expires_at IS NULL;

-- 2. Partial unique index: only one active claim per campus
CREATE UNIQUE INDEX IF NOT EXISTS outreach_va_campus_assignments_active_claim_uidx
  ON public.outreach_va_campus_assignments (campus_id)
  WHERE status = 'claimed';

CREATE INDEX IF NOT EXISTS outreach_va_campus_assignments_status_expires_idx
  ON public.outreach_va_campus_assignments (status, claim_expires_at);

-- 3. RLS: allow update/delete of own claim, or of expired claims
DROP POLICY IF EXISTS "Admins can update own or expired claims" ON public.outreach_va_campus_assignments;
CREATE POLICY "Admins can update own or expired claims"
ON public.outreach_va_campus_assignments
FOR UPDATE
TO authenticated
USING (
  assigned_by_email = auth.email()
  OR (status = 'claimed' AND claim_expires_at IS NOT NULL AND claim_expires_at < now())
)
WITH CHECK (true);

-- 4. Sweeper: release expired claims every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('release-expired-campus-claims');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'release-expired-campus-claims',
  '*/5 * * * *',
  $$
  UPDATE public.outreach_va_campus_assignments
  SET status = 'released', released_at = now()
  WHERE status = 'claimed'
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now();
  $$
);
