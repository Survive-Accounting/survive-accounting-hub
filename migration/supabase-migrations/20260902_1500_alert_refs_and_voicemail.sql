-- 20260902_1500_alert_refs_and_voicemail.sql — ONE ref number for every person Lee talks to.
--
-- Chapter claims, rep applications and phone calls now find-or-create a row in sms_conversations
-- on the main line, so the existing "#241 hey Jordan" text relay works for all of them and the
-- /x/241 action page can show the whole thread. Two additive changes, both idempotent:
--
--   sms_conversations.kind     what started the thread: student | claim | rep | caller
--   sms_conversations.subject  the one-line label the alerts and the action page show
--   sms_messages.kind          sms | call | voicemail  (calls and voicemails live in the thread)
--   sms_messages.recording_*   the Twilio recording behind a voicemail, plus its transcript state
--
-- Apply by pasting into the Supabase SQL editor (or run_sql.ts --apply). The SELECT at the end
-- lists the new columns; if it returns fewer than 8 rows the migration did not take.

BEGIN;

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS call_sid text,
  ADD COLUMN IF NOT EXISTS recording_sid text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS transcript_status text;

-- Voicemail rows are looked up by recording when the transcript arrives (a separate callback).
CREATE INDEX IF NOT EXISTS sms_messages_recording_sid_idx ON public.sms_messages (recording_sid) WHERE recording_sid IS NOT NULL;

COMMIT;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'sms_conversations' AND column_name IN ('kind', 'subject'))
    OR (table_name = 'sms_messages' AND column_name IN ('kind', 'call_sid', 'recording_sid', 'recording_url', 'duration_seconds', 'transcript_status'))
  )
ORDER BY table_name, column_name;
