# Rep system — automated messaging audit (2026-09-06)

Addendum §0: every automated SMS and email in the rep system, in one place. Three columns of
time: what fired before today, what today's build adds (application flow, live once the
migration runs), and what the two queued specs would add. Report only.

Legend: **L** = Lee's phone/inbox · **A** = applicant/rep · **T** = test-mode rows never send
(logged instead).

## A. Already firing before today

| # | Trigger | To | Channel | Content | Frequency / guard |
| --- | --- | --- | --- | --- | --- |
| A1 | Apply form submitted (`applyAsRep`) | L | email + SMS | founder alert: "rep · name · school · email · phone" | every fresh signup; founder alerts capped 30/hour, held count reported; T suppressed |
| A2 | Phone verify started / every sign-in | A | SMS (Twilio Verify) | the 6-digit code | per attempt; Twilio rate-limits; test reps skip Twilio |
| A3 | Admin roster → Decline | A | email (`rep_declined`) | warm decline note | once per rep (dedupe key) — **replaced today by the denial text; the template is now unused** |
| A4 | Legacy `/rep` interest form (`submitRepInterest`, `confirm_rep`) | A + L | email + SMS | "Got your application" | **dead path** — nothing renders that form any more |
| — | Crons (`weekly-digest`, `king-digest`, `comms-sequences`, `chapter-reports`) | — | — | **none touch reps** (grep: no `referral_partners` / `rep_activity` in any cron) | — |

Dashboard actions (Copy DM, Mark replied, house posted, share kit) log activity only; **no
message fires from the rep workspace today.**

## B. Added by today's build (application flow)

| # | Trigger | To | Channel | Content | Frequency / guard |
| --- | --- | --- | --- | --- | --- |
| B1 | Onboarding submitted (`ready_for_review`) | L | SMS | "Onboarding complete · name · campus", student/alumni, major, course, Greek, why, comfort list, chapters (n picked, m connections), résumé link, **Invite to a call** link, **Deny** link | once per applicant; T → shown on screen instead |
| B2 | Lee taps *Invite to a call* | A | SMS | "[Name] — read your application and I like it. Let's do a quick call this week and get you going. When works? — Lee" | once; a second tap never re-texts the applicant |
| B3 | Same tap | L | SMS | "Sent to [name]. After the call — Approve: … Deny: …" | every tap (links re-sent on purpose) |
| B4 | Approve (link or roster) | A | SMS | the approval text, verbatim, with rep # and dashboard link | once |
| B5 | Deny (link or roster) | A | SMS | the denial text, verbatim | once |
| B6 | Rep replies to any of the above | L | SMS | "Rep reply · name (campus): …" | every reply; unknown numbers still get silence |
| B7 | 24h after phone verify, onboarding incomplete | A | email | "15 minutes to go" + link | once |
| B8 | 72h after phone verify, still incomplete | A | email | "last nudge" + link | once, then stop |
| B9 | 8am CT daily | L | SMS | "Reps yesterday: X applied, Y finished onboarding, Z approved. N waiting on you." | daily; **skipped on a quiet day with nobody waiting** |
| B10 | Beta "what was confusing here?" | L | SMS | "Rep beta · screen · who: text" | per submission; off with `repBetaMode=false` |

Kept from before: A1 (founder alert at form submit) and A2 (OTP). Note A1 + B1 means Lee hears
about each applicant twice — once at submit, once when the onboarding is done. The spec asked for
both ("new application submitted" and "onboarding completed"); if that is noisy, A1 is the one
to drop.

## C. Queued specs would add

| # | Spec | Trigger | To | Channel |
| --- | --- | --- | --- | --- |
| C1 | Timeline §6 | link activity on a chapter link | rep | SMS |
| C2 | Timeline §6 | first sign-up from a chapter | rep | SMS |
| C3 | Timeline §6 | flyer / QR threshold hit (5+) | rep | SMS |
| C4 | Timeline §6 | chapter closes | rep | SMS |
| C5 | Timeline §6 | commission earned | rep | SMS |
| C6 | Timeline step 3 | screenshot uploaded | rep | in-app: "we'll notify you the moment that link gets activity" |
| C7 | Addendum §2 | 3 days after a send | rep | in-app prompt (SMS optional): "Did [chapter] respond?" |
| C8 | Addendum §4 | chapter crosses a sign-up threshold | rep | SMS: "12 people from [chapter] have signed up…" |
| C9 | Addendum §5 | flyer / QR hits 5+ | (ledger) | bonus paid automatically; pairs with C3 |

C1 and C8 overlap (activity vs sign-ups). Recommendation before building: **one rep-facing
notification stream with a per-chapter daily cap**, sign-ups as the headline metric, clicks
folded into the sign-up text rather than their own message.

## The picture in one line

Applicant: OTP → (reminder ×2 if stalled) → interview text → approval or denial text.
Lee: founder alert → review text with links → post-invite links → daily summary; plus replies,
beta feedback.
Rep after approval: nothing today; five to nine dopamine texts once the queued specs land.

## Conflict to resolve (addendum §6)

The application copy says **"maximum of two reps per campus"**; the addendum wants **one person
owning their campus**, with Level 2 recruiting for other schools only. The code today: one rep by
default, a second only if the first covers a single council, never more than two
(`campusCapacity`).

**Recommendation:** keep the copy at two, keep the gate as is, and make the second rep
**Lee's assignment only** — never something the first rep recruits into. Concretely: Level 2
copy and the referral bonus exclude the rep's own campus; the second seat opens only from the
roster. That preserves the "IFC rep + Panhellenic rep" case without splitting a campus that one
person is covering.
