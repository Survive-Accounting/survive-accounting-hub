# Claim / rep alerts + call-back — handoff (branch `feat/claim-alerts-callback`)

Built 2026-09-02/03 from `docs/CLAIM-ALERTS-AND-CALLBACK-PLAN.md`. Not merged to main. Worktree: `sa-claim-alerts`, dev port 8095.

## What changed

**Alerts (email + SMS to Lee)** — `src/lib/comms/templates.ts`
- Chapter claim, one GSM-7 segment: `#241 CLAIM ΣX Ole Miss / Jordan Ellis, Scholarship Chair / READY TO SPONSOR (84 banked) / surviveaccounting.com/x/241`. Email subject `[SA CLAIM] ΣX Ole Miss - Jordan Ellis (Academic / Scholarship Chair) - READY TO SPONSOR`.
- The separate "hot lead" text for committed claims is gone; that claim's alert skips the hourly cap instead (`alertPriority`).
- Campus rep: `REP SIGNUP` at the 4-field signup (now with the school's real name and a link — it used to send the slug and no link), and a new `REP APPLIED` alert when the application is submitted, carrying year / own chapter / reach / roles / pitch. Subject `[SA REP] …`.
- New `founder_call` (`#241 CALLING NOW …`) and `founder_voicemail` (`#241 VOICEMAIL 0:42 … "transcript"`) templates. Subjects `[SA CALL]`, `[SA VOICEMAIL]`.
- Greek letters: `src/lib/greek-letters.ts` renders any org name in GSM-7 (ten real Greek capitals + Latin lookalikes), so ΣX costs nothing. `oneSegment()` trims the flexible line (name / detail / quote) so a body can never exceed 160 units.
- Every alert body is passed through `toGsm7()` — stray curly quotes or emoji in a name or transcript cannot double the bill.

**One ref for everyone** — `src/lib/comms/refs.server.ts`
- Claims, rep signups/applications and callers get (or reuse) the `sms_conversations` row for their phone on the main line. The alert's `#ref` is that row's `short_ref`, so the existing "#241 hey Jordan" relay in `twilio-sms-webhook` works for them unchanged.
- Migration `20260902_1500_alert_refs_and_voicemail.sql` adds `kind`/`subject` to conversations and `kind`/`call_sid`/`recording_*`/`duration_seconds`/`transcript_status` to messages. Code degrades loudly (console.warn + `schemaGap` banner on /x/) if it is not applied.

**The action page** — `/x/<ref>` (`src/routes/x.$ref.tsx`, `src/lib/action-card.functions.ts`)
- Behind AdminGate + AdminSessionGate (passcode → HttpOnly cookie; every server fn calls `assertAdmin()`).
- Shows the claim (approve / decline — same `decideClaimCore` the queue uses), the rep application (approve with coverage / waitlist / decline via `adminReviewApplication`), and the thread (texts, calls, voicemails with an audio player).
- Buttons: **Call my phone, then them** (bridge), **Call from this computer** (Voice JS SDK), **Text back** (`sms:` deep link to the main line with `#241 ` prefilled).
- `/x/preview` sends real `[PREVIEW]` copies of every alert to the founder email + phone.

**Voice** — `src/lib/voice/voice.server.ts` + `src/routes/api.voice.*.tsx` (all signature-verified)
- `POST /api/voice/inbound` — the number's Voice URL. Lee's cell → dial-through prompt. Anyone else → immediate "CALLING NOW" text to Lee → greeting → `<Record maxLength=120 transcribe>`.
- `POST /api/voice/recorded` — voicemail saved to the thread, SMS to Lee.
- `POST /api/voice/transcript` — transcript filled in, email to Lee (email only: the phone already buzzed).
- `POST /api/voice/dial-through` — Lee keyed `241#`: `<Dial callerId=mainLine>` the person.
- `POST /api/voice/bridge?c=<conversationId>` — Lee answered the bridge call: dial the person as the main line.
- `POST /api/voice/softphone` — the TwiML App's Voice URL for the browser softphone.
- `GET /api/voice/recording/<RecordingSid>` — admin-gated mp3 proxy for the player.
- Nothing rings Lee, ever (his call). No availability switch exists.

## LEE MUST WIRE (in this order)

1. **Migration**: paste `migration/supabase-migrations/20260902_1500_alert_refs_and_voicemail.sql` into the Supabase SQL editor. The final SELECT must return 8 rows.
2. **Vercel env** (Production, and Preview if you want to test on the branch deploy):
   - already there (used by `sendSms`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `FOUNDER_ALERT_PHONE` or `LEE_PERSONAL_PHONE`, `FOUNDER_ALERT_EMAIL`, `RESEND_API_KEY`
   - add for the bridge + browser: `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` (same values the Supabase edge functions use)
   - add for the browser softphone: `TWILIO_TWIML_APP_SID` (step 4)
   - optional: `VOICEMAIL_TRANSCRIBE=0` to turn transcription off; `MAIN_LINE_E164` if the main line is not the `campus_phone_numbers` row with `campus_id IS NULL` (fallback is +16625658818)
3. **Twilio Console → Phone Numbers → (662) 565-8818 → Voice & Fax**: "A call comes in" = Webhook, `https://surviveaccounting.com/api/voice/inbound`, HTTP POST. (Replaces the Supabase `twilio-voice-webhook` edge function, which keeps working until you repoint.) Leave the Messaging webhook alone.
4. **Twilio Console → Voice → TwiML Apps → Create**: name "SA browser dialer", Voice request URL `https://surviveaccounting.com/api/voice/softphone`, POST. Copy its SID into `TWILIO_TWIML_APP_SID`.
5. **Verify**: open `/leeportal` → Alert Previews → send all six. Then call the main line from a phone that is not your cell: you should get the CALLING NOW text before the greeting ends, then a VOICEMAIL text, then the transcript email. Open the `/x/<ref>` link from the text: play the voicemail, tap "Call my phone".
6. **Gmail filters**: `subject:"[SA CLAIM]"`, `subject:"[SA REP]"`, `subject:"[SA CALL]"`, `subject:"[SA VOICEMAIL]"`.

## Decisions made without asking (say so if wrong)

- Greek letters use the GSM-7 lookalike scheme (ΣX, KAΘ). Switching to plain Latin is one line in `chapterSmsLabel`.
- Rep applications stay on `referral_partners` (the unapplied `campus_rep_applications` migration is untouched).
- Approving a rep still sends the rep nothing automatically; Lee texts them with `#ref`.
- A rep produces two alerts over their life: SIGNUP (4-field form) and APPLIED (full application). Each is one text.
- Voicemail = SMS at record time + email when the transcript lands (email only, so the phone buzzes once per voicemail).
- Bridge calls use answering-machine detection: if your cell's voicemail picks up, the person is NOT dialled into it.

## Not done / later

- No `/admin/inbox` queue yet (claims + reps + voicemails in one list). The pieces exist; it is a page.
- Twilio's built-in transcription is English-only and limited to 2-minute recordings; fine for now.
- The old Supabase `twilio-voice-webhook` edge function is left in place, not deleted.
