# PLAYER V2 — "TONIGHT'S PLAN" BETA — REPORT

**Date:** 2026-08-27 · **Branch:** `feature/player-v2-tonights-plan` (worktree `sa-homepage-two-door`, dev config `homepage-two-door-dev` → localhost:8093)
**Status:** PREVIEW/BETA ONLY — pushed to the feature branch, NOT merged to main. The public
Exam 1 experience remains the September 1 waitlist.

---

## Preview routes

| Route | What it is |
|---|---|
| `/preview/home` | **Repointed (this task):** now renders the LIVE two-door homepage with one change — the STUDY ON YOUR OWN door links into `/preview/exam1` instead of opening the public waitlist. The old two-portal experiment page it replaced is deleted. noindex, unlinked. |
| `/preview/exam1` | **NEW:** Private Player V2. Full-screen plan builder → Tonight's Plan → the REAL guided player walking the plan-filtered path. noindex, unlinked from all public nav. |

Public "/" verified untouched: the solo door is still a button opening the "Exam 1 · FREE ·
SEPTEMBER 1" waitlist modal; Exams 2/3/Final keep their $50 waitlist states inside the player on
campus pages. No public link reaches Player V2.

## The onboarding states (all built + browser-verified)

- **A · CHOOSE YOUR SCHOOL** — only when campus is unknown (shared campus-context resolution).
  Existing `SearchPicker` over the canonical school table; "Skip for now →" uses the existing
  SKIPPED sentinel. A known campus skips this screen silently (no "already matched" banter).
- **Lee intro slot** — a quiet banner (portrait + "I'll build you a path…") atop the mode
  screen. `PLAYER_V2_INTRO_PLAYBACK_ID` const is the future video slot; null renders no video UI.
- **B · HOW DO YOU WANT TO STUDY?** — three square cards (Cram / Practice / Full Review) with the
  cumulative stage list (● Cram / ● Cram ● Practice / all three) that ILLUMINATES on hover/focus
  of its card. Estimates are computed from the real published content. Nothing preselected;
  "I'll choose as I go →" is a quiet link, not a fourth card.
- **C · WHAT ARE YOU AIMING FOR?** — Just Pass / Solid B / Go for an A, with "I'll prioritize
  your plan around this." — prioritization framing, never a grade promise.
- **D · YOUR EXAM 1 PLAN** — identity (e.g. `PRACTICE · SOLID B`), `Estimated time ~2 hr 50 min`,
  the compact topic map with plan indicators only (`Practice ✓` etc. — no question counts), the
  **TAKE IT TO AN A** teaser (real step count + `+ ~50 min`, one click adopts goal A), the
  optional syllabus ask, and **Start my plan →**.
- **E · ACTIVE PLAYER** — the real guided player with the V2 plan strip:
  `Exam 1 · 18% · [bar] · PRACTICE · SOLID B · ~1 hr 50 min left · Go deeper on this topic →`.
  The identity is clickable (change plan). No "6 topics · 280 questions" anywhere prominent.
- **F · TOPIC COMPLETE** — `{Topic} complete ✓ · Exam 1 · N% · [Continue in Practice mode →]`
  plus `Go deeper on this topic →` only when depth is actually addable.
- **G · GO DEEPER sheet** — `Your plan: Practice · Add for this topic: + Practice (+ ~15 min) /
  + Full Review · Coming soon`; adding shows `Practice added to {Topic} ✓ · New estimate:
  ~1 hr 50 min remaining` and the strip's time updates live.
- **H · CHANGE PLAN sheet** — mode + goal radios (Full Review disabled `· Coming soon`), live
  `Estimated remaining` for the tentative selection, `Update my plan`, and the line "Completed
  work always stays complete."

## Architecture — Player V2 EVOLVES Guided Path V1 (no rebuild)

**Everything V1 built is reused untouched:** `buildPath`, Back/Next navigator, per-stage
completion (`sa-path-steps`), practice/video stage handling, sidebar/map behavior, resume,
topic completion, Reset intro, auto-advance.

The whole integration is the **`plannerV2` bridge** — the same experimental-slot pattern
`portalHome` used. `src/routes/landing.tsx` gained seven small, labeled seams (all inert on live
routes, where the prop is absent):

1. `LandingProps.plannerV2?: PlannerV2Bridge` (type-only import — V2 code never enters the live bundle).
2. `pathSteps = plannerV2 ? plannerV2.filterSteps(rawPathSteps) : rawPathSteps` — **the one
   filter**; Continue/Back/progress/resume/completion all walk the plan automatically.
