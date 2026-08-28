# PLATFORM / MAJOR FEATURES — SESSION HANDOFF

**Written:** 2026-08-27 18:15 CST · by the LANDING/platform session (sa-growth-dashboard)
**Updated:** 2026-08-27 (late) — TWO-DOOR HOMEPAGE V1 shipped, see §0.
**Read this before starting any platform feature work.** Read `docs/SESSION-CONTEXT.md` first for repo-wide rules.

---

## 0. TWO-DOOR HOMEPAGE V1 — MERGED AND LIVE (2026-08-27)

"/" no longer renders LandingPage + the live player. It renders `TwoDoorHome`
(`src/components/site/home-two-door/`): centered hero → proof chips → STUDY ON YOUR OWN |
STUDY WITH YOUR CHAPTER → course-scope line → reviews/Lee → value strip → FAQ. The public
Exam 1 CTA opens the **waitlist modal (FREE · SEPTEMBER 1**, `EXAM1_LAUNCH_LABEL` in
`src/lib/launch.ts`) → existing `submitNotify`/campus_waitlist — BY DESIGN, while the new
player is rebuilt privately. Campus pages (/$school) and /go/ pages still render the full
LandingPage + player, untouched. Built in worktree `sa-homepage-two-door` (branch
`feature/homepage-two-door-v1`, merged @ main `892482f3`), **verified live by content**
(homepage strings present, campus-page player intact, no old orange nav CTA). Full detail:
`HOMEPAGE_TWO_DOOR_V1_REPORT.md` (repo root). Do not re-add the player or a third CTA to "/".
/preview/home (the old two-portal experiment this supersedes) is still deployed + noindexed —
cleanup candidate once Lee confirms the new "/".

---

## ⚠️ STATE CORRECTION — GUIDED EXAM 1 PATH IS ALREADY MERGED

The handoff instruction said the guided path (branch `feature/guided-exam1-path-v1`, HEAD `6dad505b`) was
"PUSHED / NOT MERGED / NOT DEPLOYED". **That is stale.** Verified 2026-08-27 ~18:00 CST:

- `git merge-base --is-ancestor 6dad505b origin/main` → **true**. The exhibit-conveyor's bulk merge earlier
  today (landing on origin/main @ `908d74b9`, "Merge PR #6 cash-accrual-exhibit") swept it in.
- Production was verified BY CONTENT serving the `908d74b9` deploy (portal-home strings live at
  /preview/home, demo strings at /go/demo). The guided path ships in the same deploy, so it is
  **merged and almost certainly live**. A direct bundle grep for a guided-path string was inconclusive
  (lazy chunks) — one visual confirmation on surviveaccounting.com (Start Exam 1 → guided state)
  closes it. The uncommitted `docs/screenshots/guided-path/12-LIVE-*.png` in sa-exam1-polish suggest
  that session already did this live QA — check with them / look at the images before repeating it.

**DO NOT REBUILD OR RE-MERGE the guided path.** Everything listed in its scope (guided path, sidebar
Exam 1 Path, progress, Back/Next, retry/continue, auto-advance, manual browsing, completion, utility-menu
cleanup, Reset intro, school-picker cleanup, "You're ready…" start state) is on origin/main.
Report: `GUIDED_EXAM1_PATH_V1_REPORT.md` (repo root of the branch/worktree). Screenshots:
`docs/screenshots/guided-path/`. Its QA already run: tsc clean, prod build clean, 1,689 tests
(only pre-existing bolt-palette red), 10 new exam-path tests green, desktop + 390px + reduced-motion QA.
Automatic professor/syllabus personalization nudges are NOT built — a possible later feature.

---

## 1. This session's state (sa-growth-dashboard)

- **Worktree:** `C:\Users\lee\Documents\sa-growth-dashboard` — the worktree that HOLDS `main` checked out.
- **Branch / HEAD:** `main` @ `908d74b9`, exactly in sync with `origin/main`. Working tree clean
  (except this handoff file until committed).
- **No active feature is underway.** Both of this session's prompts are DONE, merged, pushed, and
  verified live in production:
  1. **Two-portal home** (commit `95138730`): `/preview/home` (noindex) + `/go/demo` demo chapter with
     DEMO|ADMIN toggle + `/go/demo/demo` 301. Live `/` verified UNCHANGED in prod. Awaiting Lee's
     design approval; promotion = pass the `portalHome` prop from `src/routes/index.tsx` exactly as
     `src/routes/preview_.home.tsx` does.
  2. **Ask Lee email gate** (commit `304ee694`): email-gated AskBox + `src/lib/student-email.ts`
     identity bridge (`sa-student-email`); asks source-tagged `ask-lee` in campus_waitlist.
