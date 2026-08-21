# Notifications — unified intake, student comms, follow-ups (branch `notifications`)

Implements the "one intake, one trigger, two directions" plan from the capture-point audit
(2026-08-21). Every web capture now writes ONE row and sends the student a first-person
confirmation; Lee gets one consolidated alert format; sequences, broadcast, suppression, and a
test harness sit on top. **All three gates were executed on 2026-08-21** (DDL applied via Management API, SMTP + magic-link template set, webhook redeployed — verify_jwt stays false). Recipes kept for reference:

1. **Apply the DDL:** `bun run migration/supabase-migrations/run_sql.ts migration/supabase-migrations/20260821_0900_comms_unified_intake.sql --apply`
2. **Point auth email at Resend:** `bun run migration/supabase-migrations/set_auth_smtp.ts --apply`
   (dry run without the flag prints the payload). Sender is `lee@mail.surviveaccounting.com` —
   the Resend-verified domain; pass `--from=lee@surviveaccounting.com` once the root domain is
   verified in Resend. Then paste plain first-person copy into Auth → Email Templates → Magic Link.

Until (1) runs, every capture still **saves** (the old columns are untouched) but confirmations and
alerts log `failed` in comms_sends; nothing is lost, nothing double-sends.

## 1. Intake schema (`campus_waitlist` is the lead row)

New columns: `kind` · `channel` (email|phone|both) · `campus_id` · `course_code` · `professor` ·
`exam` · `topic` · `chapter` · `source_path` · `note` · `file_paths[]` · `is_test` ·
`consent_sms_at` · `legacy_table`/`legacy_id`. `email` is nullable now (phone-only captures).
`kind` ∈ notify_exam · save_progress · syllabus · greek_member · greek_claim · rep ·
school_request · tutoring_request · outreach_page · referral (enforced by zod in code).

New tables: `comms_suppressions` (STOP / unsubscribe / bounce — checked on every send path),
`comms_contacts` (per-email unsubscribe token), `comms_sends` (every email/SMS out: template,
category, dedupe key, status — powers the 2-per-7-day cap, broadcast double-send guard, sequence
state, founder rate limit), `comms_broadcasts`, `campus_exam_dates` (drives sequence A; empty
until syllabi supply dates). The old `campus_waitlist_notify` DB trigger is **dropped** — it would
double every founder alert now that alerts run in-app.

**One server function:** `submitIntake` (`src/lib/intake.functions.ts`) → `runIntake`
(`src/lib/comms/intake.server.ts`). Server-side callers (syllabus upload, claims, reps, member
tagging, referrals) call `runIntake` directly. Captures rewired (all 14):

| Capture | kind | Notes |
|---|---|---|
| Homepage/campus/Greek "Get notified once Exam N is ready" | notify_exam | now carries campus id/slug + exam |
| `/learn` paywall notify | notify_exam | campus context passed |
| Semester-Pass "Get notified" modal (email OR phone) | notify_exam | phone ⇒ consent (note rendered) |
| Save-your-progress ask (TwoSetAsk) | save_progress | was silent in `syllabus_submissions` |
| Syllabus upload modal | syllabus | files ride on the row; **priority alert** |
| "Don't see your school? Request it" | school_request | direct founder SMS removed (batched kind) |
| Greek `/go/` member tagging (after magic link) | greek_member | one welcome per email |
| Greek "Claim this page" | greek_claim | claim row kept; **priority alert** via intake |
| Campus rep application | rep | referrals envelope kept for the queue; **priority alert** |
| `/expand` referral | referral | when an email was left |
| `/start` tutoring request | tutoring_request | `tutoring_requests` retired (never read) |
| Campus outreach page (`/outreach/school/<slug>`) | outreach_page | `outreach_waitlist_signups` retired |
| Onboarding `/o/<ref>` finish, `/beyond`, `/preview` | notify_exam | preview testers skip the confirmation |
| Prepay reserve (`reservePrepayLead`) | tutoring_request | kept callable for the future Stripe path |

**Deleted:** `BookTutoringModal` (captured nothing, hardcoded Florida codes) — its two triggers now
scroll to the page's real form / course list. **Fixed:** `/chapters` fallback CTA pointed at a
`#signup` anchor that no longer rendered; it now goes to the free Exam 1 player.

### Migration counts (live DB, counted 2026-08-21 before apply)
- `syllabus_submissions` → `campus_waitlist`: **1 row** (source `landing-notify` → kind notify_exam; 0 two_set_ask; 0 with files)
- `outreach_waitlist_signups` → `campus_waitlist`: **0 rows** (the live table is the older shape — name/email/course/need_help_with/school_id — the migration maps those)
- Pre-existing `campus_waitlist`: **6 rows** back-filled to kind notify_exam + channel + exam (from the source tag)
- Left in place read-only: `tutoring_requests` (0), `referrals` (0). Timestamps are preserved; migrated rows carry `legacy_table`/`legacy_id` so the move is idempotent and auditable.
- **Verified after apply:** 7 rows — 6 native + 1 migrated (`legacy_table=syllabus_submissions`); all 5 new tables present.