3. Plan strip render slot above the player split.
4. Topic-complete interstitial swap.
5. `map_browsed` hook in topic preview.
6. Off-plan-position guard in `continuePath` (resume to first unfinished instead of step 0).
7. `topicDoneCard` carries the completed topic's key.

New module `src/components/player-v2/`:
- `plan-model.ts` — pure: plan state (`sa-v2-plan`), mode→stages, preview tiers, the plan
  filter, time estimates, A-teaser, depth options. **16 unit tests green.**
- `planner-config.ts` — the ISOLATED preview planning layer (see below).
- `PlanBuilder.tsx` — overlay states A–D. `PlanHud.tsx` — strip/sheets/topic-complete/beta
  panel. `PlayerV2.tsx` — composition + bridge + reload-on-start.

**Why reload-on-start:** plan, campus, and path-started are all persisted local-first, so
reloading lets the player boot through its normal returning-student path. Zero new start
mechanics in production code.

## Temporary priority/config strategy (REAL vs PREVIEW)

**REAL:** topics, sets, questions, availability (steps exist only for published content), the
plan filter mechanics, completion, progress, time arithmetic, analytics.

**PREVIEW-ONLY** (all inside `planner-config.ts`, nothing touches canonical curriculum or DB):
- Tier heuristics: "Easy Points" topic → `easy`; everything else `core`; in a core topic with
  ≥3 practice sets, the LAST practice step previews as `b_to_a` (in place, never moved out of
  its topic).
- "Just Pass" trim: core topics keep cram + FIRST practice step.
- Fallback video durations (4 min cram / 6 min review) when no runtime is published.

**Future data migration for Easy/Core/B-to-A:** authoring adds a real `priorityTier` per set —
natural home is the DeckDef/CEQ-Studio publish metadata, delivered through `fetchStudentTree`
like `runtimeSec` is today. `SET_TIER_OVERRIDES` (by set id) exists NOW as the bridge: Lee can
pin real tiers there before any schema work. When the real field lands, `stepTier()` reads it
and the heuristics get deleted; nothing else changes.

## Mode / Goal / depth behavior

- Modes are cumulative (cram ⊂ practice ⊂ full_review); `choose_as_i_go` = the whole map, no
  restriction, no goal question, PathStartCard/map browsing as in V1.
- Goal A adds `b_to_a` steps; Just Pass additionally trims core practice. Go-deeper adds DEPTH
  (stages) for ONE topic and deliberately does NOT add A-material — that's the goal's job.
- **Completed work is permanent.** Changing mode/goal/depth only re-filters remaining steps;
  `sa-path-steps` is never rewritten (verified: 14 done steps survived a plan reset, and the
  payoff estimate for the new plan correctly shrank from ~2:50 to ~1:50).

## Time estimates (V1 engine)

