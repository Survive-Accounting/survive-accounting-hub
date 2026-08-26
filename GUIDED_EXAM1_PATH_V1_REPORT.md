# GUIDED EXAM 1 PATH V1 — REPORT

**Branch:** `feature/guided-exam1-path-v1` (worktree `C:\Users\lee\Documents\sa-exam1-polish`, dev server config `exam1-polish` → localhost:5262)
**Base:** `a91fdf07` (main at session start — includes the Exam 1 polish + campus-rep merges)
**Commits:** `a2939d09` (path model) · `3ca071d1` (player wiring) · `47afd306` (sidebar/menu/reset) · `+1` finished-screen completion fix · `+1` this report.
**NOT DEPLOYED** (per spec). Pushed to origin for review.

---

## The product model

**THE PATH** (primary): press **Start Exam 1**, keep pressing **Continue**. Survive sequences everything.
**THE MAP** (secondary): the left sidebar stays free navigation; manual jumps update the path position and never get forced back.

## Path model (`src/lib/exam-path.ts`, 10 unit tests)

- A **step** is `{setId}:{stage}` with kind `cram_video` / `practice_set` / `review_video`.
- `buildPath(topics)` walks the exam's topics in map order; each free set contributes cram → practice → review **only for content that exists right now** (`playbackId` / `ceqCount>0` / `hasReview+reviewPlaybackId`). Paid sets never enter the free path.
- Unavailable stages are **not steps**: they never sit in the denominator, Continue never lands on them, and a student reaches 100% on what's actually published. When Lee publishes a video, the step simply appears on next load — no migration.
- Note on the spec's topic-level "Cram Blast / Review": the content model stores videos **per set** (DeckDef `blast` / `lookback` publications), so steps are per-set per-stage. A blast published on a topic's first set naturally leads that topic. Documented deviation, honest to the data.

## Step completion

- **practice_set** — completes the moment the results screen renders ("reached set completion state"); progress % and the rail ✓ update while the student is still looking at their results.
- **cram_video / review_video** — the existing HeroVideo ≥90%-watched completion event (`onComplete`). No fake completion invented.
- Stored locally per step (`sa-path-steps`, stable ids, survives reload). Signed-in students keep the existing per-**set** server rows (`student_set_progress`); per-**stage** granularity is local-only for now — documented, no schema change.

## Progress calculation

`Exam 1 · N%` + 3px bar under the identity header; tooltip `X of Y steps complete`. Only available steps count; jumping ahead never marks earlier topics; completing Closing Entries early records exactly that step.

## First-run flow (preserved + extended)

Choose school → the existing ~2s reveal (exact three lines: *Finding the easy points on your exam... / Prepping the hard stuff too... / Almost ready...*) → **PathStartCard**: `You're ready for Ole Miss · ACCY 201` · **[Start Exam 1 →]** · *Remind myself to study later →*. No Easy Points explainer.

**Intro-tour slot:** `INTRO_TOUR_PLAYBACK_ID` const beside `PathStartCard`. Null today → nothing renders (no Coming-Soon button). Set it to the tour's Mux playback id → a **Watch the quick tour** button appears above Start, playing in-pane, framed by the student's own school · course line. One generic video, campus-agnostic by design.

## Start / Continue behavior

- **Start Exam 1** → first unfinished step. Today that's Easy Points' first practice set ("Accounting cycle order") because no cram video is published; the moment one ships, Start lands on the cram instead. Never a Cram-vs-Practice-vs-Review decision for the student.
- **Continue** = one advance rule: next available step. Crossing a topic boundary with the topic finished → restrained **TopicCompleteCard** (`{Topic} complete ✓ · "Nice. You handled the stuff you really shouldn't miss." · Exam 1 · N% · Continue → {next topic}`). Past the last step at 100% → **ExamCompleteCard** (real counts: questions completed + topics; `Exam 2 is ready when you are.` → the Exam 2 tab, which shows its true state — waitlist or unlocked). Nothing invented about Exam 2 content.

## Auto-advance

- **Video end:** overlay `Up next: {step} · Starting in 5… [Start now] [Pause]` — counts down, advances; Pause stops it.
- **Practice results:** conservative — the results render untouched for ~3s, then one quiet line `Continuing in 5… [Continue now] [Stay here]`. Retry missed (which remounts the screen) or Stay cancels it. Never yanks a student off their results.
- Question-level answering/feedback untouched.

## Bottom navigator

Slim bar under the stage: `← Back` | `Next: Internal vs. external users →`. Labels from real path steps; hover/focus `title` carries tiny metadata (`Practice · 3 questions · ~5 min`). No sentences, no cards. Present on mobile (390px verified, no overflow); Back disabled at the first step.

## End of practice set

`You've been through 10 of 10 · 5 to review` + **[RETRY THE 5 YOU MISSED →]** + **[CONTINUE → INTERNAL VS. EXTERNAL USERS]**. Two primary actions only; Reset stays in the ••• menu.

## Left sidebar

