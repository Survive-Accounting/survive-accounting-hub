## Goal

Make the hero CTA sleek and **text-first**. Drop the dual-button idea — one bold primary action: text Lee. Keep `/start` as the booking flow but make it reachable only through the SMS opener link (not surfaced on the homepage).

## Hero changes (`src/components/landing/Hero.tsx`)

Replace the current button row with a single, prominent **"Text Lee →"** CTA card:

- **Sub-copy** above the button, with the number **bolded and tappable**:
  > "Text **662-565-8818** — I'll reply personally and send your booking link."
- **Primary CTA**: large red pill button `Text Lee 662-565-8818 →` → `href="sms:+16625658818?&body=Hi%20Lee%2C%20I%20need%20tutoring"`
  - Pre-fills the message so phones (especially iOS) open Messages already addressed and ready to send.
  - On desktop where `sms:` is flaky, falls back to a tooltip/secondary line: "On desktop? Text **662-565-8818** from your phone."
- **Secondary action** (smaller, ghost link, not a button): `Read reviews` — keeps the existing scroll-to-reviews behavior but visually de-emphasized so the texting path wins.
- Remove `Book Tutoring` modal trigger from the hero (it'll still be reachable from `/start` directly for anyone with the SMS link).

### Why text-only wins here
- Captures the student's phone number automatically (your stated goal — future marketing, notifications, follow-ups).
- Triggers your existing Twilio webhook flow → auto-opener with the booking link → Lee notified.
- Zero friction; matches the conversational tone of the brand.
- One CTA = higher conversion than two competing ones.

### Sleekness details
- Slightly smaller headline weight on the sub-line so the **number** pops.
- Add a tiny SMS bubble icon (lucide `MessageCircle`) inside the button left of the label.
- Keep the existing red gradient + shadow — already on-brand.
- Add a one-liner under the button in 11px white/60%: "Replies usually within an hour. Msg & data rates may apply."

## `/start` access

No code change required to "lock" it — just stop linking to it from the homepage. It remains:
- The destination of the SMS opener link (`surviveaccounting.com/start`).
- Directly typeable for anyone with the link.

If you want it truly gated (block direct visits without an SMS click), that's a separate, larger change (token in URL, validated server-side). Recommend **not** doing that yet — adds friction for legitimate inbound and breaks the SMS opener if the token logic ever hiccups.

## Twilio voicemail setup (instructions only — no code)

Your number is SMS-capable but you also want a voicemail message when someone calls it. Twilio doesn't have a built-in "voicemail" toggle; you build it with a tiny TwiML flow. Two paths:

### Option A — Simplest (no edge function): TwiML Bin
1. Twilio Console → **Runtime → TwiML Bins → Create new Bin**.
2. Name: `Lee Voicemail`. Paste:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
     <Say voice="Polly.Joanna">Hey, you've reached Lee at Survive Accounting. I don't take calls — please text me at this same number and I'll get right back to you. Thanks!</Say>
     <Hangup/>
   </Response>
   ```
   (Or use `<Record>` instead of `<Hangup/>` if you actually want to capture voicemails — see Option B.)
3. Save → copy the TwiML Bin URL.
4. Twilio Console → **Phone Numbers → Manage → Active numbers → 662-565-8818**.
5. Under **Voice Configuration → A call comes in** → set to **TwiML Bin** → pick `Lee Voicemail`.
6. Save. Call the number from your phone to verify.

### Option B — Real voicemail with recording + transcription + SMS to you
Same as A but the TwiML Bin body becomes:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hey, you've reached Lee. Texting is fastest — try this same number. Or leave a message after the beep and I'll get back to you.</Say>
  <Record maxLength="60" transcribe="true" transcribeCallback="https://surviveaccounting.com/api/public/twilio-voicemail" playBeep="true"/>
  <Hangup/>
</Response>
```
- `transcribeCallback` posts the transcript to a public endpoint we'd add later (`src/routes/api/public/twilio-voicemail.ts`) that forwards it to your phone via SMS. Tell me when you want that wired up and I'll add it.

### Already in the repo
There's a `supabase/functions/twilio-voice-webhook/index.ts` — if it's already pointed at your number, we'd update that instead of a TwiML Bin. I'll check and reuse it when you give the go-ahead.

## Files to change

- `src/components/landing/Hero.tsx` — rewrite the CTA block (single text button + bolded number sub-line + small reviews link).
- Nothing else. `/start` route stays as-is.

## Open question

Want me to **also remove** `Book Tutoring` from the navbar/footer so SMS is the only path on the public site, or leave it in secondary nav as an escape hatch?