Practice: 0.65–0.9 min/question (the same documented band the live player's tooltips use) —
displayed as the rounded midpoint with `~`. Videos: real `runtimeSec`, config fallback
otherwise. All display rounds to 5-minute humanity ("About 1 hr 45 min", "~58 min left").
Never labeled "average study time" — no observed-student data exists yet. Architecture note:
`stepMinutes/sumMinutes` are the single seam where real medians (later, personalized pace) plug in.

## Full Review — and an unplanned honesty finding

Full Review renders visibly but disabled (`Coming soon`) everywhere: mode card, change-plan
radio, go-deeper option. Nothing blocks Cram/Practice/topic/exam completion.

**Real-content finding:** no cram videos are currently published either, so the CRAM mode card
is ALSO honestly disabled ("Coming soon") — the beta effectively has one selectable mode
(PRACTICE) today. The moment Lee publishes blast videos, CRAM (and its estimate) un-disables
with zero code changes. Worth knowing before showing testers.

## Analytics (existing PostHog `track()`, new names in SA_EVENTS)

`player_v2_opened` · `study_mode_viewed/selected {mode}` · `goal_viewed/selected {goal}` ·
`plan_generated {mode, goal, estimated_minutes, included_step_count}` · `plan_started` ·
`plan_changed {from_mode, to_mode, from_goal, to_goal}` · `topic_depth_opened/added {topic,
added_depth, estimated_minutes_added}` · `syllabus_upload_clicked` · `map_browsed` — plus the
existing `syllabus_prompt_shown/skipped` reused on the payoff screen.

## Beta reset / testing (spec §37)

A floating **BETA** chip (bottom-left, preview route only) opens a panel with:
1. **Reset to fresh first run** — clears plan, path progress, school, prompts, coverage (the
   Reset-intro list + V2 keys); reloads. Never touches accounts/purchases/server rows.
2. **Reset plan only (keep completed work)** — re-runs the builder; done steps survive.
3. **Forget school + plan (keep completed work)** — tests the unknown-school first run.

Scenario coverage verified in-browser: unknown school (A) · known school (skips A) ·
Practice+B · Just Pass via change-plan · choose-as-I-go · returning progress (resume + kept
completion) · local go-deeper · plan changes. Cram+B / Cram+A are untestable until a cram video
publishes (mode disabled — see finding above).

## Syllabus personalization

Payoff-screen ask (`Want me to match this closer to your class?` / `Upload your syllabus →` /
`Not now`) reuses the existing `SyllabusModal` + `submitSyllabus` infrastructure end-to-end. No
new ingestion. No mention of matching machinery anywhere in the flow.

## QA / verification

- `bun test`: 1831 pass (16 new plan-model tests) — only the known pre-existing bolt-palette
  failure. `tsc --noEmit` clean. Production build clean; site-qa manifest updated
  (`preview_.exam1.tsx` registered, coverage test green).
- Browser QA (dev :8093) — every state A–H exercised via DOM automation; details above.
- **Screenshots: not capturable this session** — the browser pane was never visibly open, and
  screenshots require compositing (known limitation, documented in SESSION-CONTEXT §7). Every
  claim above was verified by DOM text/geometry instead. First human walkthrough doubles as
  visual sign-off.
- Bug found & fixed during QA: the builder originally rendered outside any CampusProvider, so
  the school step always appeared and picks didn't persist; the V2 composition now carries its
  own provider (storage-synced with the player's).

## QA — the ten product questions (§36)

1. Cram/Practice/Full-Review legible without explanation — the cumulative stage dots carry it. **Yes.**
2. Practice visibly contains Cram (dots + hover illumination). **Yes.**
3. Full Review honestly future — disabled with "Coming soon" in all three surfaces. **Yes.**
4. Goals framed as prioritization ("I'll prioritize your plan around this"). **Yes.**
5. Student sees TIME (~2 hr 50 min), never 280 questions. **Yes** (counts only in the sidebar's tiny footer line).
6. Startable with zero Survive knowledge — two questions, then Start. **Yes.**
7. Continue is the one obvious action (primary at topic end; navigator otherwise). **Yes.**
8. Go deeper present but quiet (strip link + topic-end secondary; only when addable). **Yes.**
9. Mind-changing loses nothing (verified with kept completion + shrunken estimates). **Yes.**
10. "Survive built tonight's plan for me" — the payoff screen is exactly that statement. **Believed yes — this is the #1 thing to ask testers.**

## Known limitations

- CRAM mode disabled until a blast video publishes (content, not code).
- Go-deeper has nothing to offer under Practice·B until review/cram content exists (all
  practice already in plan) — it works today under Just Pass (adds trimmed practice).
- The plan builder's estimates read the default starter map until the campus map resolves
  (~1s); numbers can tick once.
- Reload-on-start costs one navy beat between "Start my plan" and the player.
- Per-stage completion is still local-only (V1 limitation, unchanged).
- `/preview/exam1` inherits the standard site header (with public nav links) — acceptable for
  beta; a chromeless preview shell is a possible polish item.

## PLAYER_V2_FUTURE_IDEAS (explicitly deferred)

- Adaptive mastery engine ("5 correct in a row → skip"), diagnostic test-out.
- Performance-based mode switching; automatic weak-topic recommendations.
- Predictive grade models; personalized time from user behavior ("At your pace: …").
- Real empirical time modeling ("Typical study time: [median]").
- Professor-driven planning; campus-specific plan changes; syllabus-driven plan reshaping.
- Individual textbook chapter-number mapping ("Chapter 2 in your class" secondary context).
- Real Easy/Core/B-to-A authoring pass (end of Exam 1 content development) + `priorityTier` on
  deck publish metadata.
- Beta-feedback control with plan context payload (route/mode/goal/topic/step/progress/time) —
  no floating feedback control exists today, so this is documented for the next beta task
  rather than half-built.
- Lee intro video (slot ready: `PLAYER_V2_INTRO_PLAYBACK_ID`).
- Retiring `/preview/home` + `/preview/exam1` once V2 ships publicly.