## 2. Compliance
- `SmsConsentNote` (in `SmsConsentBanner.tsx`) renders **beside every phone field**: NotListedForm, ChapterAccessForm, RepInterest, `/start`, onboarding step 1, CourseWaitlistModal, the landing Notify modal. Copy states what, how often (1–4/month), rates, STOP/HELP, Privacy/Terms. A submitted phone beside the note stores `consent_sms_at`; the send layer refuses student SMS without it.
- STOP (stop/stopall/unsubscribe/cancel/end/quit) in `twilio-sms-webhook` now also writes `comms_suppressions(phone)` — permanent, across every path. (Edge function source edited; **redeploy it**: `supabase functions deploy twilio-sms-webhook`.)
- Marketing emails (sequences + broadcast) carry Unsubscribe + Email preferences; transactional carry Email preferences. `/u/<token>` (one-click unsubscribe via `?unsubscribe=1`) and `/u`.
- Suppression + the cap are enforced inside `sendTemplateEmail` / `sendTemplateSms`, so broadcasts and sequences can't bypass them.
- Auth email via Resend: `set_auth_smtp.ts` (gate 2 above).

## 3. Templates (`src/lib/comms/templates.ts` — one block structure → text + HTML + SMS)
Confirmations (9, transactional): confirm_notify_exam · confirm_save_progress · confirm_syllabus ·
confirm_greek_member · confirm_greek_claim · confirm_rep · confirm_school_request (also referral) ·
confirm_tutoring_request · confirm_outreach_page — each with a GSM-7 one-segment SMS.
Sequences (6, marketing): seq_exam_t10 · seq_exam_t3 · seq_exam_t1 (SMS only) · seq_post_exam1_d1 ·
seq_post_exam1_d7 · seq_meet_lee. Broadcast: broadcast_exam_live. Founder: founder_priority (email +
one-segment SMS with `sms:` deep link + `/outreach/demand?lead=` link), founder_batched (digest line).
Copy is your spec verbatim; tutoring_request/outreach_page follow the same shape. Tests in
`templates.test.ts` guard: renders, one-segment SMS, unsubscribe presence, [TEST] prefixing, clickable founder links.

## 4. Sequence trigger logic (`src/lib/comms/sequences.server.ts`, daily 9am CT via `/api/cron/comms-sequences`)
Leads de-duped by email (earliest row = first signup). Order = priority: **A** exam dates
(`campus_exam_dates` by campus, course code when both known): T-10 email (8–10 days out), T-3
email (2–3 days), T-1 SMS (consented only) → **B** post-Exam-1: threshold = 3+ sets `complete` for
the auth user behind the email; +1d "How'd Exam 1 go?", then +7d "Exam 2 topics are up" only if no
entitlements → **C** meet Lee at 2+ days after first signup → **D** nothing (dormant leads fall
into A when a date exists). Every step has a dedupe key (once per lead); the cap (2 marketing
emails / rolling 7 days, transactional excluded) is enforced at send time so A wins conflicts.
Admin can dry-run / run now from the console.

## 5. Founder alerts (`founderAlert` in `send.server.ts`)
Priority kinds (syllabus, greek_claim, rep; purchase when checkout exists) → email to
`FOUNDER_ALERT_EMAIL` (default **lee@survivestudios.com**) + SMS to `FOUNDER_ALERT_PHONE`
(falls back to `LEE_PERSONAL_PHONE`). Batched kinds (notify_exam, save_progress, school_request)
→ the Sunday digest's new **Demand** section. Rate limit 30/hour; held alerts are logged and the
next alert through says `(+N held)`. `[TEST]` prefixed when `is_test`.

## 6. Broadcast (`/outreach/comms`)
Audience = notify_exam leads for the exam (optionally exam-less signups), de-duped by email, minus
suppressed, minus already-sent (`broadcast:examN[:topic]` dedupe key, unique index). Preview shows
the count, exclusions, campuses and the rendered email; send requires the confirmed count to still
match; `comms_broadcasts` records it.

## 7. Admin + digest
`/outreach/demand` mounts the reworked `WaitlistCard` (admin server fns; kind filter; `sms:` links;
contacted_at toggle; `?lead=` focus). `/outreach/comms` is the console. Both in the Comms nav group.
Weekly digest gained: signups by kind, syllabi received, referrals, chapter claims, top campuses.

## 8. Test harness (`/outreach/comms`)
"Send me one of each" → every template to the email/phone you enter, `[TEST]`-flagged and
`is_test` on the log rows; per-template Re-send; in-browser Preview (desktop + phone width) with
SMS character/encoding/segment count and the plain-text body. Previews need no sign-in (pure
sample data); sends check ADMIN_EMAILS (lee@surviveaccounting.com, lee@survivestudios.com).

## Env this needs at runtime (Vercel)
`RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
`FOUNDER_ALERT_EMAIL` (optional, default lee@survivestudios.com), `FOUNDER_ALERT_PHONE` or
`LEE_PERSONAL_PHONE`, `CRON_SECRET`. Student SMS rides `sms_outbox` on the campus main line
(`campus_phone_numbers` where campus_id is null) and falls back to a direct Twilio send.

## Screenshots (`docs/screenshots/notifications/`)
01 harness · 02/03 notify_exam email desktop/mobile · 04/05 syllabus email · 06/07 meet-Lee email ·
08 `[TEST]` SMS (T-1) · 09 founder priority alert · 10 broadcast template · 11 demand page ·
12 preferences page · 13 consent note on `/start`. The broadcast **recipient-count** preview needs
the DDL applied (it queries the new columns) — take that one on the preview deploy after gate 1.

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,360 pass (6 new) · `bun run build` OK.
