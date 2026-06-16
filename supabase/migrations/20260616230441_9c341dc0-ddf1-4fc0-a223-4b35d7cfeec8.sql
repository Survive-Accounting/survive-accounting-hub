
CREATE TABLE public.outreach_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinned_campus_ids uuid[],
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_audiences TO authenticated;
GRANT ALL ON public.outreach_audiences TO service_role;

ALTER TABLE public.outreach_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audiences_select"
  ON public.outreach_audiences FOR SELECT
  TO authenticated
  USING (is_shared OR created_by = auth.uid());

CREATE POLICY "audiences_insert"
  ON public.outreach_audiences FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "audiences_update"
  ON public.outreach_audiences FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "audiences_delete"
  ON public.outreach_audiences FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER outreach_audiences_set_updated_at
  BEFORE UPDATE ON public.outreach_audiences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX outreach_audiences_created_by_idx ON public.outreach_audiences(created_by);
CREATE INDEX outreach_audiences_shared_idx ON public.outreach_audiences(is_shared) WHERE is_shared;

ALTER TABLE public.outreach_campaigns
  ADD COLUMN audience_id uuid REFERENCES public.outreach_audiences(id) ON DELETE SET NULL;
