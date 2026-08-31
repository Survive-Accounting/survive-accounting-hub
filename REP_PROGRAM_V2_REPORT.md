# REP PROGRAM V2 — COVERAGE-MAP APPLICATION + DM DASHBOARD

**Date:** 2026-08-30 · **Branch:** `feature/campus-rep-v1` (fast-forwarded to main `a4b99711` before building — 165 concurrent commits absorbed, zero conflicts; rep-critical code from those merges verified intact, and the Cold Outreach session's `sa_cref` module already enforces "a rep's tracked link always wins over a campaign ?ref").

Implements your 08-30 spec: reps are distribution capacity — we enrich, they send from their own accounts to houses they can open.

---

## 1. Twilio env

`twilio-verify.server.ts` now reads **`TWILIO_VERIFY_SERVICE_SID_REPS`** (your new secret) with the generic name as fallback. Real-phone OTP is unblocked the moment this deploys.

## 2. Reps per campus (§1)

`rep_coverage ∈ ifc | panhellenic | both | other` on the rep row, set by YOU at approval (it's required on the Approve action — the coverage call). Self-serve signup gate, exactly as specced (`campusCapacity`, unit-tested):
- no approved reps → open · one covering a single council → open for the other · one covering `both` → closed · two → closed, always.
- `other`/unknown coverage closes self-serve too — you can always approve a second by hand; the data model allows more, the UI gates at two.
- Test reps never close a real campus (capacity counts same-testness only). Closed campuses get a friendly "already has its rep team — text Lee" screen. **QA-proved:** a fresh signup at Alabama (2 approved test reps) was blocked with no row created.

## 3. Application = onboarding (§2)

Signup stays name/email/phone/campus → OTP → workspace. A verified rep lands on **"Which chapters can you reach?"** — one page, four numbered steps, exactly your fields:
1. Graduation year + "**ACCY 201 — you?**" (live course code; taking now / taken / not yet)
2. **Which chapter are you in** (dropdown of their campus's social chapters) + **role chips** (IFC/Panhel officer · Recruitment counselor · Greek Life office · Business fraternity · Student government · None) — officer + counselor are the weighted ones
3. **The coverage map** — every social chapter, grouped by council, each row Member / Know someone / (absence = no connection), with a sticky live counter "**You could reach 7 chapters** · 1 member · 6 know someone"
4. **How would you get this in front of them?** — short text, your GroupMe example as the helper copy

No resume, no upload, no work-auth. Submitting sets `application_status='submitted'` and writes `rep_chapter_reach` (per-chapter rows — we know exactly which houses). Resubmits update the same application. The rep sees "**Coverage map in ⚡ Lee will call you**" — no "approval" language anywhere.

## 4. Review queue (§3)

In `/admin/reps/roster`, one card per applicant, **sorted by chapters reachable descending**, showing: name (+ **COUNCIL ACCESS** badge for officer/counselor roles) · campus · own chapter · grad year · contact · self-reported course status ("has used the product" is honest self-report — rep↔student identity isn't linked yet) · **the reachable number with member/knows breakdown** · their step-4 answer in quotes · scheduled call. Actions: **[Schedule call]** (datetime + notes, stored on the row + `call_scheduled` activity) · **[Approve]** (requires the coverage pick) · **[Waitlist]** · **[Decline]**.

**Approve turns the coverage map into the working list:** an assignment + a rep×chapter tracked link for every reachable chapter — the one-live-assignment-per-chapter index still rules, so a chapter another rep holds is *skipped, never stolen* (the toast tells you how many).

## 5. Dashboard (§4)

Approved reps get **YOUR CHAPTERS · N assigned** above the campus leaderboard (now "All chapters at …"):
- Each row: letters + nickname + **@handle from enrichment** (honest "no IG handle on file — use the kit in the drawer" when we don't have one) · status **○ not contacted / ● DM sent 9/14 / ● replied / ✓ page claimed** · **[Open IG] [Copy DM] [Mark replied]**
- **Copy DM** copies the prewritten message *with their tracked link* and marks dm_sent on first copy; **Mark replied** requires the reply text (same pattern as your main system)
- **Edit DM message**: one editable template with `{chapter}` / `{link}` substitution — the tracked link survives edits ("it's how you get paid")
- **Pace guidance, with the why**: "~10 DMs a day. Blasting 40 chapters in an hour is how Instagram restricts YOUR account."
- Results/materials/kit/flyer/QR unchanged (tap a chapter for the drawer); the payout card now notes the **W-9 before first payout** once they've earned anything (§ your decision 2 — work-auth checkbox stays gone; W-9 collection itself is manual via you for now).

## 6. Attribution (§5)

- **Vanity rep slugs live:** the main link is now `/r/<first>-<campus>` (`piper-mississippi` in QA) with numbered fallback then random. Existing reps keep their codes.
- Rep's 10% flows exactly as before. **The Growth-Partner 5% campus-owner split is NOT built** — there is no campus-owner entity yet; the conversion ledger already records everything needed to compute it retroactively when that entity exists. Flagged as the one deferred piece of §5.
- Rep link vs campaign `?ref`: already enforced in code by the campaign system's own `sa_cref` cookie (rep codes are explicitly ignored by it).

## 7. Measurement (§6)

The roster leaderboard carries chapters q/total, contacts a/s, clicks, signups, revenue — and every DM copy/reply/claim is in `rep_activity` with timestamps, so "chapters opened, not revenue" is queryable from day one. A zero-activity-after-14-days flag view is **deferred** (trivial query on `rep_activity`; wants a week of real data first).

## 8. Migration — APPLIED LIVE

`20260830_1600_rep_program_v2.sql`: partner profile cols (`application_status`, `rep_coverage`, `graduation_year`, `course_status`, `own_chapter_id`, `campus_roles`, `pitch`, call/review fields) · `rep_chapter_reach` (RLS-on) · DM cols on assignments · 7 new activity kinds. **Grandfathering verified:** active reps (Sarah, Casey) → `approved`, everyone else → `setup`; Sarah's dashboard confirmed intact post-migration ($5 pending, Chi O now in her assigned list).

## 9. Tests & QA

- **+15 unit tests** (48 total in rep-shared.test.ts): full `campusCapacity` truth table · reach counting · onboarding validation · DM ladder (first copy → dm_sent, never regresses; replied is sticky) · vanity slug shapes · DM message carries link/chapter/course. Suite: **2,050 pass / 1 pre-existing fail** (bolt-palette, on main). tsc clean. Production build green.
- **Live QA (test data):** Alabama signup blocked at capacity ✓ · Piper Test at Ole Miss: signup → OTP → onboarding renders with live ACCY 201 + 37 chapters ✓ → submitted (4 reachable) → review card exact (badge, breakdown, pitch) ✓ → call scheduled ✓ → approved w/ IFC → **4 assignments + 4 links minted, 0 skipped** ✓ → dashboard YOUR CHAPTERS ✓ → Copy DM → dm_sent → Mark replied (required text) → replied ✓ · vanity slug `/r/piper-mississippi` ✓.

## 10. Files

Migration + `scripts/apply-rep-v2-migration.ts` · `rep-shared.ts` (+capacity/reach/DM/slug logic + tests) · `rep-auth.server.ts` / `rep-auth.functions.ts` (application_status, capacity gate) · **`rep-onboarding.functions.ts`** + **`components/reps/RepOnboarding.tsx`** (new) · `rep-workspace.functions.ts` (assigned payload, vanity slug, `markDmCopied`/`markDmReplied`) · `rep-admin.functions.ts` (applications list, schedule call, review+auto-assign) · `RepWorkspaceView.tsx` (YOUR CHAPTERS, template editor, W-9 note) · `rep_.dashboard.tsx` (state routing) · `rep_.join.tsx` (campus-closed) · `admin.reps.roster.tsx` (queue UI) · `twilio-verify.server.ts` (env).

## Deferred, explicitly

Growth-Partner 5% (needs the campus-owner entity) · W-9 **collection UI** (manual for now; note shown to earning reps) · 14-day inactivity flag view · IG handle coverage varies by campus (Ole Miss's four QA chapters had none on file — enrichment, not code).

## Your retest path (after deploy)

`/rep/join` → real signup with (601) 201-8759 → **real Twilio code** → "Which chapters can you reach?" → mark your two chapters → submit → `/admin/reps/roster` → your card at the top → schedule your own call, approve yourself with coverage → dashboard → Copy DM on your chapters.

## REP PROGRAM V2 READY: **YES** (deployed — see ledger in the final summary)
