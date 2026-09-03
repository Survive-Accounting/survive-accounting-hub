-- Idea bank insert: claim/rep alerts + callback plan. Paste into the Supabase SQL editor.
-- Idempotent: ON CONFLICT (id) DO NOTHING. Full plan: docs/CLAIM-ALERTS-AND-CALLBACK-PLAN.md
BEGIN;
INSERT INTO public.ideas (id, title, body, categories, subcategory, status, source_path, context, prompt_md, prompt_filename, created_by, source_kind, attachments, audio_path, transcript_status, created_at, updated_at)
VALUES (
  'idea-6a99073e-callback',
  'Claim + rep alerts: one text, one link, call back as 662-565-8818',
  $idea$# Claim and rep alerts: callable, one link, one segment

Status: IDEA (planned 2026-09-02, not built). Owner: Lee.
Scope: what Lee gets when a chapter exec claims a page or a campus rep applies, and how he calls or texts them back from phone OR computer while looking like 662-565-8818.

## What exists today (so nothing gets built twice)

- Claim form: `/go/$school/$chapter` -> `submitChapterClaim` (`src/lib/greek-claims.functions.ts:60`). Captures name, position, email, phone, and `intent` (committed / curious / exploring). Row in `greek_chapter_claims`.
- Claim alert: `runClaimIntake` -> `founderAlert` -> template `founder_priority` greek_claim branch (`src/lib/comms/templates.ts:352`). SMS today: `!! CHAPTER CLAIM: {chapter}, {school}, {name}, {role} {phone} {adminLink}`. Intent is NOT in it. A SECOND raw text fires when intent = committed (`greek-claims.functions.ts:218`), so a hot lead = two texts.
- Rep application: `/rep/join` -> `applyAsRep` (`src/lib/rep-auth.functions.ts:49`) -> `referral_partners` (type campus_rep, v2 columns: rep_coverage, graduation_year, campus_roles, pitch, own_chapter_id). Alert passes the campus SLUG as school and NO admin link. Approval sends the rep nothing.
- Admin review: `/outreach/greek-claims?claim=<uuid>` (`decideChapterClaim`), `/admin/reps` (`adminReviewApplication`). Real auth = AdminSessionGate (magic link -> HttpOnly `sa_admin_jwt`). AdminGate is decorative.
- #ref reply relay: `sms_conversations.short_ref` (serial). Lee texts `#102 hey` to the main line and `twilio-sms-webhook` relays to that student. ONLY works for rows in `sms_conversations`. Claims and reps have no ref today.
- Voice: `supabase/functions/twilio-voice-webhook` already answers calls to the main line with a Polly "text me instead" greeting and logs the missed call. So the number already has Voice; nothing to buy.
- Email: Resend, `sendResendEmail` / `sendTemplateEmail`. Alerts go to FOUNDER_ALERT_EMAIL (default lee@survivestudios.com, check env).
- Data: `campuses.short_name` = "Ole Miss" (already preferred in claims code). `greek_orgs.letters` is EMPTY for all 150 orgs; `campus_greek_chapters.letters` is Latin ("ATO"). Real Greek exists only in the hard-coded `greek-portal-orgs.ts` list.

## Answers to the questions

### Can the text show real Greek letters?
Yes, and it can stay ONE segment. GSM-7 (160 chars) includes ten Greek capitals natively: Δ Φ Γ Λ Ω Π Ψ Σ Θ Ξ. The other 14 capitals are pixel-identical to Latin: Α=A Β=B Ε=E Ζ=Z Η=H Ι=I Κ=K Μ=M Ν=N Ο=O Ρ=P Τ=T Υ=Y Χ=X. So a `greekForSms()` helper maps every uppercase Greek org name into GSM-7: "Sigma Chi" -> "ΣX", "Kappa Alpha Theta" -> "KAΘ", "Alpha Delta Chi" -> "AΔX". Any lowercase or accented Greek would force UCS-2 (70 chars), so the helper must only emit those 24 symbols. Unit test: assert segment count = 1 for the longest org name.

Data gap to close first: backfill `greek_orgs.letters` from `greek_orgs.name` with a 24-word map (Alpha..Omega). One migration, deterministic, ends with a SELECT count of rows still null. Fallback in the alert = `campus_greek_chapters.letters` (Latin).

### Can I call them so it shows 662-565-8818?
Three ways, all real Twilio, all use the number the site already has:

1. BRIDGE CALL (works from phone or computer, no app). Link in the alert hits an admin endpoint. Server calls Lee's cell FROM +16625658818 via the Calls API; when he answers, TwiML returns `<Dial callerId="+16625658818"><Number>{student}</Number></Dial>`. Student's phone shows the main line. Two billed legs. Must sit behind the admin session cookie, or anyone with the link can ring Lee's phone.
2. DIAL-THROUGH FROM PERSONAL PHONE (remote, zero UI). Lee calls the main line from LEE_PERSONAL_PHONE. The voice webhook sees From == Lee, answers with `<Gather>` "enter the ref then pound", looks up `short_ref`, then Dials the student with callerId = main line. Same #ref mental model as texting. Everyone else who calls still gets the greeting.
3. BROWSER SOFTPHONE (the RE20 experience). Twilio Voice JavaScript SDK: admin page requests a short-lived Access Token (server, admin session), builds `Twilio.Device`, `device.connect({ params: { To } })`. A TwiML App voice URL returns `<Dial callerId="+16625658818"><Number>{To}</Number></Dial>`. Needs one TwiML App SID + API key in env. Inbound can ring the browser too: `<Dial timeout="20"><Client>lee</Client></Dial>` then fall to voicemail. This is the phase that makes "call from the computer with the good mic" real.

What Twilio cannot do: make a call placed by Lee's carrier from his cell show the Twilio number. That is why 1 and 2 originate the call on Twilio's side.

### Can they call me, and can I triage?
Yes. Upgrade the existing voice webhook:
- Availability switch (`admin_settings.phone_mode` = ring | voicemail, toggled from /leeportal or the alert page). ring = Dial Lee's cell (or browser client) 20s, then voicemail. voicemail = straight to greeting.
- Greeting: "Hey, you've reached Lee at Survive Accounting. Tell me who you are and what it's about, or text this number, and I'll call you right back." then `<Record maxLength="120" transcribe="true" transcribeCallback=...>`.
- Transcription callback -> `founderAlert` with the transcript, their number, and the #ref (find-or-create the `sms_conversations` row for that phone so `#ref` reply works immediately). Voicemail becomes a text Lee can act on from either device.

### One ref number for everything (the glue)
When a claim or rep application lands, find-or-create the `sms_conversations` row for their phone on the main line (campus_id set). Use ITS `short_ref` in every alert. Result: the existing `#241 hey Jordan` relay works for claims and reps with zero webhook changes. Add `sms_conversations.subject` (text, e.g. "claim ΣX Ole Miss") so the follow-up summary names the thread.

### Three links in a text is too many
Introduce ONE short admin link per event: `surviveaccounting.com/x/241` (one route keyed by ref, works for claims, reps and voicemails). Behind AdminSessionGate (real cookie, one magic-link login per device). The page shows: who, chapter, school, intent, members banked; buttons: Approve / Decline (calls `decideChapterClaim` or `adminReviewApplication`), Call (bridge), Call from browser (phase 3), Text (opens sms: with `#241 ` prefilled on phone), View dashboard (the exec's `/go` dashboard), View application (rep). Approve then text, or call then approve, both two taps.

Keep the written rule: NO one-tap approve token in an inbox (`greek-claims.functions.ts:196`, `templates.ts:349`). The link is a pointer; the cookie is the permission.

## Target alert shapes

SMS (GSM-7, one segment, replaces both texts on a hot lead):

```
#241 CLAIM ΣX Ole Miss
Jordan Ellis, Scholarship Chair
READY TO SPONSOR (84 banked)
surviveaccounting.com/x/241
```

Intent line: committed = READY TO SPONSOR, curious = WANTS DETAILS, exploring = EXPLORING.

Rep SMS:

```
#242 REP Ole Miss
Jordan Ellis, Jr, Sigma Chi
covers 6 chapters
surviveaccounting.com/x/242
```

Email subject, filterable: `[SA CLAIM] ΣX Ole Miss - Jordan Ellis (Scholarship Chair) - READY TO SPONSOR` and `[SA REP] Ole Miss - Jordan Ellis`. Body: same facts plus the full link set (review, dashboard/application, bridge call, `tel:`, `sms:`), and the exec's own answers verbatim. Gmail filter on `subject:"[SA CLAIM]"` -> folder.

## Phases (build order, each shippable alone)

Phase 1, alerts and the action page (no new Twilio products):
- `greek_orgs.letters` backfill migration + `greekForSms()` + segment test.
- Claim/rep -> find-or-create `sms_conversations` row; `short_ref` in alerts; `subject` column.
- New SMS/email templates above; fold the hot-lead ping into the one alert; rep alert gets short_name and a link; add `rep_approved` template (approval texts the rep).
- `/x/$ref` action page behind AdminSessionGate with Approve / Decline / Text / dashboard or application links.
- Route through `send.server.ts` only (comms_sends row, [TEST] routing, suppression). Best-effort loggers return `{ logged }` per SESSION-CONTEXT section 3.

Phase 2, voice on the existing webhook:
- Bridge-call endpoint + button.
- Dial-through: Lee's number + `<Gather>` ref -> Dial.
- Voicemail with `<Record transcribe>` + callback -> alert with #ref. Availability switch.

Phase 3, browser softphone:
- TwiML App, Access Token endpoint, `Twilio.Device` widget on `/x/$ref` and a small `/admin/phone` dialer. Inbound ring-to-browser when mode = ring.

Later (hundreds of campuses): `/admin/inbox` queue of open claims, reps and voicemails sorted by intent and age; held-count already exists on the 30/hr founder rate limit.

## Decisions Lee needs to make
1. Which cell rings for bridge and ring-through: LEE_PERSONAL_PHONE (exists) or FOUNDER_ALERT_PHONE.
2. Alert inbox: FOUNDER_ALERT_EMAIL defaults to survivestudios.com. Pick the one the filter lives in.
3. Greek display: Unicode-lookalike (ΣX) vs plain Latin (SX). Plan assumes Unicode-lookalike.
4. Rep application table: `campus_rep_applications` migration is still unapplied; plan assumes `referral_partners` v2 stays the source.

## Rough cost (verify on twilio.com/pricing before Phase 2)
Voice is billed per minute per leg, on the order of a cent or two per minute. A bridge call is two legs. Recording, transcription and browser client legs are each small add-ons. At hundreds of claims a month this is tens of dollars, not hundreds.

Sources checked 2026-09-02: Twilio GSM-7 glossary (Greek capitals in the basic set), TwiML Dial callerId rules (Twilio number or verified number), Voice JS SDK and Access Tokens, Record transcribeCallback.
$idea$,
  ARRAY['CUSTOMER_SUCCESS','INFRASTRUCTURE','MARKETING']::text[],
  'admin alerts',
  'IDEA',
  '/admin/ideas',
  '{"doc": "docs/CLAIM-ALERTS-AND-CALLBACK-PLAN.md", "planned": "2026-09-02"}'::jsonb,
  NULL, NULL,
  'lee',
  'web',
  '[]'::jsonb,
  NULL, NULL,
  now(), now()
)
ON CONFLICT (id) DO NOTHING;
SELECT id, title, status, categories, length(body) AS body_chars, created_at FROM public.ideas WHERE id = 'idea-6a99073e-callback';
COMMIT;
