
CREATE TABLE IF NOT EXISTS public.sms_templates (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
GRANT SELECT ON public.sms_templates TO anon;
GRANT ALL ON public.sms_templates TO service_role;

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read sms_templates" ON public.sms_templates
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth all sms_templates" ON public.sms_templates
  TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sms_templates_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sms_templates_updated_at ON public.sms_templates;
CREATE TRIGGER sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.sms_templates_set_updated_at();

INSERT INTO public.sms_templates (key, label, description, body) VALUES
('opener_questions',
 'Opener — sent to student on first text',
 'The very first reply a student receives. Should ask the intake questions.',
 'Hey! This is Lee''s automated assistant.

Before meeting with students, Lee likes to learn a little about where they''re getting stuck.

A few quick questions:

• Which course are you in?
• When is your next exam?
• What chapters/topics are giving you the most trouble?

Reply with your answers and I''ll send over Lee''s booking link.'
),
('booking_reply',
 'Booking link — sent after the student replies to the opener',
 'The follow-up that hands off the booking page.',
 'Thanks!

Here''s Lee''s booking page:

SurviveAccounting.com/start

He''ll also personally review your answers and follow up when he gets a chance.'
),
('ack_reply',
 'Acknowledgement — for returning real students (max once / 24h)',
 'Sent when a real (non-tester) student texts again after the booking link was already sent, so they don''t feel ghosted.',
 'Got it — passing this along to Lee. He''ll text you back personally when he gets a moment.'
),
('lee_new_summary',
 'Lee summary — first text from a new student',
 'Texted to your personal phone when a brand new student lands. Tokens: {ref} {campus} {tester_flag} {from} {body}',
 '#{ref} New student text — {campus}{tester_flag}
From {from}: "{body}"
Auto-questions sent. Reply to this thread to jump in yourself.'
),
('lee_followup_summary',
 'Lee summary — student reply on existing thread',
 'Texted to your personal phone on every student reply, with extracted facts. Tokens: {ref} {campus} {tester_flag} {body} {facts}',
 '#{ref} {campus}{tester_flag} — "{body}"{facts}
Reply to this thread to text them back.'
)
ON CONFLICT (key) DO NOTHING;
