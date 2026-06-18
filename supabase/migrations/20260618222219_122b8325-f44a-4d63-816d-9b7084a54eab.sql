
CREATE TABLE public.scraper_fix_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tags TEXT[] NOT NULL DEFAULT '{}',
  suggestion_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_fix_milestones TO authenticated;
GRANT ALL ON public.scraper_fix_milestones TO service_role;

ALTER TABLE public.scraper_fix_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scraper_fix_milestones"
  ON public.scraper_fix_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert scraper_fix_milestones"
  ON public.scraper_fix_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update scraper_fix_milestones"
  ON public.scraper_fix_milestones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete scraper_fix_milestones"
  ON public.scraper_fix_milestones FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_scraper_fix_milestones_deployed ON public.scraper_fix_milestones (deployed_at DESC);

CREATE TABLE public.scraper_performance_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  model TEXT,
  summary TEXT,
  what_changed JSONB,
  fix_attribution JSONB,
  vertical_applicability JSONB,
  metrics_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_performance_verdicts TO authenticated;
GRANT ALL ON public.scraper_performance_verdicts TO service_role;

ALTER TABLE public.scraper_performance_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scraper_performance_verdicts"
  ON public.scraper_performance_verdicts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert scraper_performance_verdicts"
  ON public.scraper_performance_verdicts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update scraper_performance_verdicts"
  ON public.scraper_performance_verdicts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete scraper_performance_verdicts"
  ON public.scraper_performance_verdicts FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_scraper_perf_verdicts_created ON public.scraper_performance_verdicts (created_at DESC);

ALTER TABLE public.scrape_improvement_suggestions
  ADD COLUMN applies_to_verticals TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN shipped_at TIMESTAMPTZ,
  ADD COLUMN milestone_id UUID REFERENCES public.scraper_fix_milestones(id) ON DELETE SET NULL;

ALTER TABLE public.scraper_fix_milestones
  ADD CONSTRAINT scraper_fix_milestones_suggestion_id_fkey
  FOREIGN KEY (suggestion_id) REFERENCES public.scrape_improvement_suggestions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.scraper_fix_milestones_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER scraper_fix_milestones_updated_at
  BEFORE UPDATE ON public.scraper_fix_milestones
  FOR EACH ROW EXECUTE FUNCTION public.scraper_fix_milestones_set_updated_at();
