ALTER TABLE public.outreach_settings
  ADD COLUMN IF NOT EXISTS global_daily_send_limit integer NOT NULL DEFAULT 50;