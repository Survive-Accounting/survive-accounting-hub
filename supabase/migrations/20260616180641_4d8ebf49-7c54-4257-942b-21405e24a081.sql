
ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.sms_inbound_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  from_number text,
  to_number text,
  body text,
  twilio_sid text,
  raw_payload jsonb,
  parse_status text NOT NULL DEFAULT 'received',
  error text,
  conversation_id uuid REFERENCES public.sms_conversations(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_inbound_raw TO authenticated;
GRANT SELECT ON public.sms_inbound_raw TO anon;
GRANT ALL ON public.sms_inbound_raw TO service_role;

ALTER TABLE public.sms_inbound_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read sms_inbound_raw" ON public.sms_inbound_raw
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth all sms_inbound_raw" ON public.sms_inbound_raw
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sms_inbound_raw_received_idx
  ON public.sms_inbound_raw (received_at DESC);
