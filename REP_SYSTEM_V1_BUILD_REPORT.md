# CAMPUS REP V1 — BUILD REPORT

**Date:** 2026-08-26 · **Branch:** `feature/campus-rep-v1` (worktree `C:\Users\lee\Documents\sa-campus-rep`, base `origin/main` @ `082baadd` — main had not moved since the pre-build audit)
**Status:** Built · Migrated (live DB) · Tested (unit + full live QA loop) · **NOT deployed** · **NOT merged**

The product principle, implemented literally: **FIND THE RIGHT PEOPLE → SHARE FREE EXAM 1 → GET IT INTO THE CHAPTER HOUSE.** Reps source contacts and share; Lee/King own all follow-up.

---

## 1. Architecture — reused, not duplicated

Per the pre-build audit's consolidation law, **no new rep/contact/link silo was created**:

| Concern | Reused | Added |
|---|---|---|
| Rep identity | `referral_partners` (`type='campus_rep'`) | lifecycle cols: `rep_status`, `phone_verified_at`, `approved_at/by` |
| Links/clicks/conversions/commissions | the whole `referral_*` engine, `/r/<code>`, `sa_ref` 30-day last-touch | `referral_links.campus_greek_chapter_id` (rep×chapter is now first-class — no more URL parsing) |
| Chapter directory | `campus_greek_chapters` (6,896) + `greek_orgs` + `councilMatches()` | — |
| Member counts | `greek_chapter_academic_metrics.latest_member_count` | — |
| Contacts | `growth_public_contacts` + `growth_contact_qc` (pending, never self-approved) | `phone`, `submitted_by_partner_id`; `source_url` relaxed to nullable |
| Flyer/QR | `flyer.server.ts` (pdf-lib) + `referral-qr.server.ts` | `FlyerInput.refCode` → QR encodes `/r/<code>` |
| Claim | `greek_chapter_claims` | `sourcing_partner_id`, `sourcing_assignment_id` |
| Money | `referral_conversions` / `referral_commissions` (10 %, pending→approved→paid/void, manual Venmo) | — (no new ledger) |
| Terms | `terms.ts` (`fall-2026`) | — |
| Admin auth | AdminGate + AdminSessionGate + `assertAdmin()` | — |

**New tables (2):** `rep_chapter_assignments` (sourcing-credit spine; partial-unique `(chapter, term) WHERE status IN (reserved,qualified)` = the race gate) and `rep_activity` (non-monetary operational ledger). Both RLS-on/deny-by-default like the rest of the engine.

### Obsolete rep concepts — left untouched / deprecated
- **`campus_rep_applications`** (dead table, 0 rows) — untouched; still dead.
- **Rep Interest form** (`/$school/rep` → `referrals` `[CAMPUS REP]` JSON + `/outreach/reps`) — untouched and still works; its **commission copy fixed to flat 10 %** (the 10 %→15 % tier is retired).
- **Legacy `signUpRep`** endpoint — **neutralized**: now creates the same applied/paused rep as `applyAsRep`, returns no token (the instant-active bypass is closed even for direct callers). Legacy token-gated portal fns now also reject paused/deactivated reps.
- Legacy `?k=` dashboard URLs — honoured **only for `is_test` reps** (the local test loop); real reps sign in by phone.

## 2. Migration

