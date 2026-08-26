# REP ONBOARDING — SELF-VERIFY POLISH

**Date:** 2026-08-26 · **Branch:** `feature/campus-rep-v1` (continuing the V1 worktree; base = deployed `95385c77`, main had not moved) · **Deployed:** yes — see the ledger at the bottom.

Focused pass only: signup/first-entry. The dashboard, assignment workflow, and referral architecture are untouched.

---

## 1. Signup lifecycle — the approval gate is GONE

**FORM → VERIFY PHONE → REP DASHBOARD.** No waitlist, no "Lee reviews every application", no approval screen anywhere.

- `applyAsRep` now creates the rep as `rep_status='approved'` ("cleared to verify", engine `status='paused'` so nothing attributes early) and the UI immediately launches Twilio Verify — same page, no navigation.
- The verify screen matches the spec: **"Verify your number" · "We sent a code to (601) 201-8759" · 6-digit code · [Verify & open my dashboard] · [Resend code] · [Change number]**.
- `checkRepVerification`: a passed OTP **is** the activation gate — sets `phone_verified_at`, flips `rep_status`/`status` to `active`, mints the main campus link, sets the HttpOnly session cookie, and the client routes straight to `/rep/dashboard`. Legacy `applied` rows activate the same way.
- Admin **pause / deactivate / revoke-sessions** after activation are unchanged (and a paused rep cannot resurrect through signup or the OTP — both refuse).

## 2. Duplicate signups (§11) and sign-in (§12)

- **Verified + active** phone/email → no new row; the page shows **"Looks like you already have a rep account. [Sign in]"**.
- **Incomplete/unverified** signup → the SAME row is updated and verification resumes — a duplicate `referral_partners` row is impossible from this flow (verified live: re-submitting kept exactly 1 row per phone).
- Email is the tie-breaker lookup after phone, so "same person, new number" also resumes instead of duplicating.
- "Already a rep? **Sign in →**" links to `/rep/dashboard`'s phone-OTP sign-in; bearer `?k=` tokens remain out of normal UX (test reps only).

## 3. Twilio Verify behavior

Unchanged provider integration (`twilio-verify.server.ts`, Verify API v2). Signup calls `startRepVerification` right after the form; **Resend code** re-invokes it; a wrong code is rejected by Twilio's check. Test reps in Test Mode still bypass with `000000`.
⚠ **Prod gate (unchanged from V1):** real-number OTP requires `TWILIO_VERIFY_SERVICE_SID` in Vercel. If it isn't set yet, your signup will stop at a friendly "verification isn't configured yet" — that env var is the one switch.

## 4. School picker — universal desktop type-to-search

Implemented **once** in the canonical `SearchPicker` (used by rep signup, `/rep`, chapter finder, partner pages, landing professor picker) **plus** the landing page's `PickerSheet` school trigger — every school-picker surface now behaves the same:

- Focus the picker (tab from Phone, or click it) and **just type** — the panel opens with that character already seeding the search, caret at the end, list filtered ("O" → "Ol" → Ole Miss). Enter/ArrowDown also open.
- **Guardrail by construction:** the keydown handler lives on the picker's own trigger button — there is no document listener — so typing in any input/textarea/contenteditable anywhere else is untouched. Modifier chords (Ctrl+F/Cmd+K) and named keys (Tab, Space) keep their native meaning (unit-tested predicate `seedCharFromKey` in `src/lib/picker-keys.ts`).
- Mobile tap/open behavior unchanged.

## 5. Copy + form changes