- Heading (free tab): **EXAM 1 PATH** (paid tabs keep "What's on …?"). Visually tested — reads as "the things I'm moving through".
- Six topics, collapsed by default; the **current topic auto-expands** as the path moves (previous collapses). Manual clicks still preview without destroying path state.
- Done sets wear a green ✓ where ▶ was; counts stay muted/tertiary; topics bold, subtopics lighter (hierarchy preserved).
- **Tiny bolts removed** from the identity header and the Easy Points row (didn't render well at that scale). The bolt keeps its big moments: loading reveal, future tour control.

## Manual topic preview (compact)

Clicking another broad topic shows a short card: topic name · `Cram · 4 min` (only if it exists) · `Practice · 69 questions · ~45–60 min` · `Review · Coming soon` · **[Jump to this topic →]**. The old "What you'll do here…" block is gone. Jump enters that topic's first path step.

## ••• menu (simplified) + Reset intro

Exactly: `Save my progress · Reset questions · Change school · Choose professor (→ Change professor once picked) · Get help`. **No subtitles.** Get help = in-menu `Text Lee` (`sms:`) / `Email Lee` (`mailto:`), no paragraphs.

**Reset intro** (temporary test control): small circular-arrow icon beside •••, tooltip "Reset intro". Confirms once (it clears local practice progress), then clears **only**: `sa-landing-school`, `sa-landing-prof`, `sa-path-steps/-started/-pos`, `sa-prof-prompt`, `sa-syllabus-prompt`, `sa-practice-coverage`, `sa-resume`, `sa-two-set-ask`, `sa-cram-auto`, the `sa-practice-session` session id, and the `sa-school` / `sa-prof-skip` cookies — then reloads. **Never** touches the account, entitlements, purchases, curriculum, or server-side rows. On a campus URL the route re-asserts the school (by design — hard refresh keeps remembering for real students); the player still returns to the fresh Start card.

## School picker

The card under the welcome gate now has **one** alternate path — the picker's own `Don't see your school?` footer. The duplicate `My school isn't listed` line is removed. Write-in/skip behavior behind it unchanged.

## Prompts (preserved)

Professor prompt after ~5 answered questions (inline card, once, skippable — verified appearing on the results screen, never mid-question). Syllabus prompt only after a professor exists + ≥12 answers. No aggressive chaining.

## How Lee adds Cram / Review content (authoring contract)

A set's **Cram** = its shipped `blast` publication (`DeckDef.publications` via CEQ Studio's publish flow; legacy fallback `lesson_videos` by `lessonId`). A set's **Review** = its shipped `lookback` publication. Publish a blast on, e.g., Easy Points' first set → the path gains an `Easy Points → Cram` step, the Start button routes through it, the topic preview shows `Cram · 4:12`, and the denominator grows — zero code changes. The intro tour is the one exception: set `INTRO_TOUR_PLAYBACK_ID` in `landing.tsx`.

## Analytics (all in `SA_EVENTS`, existing `track()`)

`exam_path_started` · `path_step_started` · `path_step_completed` · `path_auto_advance_shown` · `path_auto_advanced` · `path_auto_advance_paused` · `path_back_clicked` · `path_next_clicked` · `topic_completed` · `exam_completed` · `retry_missed_clicked` · `intro_reset_clicked` — with campus/topic/set/step_type props where known.

## Tests / build

- `bunx tsc --noEmit` clean · `bun test` 1,689 tests, **1 pre-existing** failure (bolt-palette "distinct accents", fails on pristine main; owned by the bolt session) · `src/lib/exam-path.test.ts` 10 new tests all green.
- `bun run build` — clean (client + SSR + Nitro; needs `NODE_OPTIONS=--max-old-space-size=8192`).
- Live QA (headless Chrome @5262): fresh welcome (one alternate path) ✓ · start card ✓ (no tour button, no identity bolt, "Exam 1 Path" heading) ✓ · Start → Q1/10 + navigator + `Exam 1 · 0%` ✓ · results screen: `Exam 1 · 4%` + rail ✓ live ✓ · auto-advance strip after 3s, Stay here holds ✓ · Continue → next set, navigator label follows ✓ · manual preview compact with Coming-soon Review + Jump ✓ · menu labels-only ✓ · Reset intro → confirm → fresh start card ✓ · mobile 390px: navigator + no overflow ✓.

## Screenshots

`docs/screenshots/guided-path/`: 01 welcome · 02 start card · 03 guided active · 04 set complete (Retry/Continue + navigator) · 05 auto-advance · 06 next step · 07 manual preview · 08 menu · 09 after reset · 10 mobile · 11 live progress.

## Deferred

- Per-stage completion on the server (schema addition; local-only today).
- Video watch-position resume inside cram/review (completion only, per existing player behavior).
- "Remind me later" inside the syllabus-prompt decline (the mechanism exists via the Save flow; not chained per the no-funnel rule).
- Removing the Reset-intro control before public scale (it's deliberately shippable for now).
- Mobile path drawer as a dedicated sheet (current drawer works; nicety later).

---

GUIDED EXAM 1 PATH READY TO TEST: **YES**