- **Exact next action for this stream:** none pending. Waiting on Lee: (a) approve/iterate the
  /preview/home design, then swap it onto "/" in a later prompt; (b) nothing else.
- **QA already run on this stream:** full prod build EXIT=0; tsc clean; test suite green except
  pre-existing `bolt-palette.test.ts` "distinct accents" (fails on pristine origin/main — unowned,
  needs triage); live prod verified by content (200s + feature strings + `/` unchanged); AskBox both
  states exercised in a real browser; demo flip/adventure/claim-modal exercised to the claim form
  (no real claim submitted).

## 2. Worktree map (as of this handoff)

All `sa-*` folders are **linked worktrees of one repo** (`survive-accounting-hub`; shared object store
and refs — another worktree CAN `git push origin main` without checking main out, and did, twice today).

| Worktree | Branch @ HEAD | Purpose / state |
|---|---|---|
| `sa-growth-dashboard` | **main** @ 908d74b9 (= origin/main) | Holds main. Platform/major-features stream (this session). Idle, clean. |
| `sa-exam1-polish` | **detached HEAD** @ eb1cef06 (merge of origin/main into feature/guided-exam1-path-v1) | Guided Exam 1 Path — COMPLETE and merged to main (see correction above). 3 uncommitted LIVE screenshots. Detached HEAD is a flag: nothing should build here without re-attaching deliberately. |
| `sa-exhibit-lab` | `cash-accrual-exhibit` @ bf3f9f51, behind origin/main by 1 | Exhibit conveyor (studio session). Exhibits #4–#6 merged+deployed today; queue state in shared memory `sa-exhibit-queue-state.md`. Also owns `/leeportal` (merged). |
| others (`sa-campus-rep`, `sa-course-intel`, …) | various feature branches | Dormant intel/feature streams — see each worktree's own reports. |

**Same-branch collision risk:** none observed right now — but TWO different sessions pushed
`origin/main` today without holding it (via the shared ref). Convention going forward: main merges
happen in sa-growth-dashboard, or coordinate via cross-session message first; always `git fetch` and
expect origin/main to have moved before any push (it moved twice mid-push today).

## 3. Processes / ports

- This session started ONE server: vite dev via the `growth-dashboard-dev` launch config
  (`C:\Users\lee\Documents\.claude\launch.json`), **port 8091**, worktree sa-growth-dashboard,
  purpose: preview QA of /preview/home and /go/demo. It is **already dead** (died with a session
  restart; port 8091 verified empty). Nothing else owned by this session is running; all its
  background builds completed or were stopped.
- Launch config also defines `exhibit-lab-dev` on **8092** (sa-exhibit-lab, studio session's) — not
  this session's to manage.

## 4. Blockers / open items

- `bolt-palette.test.ts` "distinct accents" fails on pristine origin/main (93 distinct vs >95.2
  needed). Pre-existing, unowned. Someone should triage or re-baseline deliberately — never delete it.
- The `/preview/home` → `/` promotion decision is Lee's.
- Demo-page claim source tags live in `expand_events` (`greek_demo_page:` / `greek_demo_claim:<school>/<chapter>`)
  because `greek_chapter_claims` has no source column and migrations are manual-apply. If a real
  source column is ever wanted, that's a migration under the SESSION-CONTEXT rules.

## 5. DO NOT REDO

- Guided Exam 1 Path (merged — see correction).
- Two-portal home /preview/home, /go/demo, /go/demo/demo, flyer-API demo case (merged + live).
- Ask Lee email gate + student-email bridge (merged + live).
- Cycle-modes exhibit switcher, /leeportal, King HQ, exhibits #4–#6, guided path (all on origin/main @ 908d74b9).
- Site-qa manifest registrations for preview_.home / go.demo / go.demo.demo / leeportal (done).

## 6. Read these before working

- `docs/SESSION-CONTEXT.md` — repo-wide rules (READ FIRST).
- `GUIDED_EXAM1_PATH_V1_REPORT.md` — guided path scope/QA.
- `src/routes/preview_.home.tsx` + `src/components/site/portal-home/` — the portal-home experiment.
- `src/routes/go.demo.tsx` — the demo chapter page.
- Shared memory index: `C:\Users\lee\.claude\projects\C--Users-lee-Documents\memory\MEMORY.md`.