`migration/supabase-migrations/20260826_0900_campus_rep_v1.sql` — idempotent, manual-apply. **APPLIED to live `unvxagsledbsdoremqeb`** via Management API (`scripts/apply-rep-v1-migration.ts`); every column/index/table verified live. Contents: §1 lifecycle cols · §2 link chapter FK + index · §3 `rep_chapter_assignments` + race index · §4 `rep_activity` + kinds check · §5 contact `phone`/`submitted_by_partner_id` + **`source_url` DROP NOT NULL** (a rep submission's provenance is the rep, not a page — found live in QA) · §6 claim sourcing cols · §7 `practice_attempts.ref_code` · §8 RLS.

## 3. Rep lifecycle + auth

`applied → approved (admin) → phone-verified → active`, with `paused`/`deactivated` brakes (kept in sync with the engine's `status` so links stop attributing instantly).

- **Apply** (`/rep/join`): name/email/**phone (required)**/campus/venmo → `applyAsRep` → applied+paused, founder alert, one application per phone (resubmit updates). No link, no token surfaced.
- **Phone verification = login** (`/rep/dashboard`): phone → **Twilio Verify** OTP → `checkRepVerification`. First pass after approval stamps `phone_verified_at`, flips active, mints the main campus link, sets the session. Uniform responses (no rep-probing). Twilio Verify owns the whole OTP lifecycle — **no OTP store in our DB**.
- **Session**: HttpOnly `sa_rep` cookie (30 d) carrying the `dashboard_token`; no bearer token in normal navigation. **Logout** clears it; admin **Revoke sessions** rotates the token (all cookies die).
- **Test path**: a test rep in Test Mode uses fixed code `000000` — no Twilio needed for QA.
- Build-safety: all cookie/`react-start/server` access lives in `rep-auth.server.ts`, imported only inside handler bodies (a first-cut violation of this was caught in QA as a client-graph import-protection 500 and fixed).

## 4. Contact flow (canonical store, rep can never self-approve)

`submitRepContact`: campus+chapter scope enforced server-side → requires email OR phone (E.164), normalizes Instagram → **dedupes against `growth_public_contacts`** for that chapter (email/phone/IG; a match becomes a VERIFY that enriches + stamps `last_verified_at`) → new rows insert with `source_type='rep_submission'`, `submitted_by_partner_id`, `confidence='medium'` → paired `growth_contact_qc` row `qc_action='pending'`, **`outreach_eligible=false`**. King/Lee review in `/admin/reps/roster` (Approve / Approve+outreach / Reject).

## 5. Assignment lifecycle (first person wins)

`RESERVED → QUALIFIED` (QC approve) · `EXPIRED / REASSIGNED / REVOKED`. A usable contact from an approved+verified rep reserves the chapter for the term — enforced by the DB partial-unique index, so the race loser gets a clean "reserved by another rep" (their contact still enters review). QC reject **releases** the reservation unless the rep has another usable contact (`assignmentAfterQc`, unit-tested; a qualified chapter is never demoted by a later reject). Admin: revoke / release / reassign (history preserved: old row → `reassigned`, new row for the target rep).

## 6. Share kit + sharing (no automated rep cold-outreach)

Unlocks with the assignment. One canonical rep×chapter link (`/r/<code>`, chapter FK): tracked link + QR (PNG download) + rep-attributed flyer + prewritten message/email. Actions: **Share** (`navigator.share`), **Text** (`sms:` composer, per-contact `sms:<phone>`), **Email** (`mailto:` with subject/body), **Copy message / Copy link**, **Download flyer / QR**. Twilio is auth-only; reps never touch Resend/Growth send. Every action logs to `rep_activity` (with contact id when aimed at one) and the UI says **"share initiated"** — never "delivered". "Mark flyer posted in chapter house" is explicitly **self-reported**, not a comp trigger, structured so photo proof could attach later (meta jsonb).

## 7. Attribution

QR/flyer/links all route through `/r/<code>` → HttpOnly `sa_ref` (30-day last-touch) + `sa_anon` → click row (hashed IP, bot-flagged) → 302 to the chapter's `/go` page. Purchases credit via the existing metadata.ref_code webhook path; order-submit signup conversion unchanged. **Study attribution (small, additive):** `logPracticeEvents` now stamps `practice_attempts.ref_code` from the cookie (window-checked, best-effort) — rep-level study depth becomes computable going forward; no learning-event redesign. **Claim attribution:** `submitChapterClaim` stamps `sourcing_partner_id/assignment_id` from the live assignment and logs `chapter_claimed` for the rep — claim stays a downstream success event, never a rep responsibility.

## 8. Flyer

Same pdf-lib renderer. `?ref=<code>` is validated (must be an active link bound to that chapter; campus variant accepts any active code). **With no `?ref`, a chapter with a live assignment this term gets the sourcing rep's QR by default** — an exec downloading "their" flyer after claiming keeps crediting the rep. **No rep name appears anywhere on the artwork** (compile-level: `FlyerInput` has no rep-name field; attribution is QR-only). ETag includes the ref code. Campus flyer variant is offered to every active rep ("have a printer?" copy, no promise of printed materials).

## 9. Commission

Flat **10 %** of server-computed, attributed revenue via the existing engine — QA-proved: $50.00 purchase → **$5.00 pending**, idempotent (duplicate subject → deduped, no second commission), `is_test` isolated. Assignment/contact/house-posted **never** create money. Payouts stay manual Venmo with human approval; no Stripe Connect, no auto-pay. Public copy now promises only the flat 10 %.

## 10. Rep UI (`/rep/dashboard`) — mobile-first

Header `SURVIVE · ALABAMA — Fall 2026 · Hi Sarah ⚡` with campus bolt · dismissable 3-line onboarding (+ optional video via `site_settings.repOnboardingVideoUrl`; card hides when unset) · **YOUR IMPACT** (chapters sourced, contacts, clicks, visitors, signups, revenue + commission pending/approved/paid) · **CAMPUS ACTIVITY — last 7 days (all of campus, not just you)** (students, identified, questions, est. study time from `practice_attempts`; **no video metrics — no authoritative source exists, so none are shown**) · campus link + campus flyer · **chapter leaderboard**: social councils only (IFC/Panhellenic/NPHC/MGC via `councilMatches`), letters + nickname, member count (— when unknown), contacts/clicks/signups, one-word state chip (AVAILABLE → RESERVED → ASSIGNED TO YOU → CONTACT VERIFIED → KIT SHARED → FLYER POSTED → ENGAGED → CLAIMED), filters (All/4 councils/Available/Mine/Not started), sorts (largest/clicks/signups/not-started) · full-screen **chapter drawer** on mobile with the 3 steps, contact form, contact list with per-contact Text/Email kit, share kit, house-posted checkbox · payout/Venmo card. GPA appears nowhere as a priority signal.

## 11. Admin UI (`/admin/reps/roster` — new "Campus reps" tab in the existing shell)

Applications queue (Approve/Decline — approving does **not** activate; the phone verify does) · **rep-submitted contact QC queue** (Approve / Approve+outreach / Reject with the assignment consequence spelled out) · roster/leaderboard table (rep, campus, status, phone ✓, chapters q/total, contacts a/s, clicks, signups, revenue, commission; search, status filter, 7 sorts, test-data toggle — **no gimmick score**) · per-rep drawer (identity, stats, approve/pause/reactivate/deactivate/revoke-sessions, **change campus**, assignment list with revoke, link to view-as). Commission approve/void stays in the existing Conversions tab.

## 12. View-as (`/admin/reps/view/$partnerId`)

Renders the **same** workspace component, resolved by `partner_id` through an admin-gated fn — **never the rep's token**. Read-only (every mutating control disabled), persistent **"Viewing as Sarah Test · read only [Exit]"** banner, every open **audited** (`rep_activity: admin_view_as` with the admin email).

## 13. Tests

`src/lib/rep-shared.test.ts` — 22 tests / 50 assertions, all green: lifecycle path · `assignmentAfterQc` (approve→qualified; reject w/o other→revoked; reject w/ other→reserved; qualified never demoted; terminal states frozen) · chapter-state precedence ladder (incl. claimed-beats-all) · contact validation (email-or-phone, malformed email) · Instagram normalization · role→contact_type · share message/email carry the tracked link; `sms:`/`mailto:` encode it · every share method maps to a defined activity kind · **flyer: refCode→`/r/<code>`, no-ref→`/go`, input has no rep-name field** · **10 % commission math**. Full suite: **1,655 pass / 1 fail** — the failure is the pre-existing `bolt-palette` accent-distinctness test, already failing on `origin/main`, untouched by this branch. Typecheck (`tsc --noEmit`) clean. The DB race gate itself is index-enforced and was exercised live (below).

## 14. Live QA (all `is_test=true`; server Test Mode local-only)

Ran on `http://localhost:5280` (launch config `campus-rep`), test rep **Sarah Test · Alabama**:

1. Apply (test banner ✓) → row `applied/paused/is_test` ✓ → admin approve ✓
2. Phone verify with `000000` → active, session cookie, main link `VsxJg01` auto-minted ✓
3. Workspace: real Alabama leaderboard (Chi O 520 members …), campus activity from real `practice_attempts` ✓
4. Chi O drawer → contact "Jane Chapman · President" → **saved + chapter RESERVED** (after fixing the live `source_url` NOT NULL) → QC row pending/ineligible ✓
5. Share kit unlocked: rep×chapter link `VuPBRcX` (chapter FK ✓), QR, message; house-posted self-report ✓; activity ledger rows for every action ✓
6. Flyer: `?ref=` renders ✓; **default flyer ETag proves the sourcing rep's code embeds automatically** (`…|AC 210|VuPBRcX|svg`) ✓
7. `/r/VuPBRcX` → 302 to `/go/university-of-alabama/chi-omega?ref=…`, click row (non-bot, test) ✓
8. Engine purchase $50 → **$5.00 commission pending**; duplicate deduped, no double pay ✓; dashboard: 1/1/1/1/1 · $50 · $5 pending; Chi O → **ENGAGED** ✓
9. Admin QC approve → assignment **QUALIFIED** (+`chapter_qualified`/`contact_qc_approved` activities) ✓
10. Second rep **Riley Test**: same-chapter contact → `reserved_by_other` (contact still enters review) ✓; fresh chapter (KD) → reserved ✓; QC **reject** → reservation **revoked** ✓
11. Campus-scope: foreign chapter id → "That chapter isn't on your campus." ✓ · Pause Riley → session rejected ✓
12. **View-as Sarah**: banner, read-only, her real numbers, `admin_view_as` audit row ✓ · Roster leaderboard rollups correct ✓

Two real defects were found by QA and fixed during it: the `source_url` NOT NULL (migration §5) and the client-graph import-protection on the first cut of `rep-auth.functions.ts` (split into `rep-auth.server.ts`).

## 15. Files

**New:** `migration/supabase-migrations/20260826_0900_campus_rep_v1.sql` · `scripts/apply-rep-v1-migration.ts` · `src/lib/rep-shared.ts` (+ `.test.ts`) · `src/lib/rep-auth.server.ts` · `src/lib/rep-auth.functions.ts` · `src/lib/rep-workspace.functions.ts` · `src/lib/rep-admin.functions.ts` · `src/lib/twilio-verify.server.ts` · `src/components/reps/RepWorkspaceView.tsx` · `src/routes/admin.reps.roster.tsx` · `src/routes/admin.reps.view.$partnerId.tsx`.
**Modified:** `rep_.join.tsx` (application flow) · `rep_.dashboard.tsx` (sign-in state machine + workspace) · `rep-portal.functions.ts` (legacy endpoint neutralized + lifecycle guards) · `flyer.server.ts` + `api.flyer.$school.$chapter.tsx` (rep QR) · `greek-claims.functions.ts` (sourcing) · `practice.functions.ts` (`ref_code`) · `admin.reps.tsx` (tab) · `RepInterest.tsx` (10 % copy) · `site-qa/manifest.ts` · `routeTree.gen.ts` (2 routes registered manually).

## 16. Routes to test

Rep: `/rep/join` · `/rep/dashboard` (sign-in → workspace) · `/r/<code>` · `/api/flyer/<campus>/<chapter>?ref=<code>` and `/api/flyer/<campus>/campus?ref=<code>`.
Admin: `/admin/reps/roster` · `/admin/reps/view/<partnerId>` (plus the untouched `/admin/reps` link/partner/conversion tabs).

## 17. Env / config still needed (for REAL reps — test loop needs none of this)

- **`TWILIO_VERIFY_SERVICE_SID`** — create a Verify Service in the Twilio console (Verify → Services → Create, SMS channel) and add the SID (`VA…`) to Vercel. Uses the existing `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` already in Vercel. Until set, real-rep OTP fails closed with a friendly message.
- Optional: `site_settings.settings.repOnboardingVideoUrl` when Lee records the explainer.
- Reminder from earlier sessions (unchanged): `TEST_MODE_ENABLED` is ON in Vercel prod — turn OFF before Exam 2; `REFERRAL_IP_SALT` optional.

## 18. Known deferred items

- **Rep-level study-depth metrics** — the capture (`practice_attempts.ref_code`) now exists but no dashboard reads it yet (data starts accumulating from deploy).
- Cram-video metrics — no authoritative source exists; deliberately omitted everywhere.
- Direct one-click reassignment UI (drawer offers revoke; reassign exists as a server fn `adminAssignmentAction`).
- Term expiry is enforced by term-scoped queries (an old assignment simply stops mattering); no cron marks rows `expired`.
- Edge-cache nuance: a chapter flyer fetched before its first assignment can serve the unattributed copy for up to `s-maxage` (1 day) — self-heals.
- Rep-facing QC "approve+outreach" eligibility flows into the Growth queue; the actual sends remain 100 % Lee/King.
- `types.ts` not regenerated (new tables accessed via the repo's established untyped-table convention, same as the referral engine).

## 19. Ledger of record

- **Branch:** `feature/campus-rep-v1` · final commit: see `git log` (report committed on the branch; pushed to origin, **not merged**)
- **Migrations created:** `20260826_0900_campus_rep_v1.sql` (1)
- **Migrations applied:** the same, applied live + re-applied after the `source_url` relaxation; all objects verified via information_schema
- **DB writes beyond DDL:** `is_test=true` QA data only — 2 test reps (Sarah/Riley), 3 contacts + QC rows, 2 assignments (qualified/revoked), 1 rep×chapter + 1 campus link, 1 click, 3 conversions (1 signup, 1 purchase, 1 dedup no-op), 1 commission (500¢ pending), ~15 `rep_activity` rows
- **Test results:** 1,655 pass / 1 pre-existing fail (bolt-palette, on main) · tsc clean
- **Build:** `bun run build` green (see final-build log)
- **NOT done, by instruction:** no deploy, no merge to main, no real emails/SMS (founder alert rerouted to tester by Test Mode; Twilio never called in QA)

---

## CAMPUS REP V1 READY TO TEST: **YES**

The whole loop — apply → approve → verify → source → reserve → QC → share → click → purchase → 10 % commission → leaderboard → view-as — has been run end-to-end against the live schema with test data. The only thing between a real rep and their dashboard is the `TWILIO_VERIFY_SERVICE_SID` env var.
