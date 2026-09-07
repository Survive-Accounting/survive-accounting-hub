# Rep application & pre-onboarding — handoff (2026-09-06)

Built from Lee's spec "Rep Application & Pre-Onboarding (FINAL)" plus §1 of the dashboard-timeline
spec (approval after the call). Scope: apply → pre-onboarding → ready for review → interview →
approve / deny. The dashboard timeline and the addendum items are queued behind this.

## SQL LEE MUST RUN

`migration/supabase-migrations/20260907_0100_rep_pre_onboarding.sql` — two additive columns on
`referral_partners` (`rep_profile jsonb`, `rep_number int`). Until it is applied, the apply form
and the onboarding fail LOUDLY with `MISSING MIGRATION: run …` (verified on the test campus).
Nothing else in the app changes behaviour until the columns exist.

## Env / Vercel (verify, most already set)

| Key | Used for |
| --- | --- |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` | every text (already in use) |
| `TWILIO_VERIFY_SERVICE_SID_REPS` (or `TWILIO_VERIFY_SERVICE_SID`) | the phone OTP (already in use) |
| `FOUNDER_ALERT_PHONE` → `LEE_PERSONAL_PHONE` → `LEE_URGENT_PHONE` | Lee's phone for the review text, beta feedback, rep replies, the daily summary. Same chain the founder alerts use; fallback is the urgent-idea number. |
| `RESEND_API_KEY` | the 24h / 72h reminder emails |
| `CRON_SECRET` | `/api/cron/rep-nudges` (fails closed without it) |
| `PUBLIC_SITE_URL` | optional; links default to `https://surviveaccounting.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | also signs the review links (HMAC) |
| `TEST_MODE_ENABLED=1` | the King/tester loop (`docs/REP-TESTING.md`) — test reps never text anyone |

`vercel.json` now registers `/api/cron/rep-nudges` hourly. Reminders go every hour they are due;
the daily one-line summary to Lee goes only in the 8am-Chicago hour (POST bypasses the gate).

## The four videos — `/admin/reps/onboarding-videos`

One card per step: upload the MP4 (Mux direct upload, public playback, same path as the /shipped
recorder) or paste a public playback id. The step's gist card becomes the video the moment the id
lands. The beta-mode switch is on the same page. Behind the scenes these are
`site_settings.settings.repOnboardingVideos.{step1..step4}` and `repBetaMode`.

The scripts (highlights + riff cues, never a script) are the reps lane on `/admin/ideas/strategy`,
each already minted as a /v3 set with the slides and teleprompter laid out:

| Step | Short on the board | /v3 set |
| --- | --- | --- |
| 1 · What Survive is | What Survive is (for a rep) | `/v3/strategy/what-survive-is-for-a-rep/blast-off` |
| 2 · The mission | The mission | `/v3/strategy/the-mission/blast-off` |
| 3 · The role | What a rep actually does, week to week | `/v3/strategy/what-a-rep-actually-does-week-to-week/blast-off` |
| 4 · How you earn | How you get paid (rewritten to the two-level tables) | `/v3/strategy/how-you-get-paid/blast-off` |

## Test loop (verified end to end on 2026-09-06, local + production DB)

1. Open `https://surviveaccounting.com/rep/join/test-university?feedback=1&testmode=1&t=Lee&email=lee@surviveaccounting.com`
   (all four params; Test Mode stays on for the tab). Use a phone number no test rep has yet
   (the fixtures hold 555-000-1111 … 4444; 555-000-9999 is Claude's run).
2. Apply → code `000000` → "Your application is pending" → Start the onboarding.
3. Six steps. Leave and reload any time — it resumes where you were.
4. Send to Lee → the ready screen shows the text you WOULD have got, with the two links. Tap
   **Invite to a call** → confirm page → "Send the call text" → the applicant's text + your
   Approve / Deny links appear on the page (test reps never actually text anyone).
5. Tap **Approve** → rep #900N, chapters assigned → `/rep/dashboard` is the workspace. Tap the
   old Deny link → "already decided".
6. Reset for another run: `/outreach/test-mode` (TestModeBar) → purge test data, or sign out and
   apply with a fresh 555 number.

## Routes

| Route | What |
| --- | --- |
| `/rep/join/<campus>` | campus preloaded (picker id or slug), Greek list, course code in the copy |
| `/rep/join` | same page, campus is a searchable dropdown |
| `/rep/onboarding` | the six steps + résumé; also the applicant's status page |
| `/rep/review/<id>/interview|approve|deny?t=…` | Lee's confirm page from the texts — no login |
| `/rep/dashboard` | unchanged; a `setup` applicant is sent to the onboarding, `submitted` sees status |
| `/api/cron/rep-nudges` | reminders + daily summary |

## The flow, as built

1. Apply (name, email, phone, campus, Greek affiliation, student/alumni, major, "Have you taken
   ACCY 201?", why) → Twilio OTP → **pending** screen (Lee's copy) → onboarding.
   `applyAsRep` still sends the existing founder alert (email + text) at form submit.
2. Six steps with a response each (`rep_profile.steps`), progress saves. Step 4 shows Level 1 and
   the locked Level 2 table, the bonus gate, the duration rule and the "active" threshold. Step 5
   is the comfort multi-select with "More info" tooltips. Step 6 is the campus chapter list with
   a "know someone" flag. Optional résumé (folder `rep-resumes`).
3. Submit → `application_status = submitted`, reach rows written (own chapter = member, flagged
   targets = knows someone), **Lee's review text** with the whole picture and two links: *Invite
   to a call* and *Deny*.
4. Lee taps Invite → the applicant gets the "read your application and I like it" text; Lee gets
   *Approve* / *Deny* links back (and sees them on the confirm page). `interview` is derived
   (`rep_profile.interview`) — `application_status` stays `submitted`, no enum change.
5. Approve → rep number, coverage derived from own chapter's council, reach + targets fan out to
   assignments, approval text (verbatim, includes the dashboard link). Deny → denial text
   (verbatim). The roster's approve/decline buttons go through the same code.
6. Rep replies to those texts are forwarded to Lee's phone (`api.ideas.sms.tsx`), no auto-reply.
7. Reminders at 24h / 72h after phone verification if the onboarding isn't done — two, then stop.

## Decisions I made — say the word to change any

- **"Actively managing" threshold** (rep-copy.ts): at least 1 logged chapter action every 30 days.
  Measurable, shown to the rep. Numbers are mine.
- **Coverage on link approvals** derives from the applicant's own chapter council (IFC →
  `ifc`, Panhellenic → `panhellenic`, else `other`). The roster can change it.
- **The approval text** still ends "Let's do a quick call this week" (your verbatim copy). With
  approval now after the call, that line may read odd — one-line change in
  `rep-pre-onboarding.ts` when you decide.
- **Test reps** are numbered from 9001 so real rep numbers stay clean.
- The old in-workspace onboarding (`RepOnboarding.tsx`) is no longer mounted; left in place.
- Two reps per campus vs one: see the audit doc — needs your call.

## Test loop (after the migration)

```
https://surviveaccounting.com/rep/join/test-university?feedback=1&testmode=1&t=King&email=you@example.com
```
Code `000000`. Test reps never text anyone; the ready-for-review screen and the confirm page show
the texts that would have gone out. The review links in the preview work.
