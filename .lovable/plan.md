# SMS Auto-Reply: Two-Step Flow

Replace the current "delayed opener + delayed follow-up questions" flow with an **instant questions** message, followed by a **booking-link reply** after the student answers.

## New behavior

**Trigger 1 — Student's first text to a campus number → reply instantly (no delay):**

```
Hey! This is Lee's automated assistant.

Before meeting with students, Lee likes to learn a little about where they're getting stuck.

A few quick questions:

• Which course are you in?
• When is your next exam?
• What chapters/topics are giving you the most trouble?

Reply with your answers and I'll send over Lee's booking link.
```

**Trigger 2 — Student's first reply after that → send once:**

```
Thanks!

Here's Lee's booking page:

SurviveAccounting.com/start

He'll also personally review your answers and follow up when he gets a chance.
```

**Trigger 3+ — Any further student replies → no auto-reply.** Lee still gets the Claude-extracted summary text to his personal phone (unchanged).

## Changes in `supabase/functions/twilio-sms-webhook/index.ts`

1. Replace the `openerBody()` function and `FOLLOWUP_BODY` constant with two new constants: `QUESTIONS_BODY` (trigger 1) and `BOOKING_REPLY_BODY` (trigger 2).
2. Remove the random opener delay (`OPENER_DELAY_MIN/MAX_SECONDS`, `FOLLOWUP_GAP_SECONDS`) and the two `sms_outbox` rows queued on first inbound. Send `QUESTIONS_BODY` directly via `twilioSend()` and mark `opener_sent = true`.
3. On subsequent inbound (the `else` branch): if this is the student's **first reply after the questions** (i.e. `opener_sent = true` and no prior outbound auto message with the booking body in `sms_messages`), send `BOOKING_REPLY_BODY` via `twilioSend()` and log it as an outbound `author: "auto"` message. Continue with the existing Claude extraction + Lee notification.
4. Update Lee's notification text on first inbound from "Auto-reply queued (~N min)" to "Auto-questions sent. Reply to this thread to jump in yourself."

## Notes / open questions

- The booking link is hard-coded to `SurviveAccounting.com/start` as you wrote it. The current code uses campus-specific `/t/{slug}` links when available — I'll drop that and use `/start` everywhere unless you want campus-specific links kept.
- No DB schema changes. `opener_sent` already exists and is reused.
- `sms_outbox` is no longer written by this webhook, but the table and its processor stay in place (still used by other flows).
