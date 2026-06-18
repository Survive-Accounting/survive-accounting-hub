
ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.outreach_email_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outreach_campaigns_template_id_idx
  ON public.outreach_campaigns (template_id) WHERE template_id IS NOT NULL;
