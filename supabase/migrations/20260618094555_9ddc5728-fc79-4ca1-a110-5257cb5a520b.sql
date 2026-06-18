-- Scrape jobs queue (faculty + RMP) — durable across reloads + worker timeouts.
CREATE TABLE public.scrape_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL,
  campus_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('faculty','rmp')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_jobs TO authenticated;
GRANT ALL ON public.scrape_jobs TO service_role;

ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Internal admin tool: any signed-in user (you / VAs) can read & manage jobs.
CREATE POLICY "Authenticated can read scrape_jobs"
  ON public.scrape_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert scrape_jobs"
  ON public.scrape_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update scrape_jobs"
  ON public.scrape_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete scrape_jobs"
  ON public.scrape_jobs FOR DELETE TO authenticated USING (true);

-- Speeds up the watchdog scan + HUD ordering.
CREATE INDEX scrape_jobs_status_started_at_idx
  ON public.scrape_jobs (status, started_at DESC);
CREATE INDEX scrape_jobs_started_at_idx
  ON public.scrape_jobs (started_at DESC);

-- Realtime: stream insert/update/delete so the HUD reflects every tab + the watchdog.
ALTER TABLE public.scrape_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_jobs;

-- Watchdog: any job stuck in 'running' for >8 minutes gets force-failed.
-- Called by pg_cron every 2 minutes (scheduled separately, outside this migration).
CREATE OR REPLACE FUNCTION public.fail_stale_scrape_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.scrape_jobs
     SET status = 'error',
         finished_at = now(),
         message = COALESCE(
           NULLIF(message, ''),
           'Timed out — worker died mid-scrape (watchdog)'
         )
   WHERE status = 'running'
     AND started_at < now() - INTERVAL '8 minutes';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_stale_scrape_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_stale_scrape_jobs() TO authenticated, service_role;
