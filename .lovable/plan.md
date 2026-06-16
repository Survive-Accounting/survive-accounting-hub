## What I found in the database (last 5 messages on this thread)

Conversation `+19018713321 → +16625658818` (`short_ref #1`) exists, status `active`, `opener_sent=true`, last activity **June 11 21:10 UTC**. Messages:

```
Jun 11 17:25  IN   student  "Hey I need a tutor."
Jun 11 17:30  OUT  auto     "Hey! Thanks for reaching out. ... book with me here: surviveaccounting.com/start"
Jun 11 17:31  OUT  auto     "Also, which course are you in, and how's it going so far? When is your next exam? ..."
Jun 11 17:27  OUT  lee      "Hay I love u Mckenzie"   (relay)
Jun 11 21:10  OUT  lee      "Testing"                 (relay)
```

**There is no inbound row for a text from her after June 11.** So her newest text either (a) never reached the webhook, or (b) the webhook errored before insert.

## Three real bugs uncovered

### Bug 1 — auto-reply is intentionally one-shot per conversation (matches her experience)
The webhook only sends `BOOKING_REPLY_BODY` when `opener_sent && !alreadySentBooking`. Once the booking link has been sent in any prior session, **every future student reply is silently swallowed** (no second auto-reply, no acknowledgement). For a returning tester — or a real returning student — this looks broken.

### Bug 2 — `supabase/functions/twilio-sms-webhook/index.ts` has a duplicate `const { data: history }` declaration (lines 184 and 198)
The source as committed will NOT deploy — it's a hard syntax error. The currently running webhook is therefore a **different, older deployed version** than what's in the repo. If anyone re-deploys (e.g. the next migration touches the function), the webhook will start 500ing and inbound SMS will silently drop. This is a ticking time bomb that explains why future deploys could match her "nothing happened" symptom.

### Bug 3 — no visibility when the webhook fails
There is no "delivery log" or "raw inbound" record. If Twilio fires the webhook and the function 500s, we lose the message body forever and the dashboard shows nothing. We need a raw-inbound landing table OR a way to view edge function logs from the dashboard.

## Testing strategy options (ranked cheapest → most realistic)

| Option | Cost | Realism | Best for |
|---|---|---|---|
| **A. In-dashboard SMS simulator** (recommended) | $0 | High — exercises the entire webhook → AI → outbox → reply path | Repeated, deterministic testing of script logic |
| **B. "Reset conversation" button** (recommended, pairs with A or real cell) | $0 | n/a | Lets you re-test the first-message flow with your own real cell as many times as you want |
| **C. Provision a dedicated test campus + number** | ~$1.15/mo + $0.0079/SMS each way | Highest | End-to-end Twilio routing test |
| **D. Add your cell to a special "tester" allowlist** | $0 | Medium | Bypasses the one-shot booking guard so your cell always re-runs the full flow |

**My recommendation: do A + B + D.** Together they cover ~95% of what C would test, cost nothing, and let you iterate from the dashboard or from your own phone instantly. C only adds value once we want to test number-routing or Twilio account permissions — not script behavior.

## Proposed changes

### 1. Fix Bug 2 (source/deployed drift)
Remove the duplicate `const { data: history }` block in `twilio-sms-webhook/index.ts`. Single read at the top of the "subsequent reply" branch, reused by both the booking-link guard and the Claude extractor.

### 2. Fix Bug 1 + add tester behavior
- Add `is_tester` boolean to `sms_conversations` (default false).
- New env var `SMS_TESTER_PHONES` (comma-separated E.164). Inbound from any tester phone: mark `is_tester=true` AND skip the "already sent booking" guard so every reply re-runs the auto flow.
- For non-tester conversations, replace the silent no-op with a single low-key acknowledgement so returning real students don't think we ghosted them. Send at most once per 24h.

### 3. Add inbound-raw landing table
New `sms_inbound_raw` table — webhook writes the full Twilio form payload + parse status + error before doing anything else. Used both for forensics ("did Twilio actually call us?") and for the dashboard's new "Raw inbound" tab.

### 4. New "Tester" panel in the Texts tab
A small card at the top of `TextsPanel`:

```text
┌── Tester ─────────────────────────────────────┐
│ Campus number  [ +1 662 565 8818  ▾ ]         │
│ Student phone  [ +1 555 000 0001  (free-text) ]│
│ Body           [ Hey I need help with ACCT201 ]│
│ [ Simulate inbound text ]   [ Reset thread ]  │
└───────────────────────────────────────────────┘
```

`Simulate inbound text` posts a form-encoded body to the deployed webhook just like Twilio would (no Twilio call, $0). The thread updates live below. `Reset thread` deletes the conversation + its messages + queued outbox so the next inbound runs the first-message branch.

### 5. Per-conversation "Reset thread" button
Same delete-and-recreate behavior, exposed on every conversation row in the existing list. This is what unlocks re-testing with your real cell at 901-871-3321 without DB surgery.

### 6. Recent-deliveries badge
At the top of the Texts tab, show a small badge: "Last inbound: 5 min ago · Last outbox sent: 5 min ago · Last webhook error: never". Sourced from the new `sms_inbound_raw` table + existing `sms_outbox`. Lets you instantly tell whether a missing message is a Twilio problem or a logic problem.

## What I will NOT do without your say-so

- Provision a new Twilio test number (option C). Hold off unless you specifically want it; A + B + D is cheaper and faster.
- Touch `sms-process-outbox` or the Lee-relay flow — both work and aren't implicated.
- Change the opt-out (STOP) handling.

## Open questions for you

1. Confirm `SMS_TESTER_PHONES` should include `+19018713321` (Mckenzie's tester) and your personal cell — what's your personal cell number?
2. For non-tester returning students (Bug 1 fallback acknowledgement), do you want a one-liner like _"Thanks — Lee will text you back personally when he gets a moment."_, or no auto-reply at all?
3. After we ship this, do you want me to backfill the missing inbound (her newest text) by checking Twilio's message log via the connector, or just move forward?
