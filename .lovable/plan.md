## Why her text got no reply (root cause)

The webhook never ran. `sms_inbound_raw` logs every Twilio POST *before* any business logic, and there are zero rows from `+19018713321` after Jun 11. The Twilio number `+1 (662) 565-8818` isn't posting to our function — almost certainly its "A MESSAGE COMES IN" webhook URL in Twilio Console is stale (pointing at an old preview/edge URL) or was cleared.

### Fix (manual, one-time)

In Twilio Console → Phone Numbers → `+16625658818` → Messaging → **A MESSAGE COMES IN**, set to:

```
https://dhlzorresurzlcpuplkv.supabase.co/functions/v1/twilio-sms-webhook
```

Method: **HTTP POST**. Save. Then text the line again — `sms_inbound_raw` should get a fresh row within a second. If it still doesn't, the problem is at Twilio (number unassigned, A2P 10DLC blocked, etc.), not in our code.

Her existing Jun 11 conversation has `opener_sent=true`, so when the webhook does fire, code will send the short ack ("Got it — passing this along to Lee…") and text Lee a summary. No logic change needed there.

## What I'll build

### 1. Two new "clear conversations" controls in the Texts panel header

- **Clear by phone**: small input + button. Paste a number (any format), confirms, then deletes that student's `sms_conversations` row + its `sms_messages` + queued `sms_outbox` + `sms_inbound_raw` rows from/about that phone. Next text from them runs the first-message flow.
- **Clear ALL conversations**: red button, double-confirm ("type CLEAR to confirm"). Wipes every row from `sms_conversations`, `sms_messages`, `sms_outbox`, and `sms_inbound_raw`. Useful for a clean test slate. Does NOT touch `sms_templates`, `campus_phone_numbers`, or anything outside SMS.

Both run via a new authenticated `createServerFn` (admin-gated by `has_role('admin')`) using `supabaseAdmin` so RLS doesn't get in the way.

### 2. A small "Webhook health" hint card

Above the conversations list, show:
- Last inbound received: `{relative time}` (max `received_at` from `sms_inbound_raw`)
- If > 24 h ago, a yellow note: *"No inbound texts received recently. Check the Twilio number's webhook URL points to …/twilio-sms-webhook."*

This makes the next "why didn't I get a text?" instantly diagnosable without me having to query the DB.

## Files

- New: `src/lib/sms-admin.functions.ts` — `clearConversationByPhone({ phone })`, `clearAllConversations({ confirm })`, `getSmsWebhookHealth()`. All `.middleware([requireSupabaseAuth])` + admin role check, dynamic `import("@/integrations/supabase/client.server")` inside handlers.
- Edited: `src/components/outreach/TextsPanel.tsx` — header row gets the two clear buttons + the health card. Reuses existing toast + invalidation patterns.

No DB migration. No edge function change. No homepage/intake changes.