- **Hero** (`/rep/join` and the `/$school/rep` ad): eyebrow CAMPUS REPS · **"One job: get my free Exam 1 prep into every chapter house."** · exactly three bullets, with **10%** and **$300+** visually emphasized. No extra explainer paragraphs — the form is the next action.
- **Phone field:** "We'll text you a code to verify your number. This is also how you'll sign in." + live `(601) 201-8759` formatting while typing (`formatUsPhoneInput`, display-only; server still stores E.164; a `+`-prefixed international number is left verbatim).
- **CTA:** "Get started — takes 30 seconds".
- **Venmo removed from signup.** The dashboard payout card now carries **"GETTING PAID — add your Venmo before your first payout"** with an accented **Add Venmo** button when empty; existing storage/update untouched; nothing blocks activation.
- **Approval-copy sweep** (§8): removed from `/rep/join` (whole waitlist screen deleted), `/rep/dashboard` sign-in (dead "application pending" branch deleted; "Apply here"→"Get started"), `rep-auth.server` session messages, and the `/$school/rep` page — whose old **"Send it to Lee" application form is retired**; the page is now the ad + a CTA into self-serve signup. `/rep` (the school picker) had no approval copy. Admin roster's queue is relabeled "Legacy unverified signups" (renders only for pre-existing `applied` rows).
- ⚠ **Flag for Lee:** retiring the old form also retired its **US work-authorization checkbox** (the F-1 gate you'd built deliberately). The self-serve form is exactly Name/Email/Phone/Campus per this brief — if the contractor-authorization gate should return, it belongs on `/rep/join`; say the word and it's a 10-minute add.

## 6. Footer spacing (§7)

Root cause found: the inline `padding: "0 20px"` **shorthand** on `<main>` silently overrode the Tailwind `pb-*` class — that's why the card touched the footer. Fixed with longhand side padding + `pb-24 sm:pb-32` on `/rep/join` (measured: **96px** gap on mobile) and `pb-20 sm:pb-28` on `/rep/dashboard`, so the post-verification landing has no collision either.

## 7. Test-account reset (§9) — deletion log

Searched `lee@survivestudios.com` / `+16012018759` (and raw `6012018759`) across every rep table:

| Table | Found | Removed |
|---|---|---|
| `referral_partners` (type=campus_rep) | 1 — `f4173c0d…` "Lee Ingram", applied/paused, unverified, is_test=false, campus=Ole Miss | **1 (the row)** |
| `referral_links` (his partner_id) | 0 | 0 |
| `referral_clicks` / `conversions` / `commissions` | 0 / 0 / 0 | 0 |
| `rep_chapter_assignments` | 0 | 0 |
| `rep_activity` | 0 | 0 |
| `growth_public_contacts.submitted_by_partner_id` | 0 | 0 |
| `greek_chapter_claims.sourcing_partner_id` | 0 | 0 |
| legacy `referrals` `[CAMPUS REP]` rows | 0 | 0 |
| `campus_rep_applications` | 0 | 0 |

Your earlier signup had stalled at the old approval wall, so it had zero children — a single-row delete. **Post-delete verification: 0 rows** match either identifier; Ole Miss campus/chapter/contact intelligence untouched; assignment logic untouched. You are a brand-new rep to the system.

## 8. Tests / build

- **Unit:** +11 new tests (33 in `rep-shared.test.ts`): `signupResolution` (fresh / resume / existing-active / paused-blocked), `formatUsPhoneInput` (progressive, paste, cap, international), `seedCharFromKey` (printables seed; Tab/Enter/arrows/Escape/Backspace/Space don't; Ctrl/Cmd/Alt chords don't).
- **Live dev QA:** fresh test signup → verify screen (exact spec copy + Resend/Change number) → `000000` → landed on `/rep/dashboard` with the Venmo prompt and onboarding card · duplicate-active → `existing_active` · incomplete → resumed on the same row (1 row per phone verified in DB) · paused rep blocked · bad code rejected · both pickers seed from a keystroke · mobile 375px: no horizontal scroll, `tel` keyboard, `one-time-code` autocomplete on the code field, 52px CTA, 96px footer gap.
- **Suite:** typecheck clean · **1,678 pass / 1 fail** (the pre-existing bolt-palette accent test, failing on main) · production build green (`NODE_OPTIONS=--max-old-space-size=6144` — the merged tree needs the bigger heap locally; Vercel unaffected).

## 9. Files changed

`src/lib/picker-keys.ts` (new) · `src/components/site/SearchPicker.tsx` · `src/routes/landing.tsx` (school-trigger seeding only) · `src/lib/rep-shared.ts` (+`signupResolution`, `formatUsPhoneInput`, status labels) · `src/lib/rep-auth.functions.ts` (self-verify signup + activation) · `src/lib/rep-auth.server.ts` (session messages) · `src/routes/rep_.join.tsx` (rewrite) · `src/routes/rep_.dashboard.tsx` (sign-in copy, dead branch, spacing, phone formatting) · `src/components/site/RepInterest.tsx` (ad + CTA, form retired) · `src/components/reps/RepWorkspaceView.tsx` (Venmo prompt) · `src/routes/admin.reps.roster.tsx` (legacy labels) · `src/lib/rep-shared.test.ts`.

## 10. Ledger

- **Branch/commit:** `feature/campus-rep-v1` — see final commit in git log (merged FF to main and pushed).
- **Deployment:** production via main push; verified `/rep` and `/rep/join` HTTP 200 and the new hero serving live.
- **DB writes:** the single authorized identity delete above + `is_test=true` QA reps (Casey `+15550003333` active, Drew `+15550004444` unverified — harmless, deletable any time).
- **No unrelated worktree branches merged.**

## Routes for your retest

1. `/rep/join` — type-to-search the picker (tab from Phone, type "O"), full signup with **(601) 201-8759** → real Twilio code (needs `TWILIO_VERIFY_SERVICE_SID` in Vercel) → dashboard.
2. `/rep/join` again after activating → "already have a rep account → Sign in".
3. `/rep/dashboard` → Sign out → sign back in by phone.
4. `/ole-miss/rep` and `/rep` — the ad + CTA path.
5. On the dashboard: the GETTING PAID Venmo prompt.

---

## REP SIGNUP READY FOR LEE RETEST: **YES**

(One env dependency: `TWILIO_VERIFY_SERVICE_SID` in Vercel for real-number OTP — everything else is live.)
