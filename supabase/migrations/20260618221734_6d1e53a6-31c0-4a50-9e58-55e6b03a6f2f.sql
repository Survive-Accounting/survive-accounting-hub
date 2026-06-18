
CREATE TABLE public.scrape_debug_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL,
  campus_name TEXT,
  kind TEXT NOT NULL,
  scrape_job_id UUID,
  duration_ms INTEGER,
  credits_estimate_usd NUMERIC(10,5),
  urls_attempted INTEGER NOT NULL DEFAULT 0,
  contacts_inserted INTEGER NOT NULL DEFAULT 0,
  contacts_with_email INTEGER NOT NULL DEFAULT 0,
  host_fail_count INTEGER NOT NULL DEFAULT 0,
  news_filter_hits INTEGER NOT NULL DEFAULT 0,
  pagination_walked INTEGER NOT NULL DEFAULT 0,
  map_fallback_used BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_debug_bundles TO authenticated;
GRANT ALL ON public.scrape_debug_bundles TO service_role;

ALTER TABLE public.scrape_debug_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scrape_debug_bundles"
  ON public.scrape_debug_bundles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert scrape_debug_bundles"
  ON public.scrape_debug_bundles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update scrape_debug_bundles"
  ON public.scrape_debug_bundles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete scrape_debug_bundles"
  ON public.scrape_debug_bundles FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_scrape_debug_bundles_created ON public.scrape_debug_bundles (created_at DESC);
CREATE INDEX idx_scrape_debug_bundles_campus ON public.scrape_debug_bundles (campus_id, created_at DESC);

CREATE TABLE public.scrape_improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID REFERENCES public.scrape_debug_bundles(id) ON DELETE CASCADE,
  campus_id UUID,
  campus_name TEXT,
  model TEXT,
  pattern_tag TEXT,
  severity TEXT,
  title TEXT,
  suggestion TEXT NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_improvement_suggestions TO authenticated;
GRANT ALL ON public.scrape_improvement_suggestions TO service_role;

ALTER TABLE public.scrape_improvement_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scrape_improvement_suggestions"
  ON public.scrape_improvement_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert scrape_improvement_suggestions"
  ON public.scrape_improvement_suggestions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update scrape_improvement_suggestions"
  ON public.scrape_improvement_suggestions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete scrape_improvement_suggestions"
  ON public.scrape_improvement_suggestions FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_scrape_suggestions_created ON public.scrape_improvement_suggestions (created_at DESC);
CREATE INDEX idx_scrape_suggestions_tag ON public.scrape_improvement_suggestions (pattern_tag);
