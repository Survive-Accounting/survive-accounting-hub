
CREATE TABLE public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'cold_sequence'
    CHECK (campaign_type IN ('cold_sequence','broadcast')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','running','paused','completed','cancelled')),
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_leads integer NOT NULL DEFAULT 0,
  total_campuses integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 50,
  estimated_days integer,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read campaigns" ON public.outreach_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert campaigns" ON public.outreach_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update campaigns" ON public.outreach_campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete campaigns" ON public.outreach_campaigns FOR DELETE TO authenticated USING (true);
CREATE INDEX outreach_campaigns_status_idx ON public.outreach_campaigns (status);
CREATE INDEX outreach_campaigns_type_idx   ON public.outreach_campaigns (campaign_type);
CREATE TRIGGER outreach_campaigns_set_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.outreach_campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  outreach_lead_id uuid NOT NULL REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  email text,
  first_name text,
  last_name text,
  lead_type text,
  course_family text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','scheduled','sent','replied','stopped','bounced','skipped')),
  sequence_step integer NOT NULL DEFAULT 0,
  scheduled_send_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaign_leads TO authenticated;
GRANT ALL ON public.outreach_campaign_leads TO service_role;
ALTER TABLE public.outreach_campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read campaign leads" ON public.outreach_campaign_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert campaign leads" ON public.outreach_campaign_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update campaign leads" ON public.outreach_campaign_leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete campaign leads" ON public.outreach_campaign_leads FOR DELETE TO authenticated USING (true);
CREATE INDEX ocl_campaign_idx          ON public.outreach_campaign_leads (campaign_id);
CREATE INDEX ocl_outreach_lead_idx     ON public.outreach_campaign_leads (outreach_lead_id);
CREATE INDEX ocl_campus_idx            ON public.outreach_campaign_leads (campus_id);
CREATE INDEX ocl_status_idx            ON public.outreach_campaign_leads (status);
CREATE INDEX ocl_scheduled_send_at_idx ON public.outreach_campaign_leads (scheduled_send_at);
CREATE INDEX ocl_email_lower_idx       ON public.outreach_campaign_leads (lower(email));
CREATE TRIGGER outreach_campaign_leads_set_updated_at
  BEFORE UPDATE ON public.outreach_campaign_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_single_active_cold_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_type text;
  new_status text;
BEGIN
  SELECT campaign_type, status INTO new_type, new_status
    FROM public.outreach_campaigns WHERE id = NEW.campaign_id;
  IF new_type IS DISTINCT FROM 'cold_sequence' THEN RETURN NEW; END IF;
  IF new_status NOT IN ('draft','scheduled','running','paused') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1
      FROM public.outreach_campaign_leads ocl
      JOIN public.outreach_campaigns c ON c.id = ocl.campaign_id
     WHERE ocl.outreach_lead_id = NEW.outreach_lead_id
       AND ocl.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND c.campaign_type = 'cold_sequence'
       AND c.status IN ('draft','scheduled','running','paused')
  ) THEN
    RAISE EXCEPTION 'Lead % already enrolled in an active cold_sequence campaign', NEW.outreach_lead_id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ocl_enforce_single_active_cold
  BEFORE INSERT OR UPDATE OF outreach_lead_id, campaign_id
  ON public.outreach_campaign_leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_cold_campaign();
