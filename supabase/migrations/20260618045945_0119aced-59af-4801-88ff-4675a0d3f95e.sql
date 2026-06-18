ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN IF NOT EXISTS title_tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS title_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS outreach_leads_title_tags_gin
  ON public.outreach_leads USING GIN (title_tags);

CREATE INDEX IF NOT EXISTS campus_lead_suggestions_title_tags_gin
  ON public.campus_lead_suggestions USING GIN (title_tags);