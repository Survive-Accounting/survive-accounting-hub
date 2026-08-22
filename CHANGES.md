# Exhibit Lab v2 — Cycle + Rubric, Probe Library, The Survive Method (branch `exhibit-lab-v2`)

Filming-side only. No student-facing exhibit UI ships. T-Accounts, JE grid, F/S and Formulas
exhibits are untouched. The canvas CycleNode card is untouched (the Lab's Cycle keeps its own
copy of the oval geometry on purpose).

## 1. Canvas audit — REMOVAL LIST (proposed; NOTHING DELETED, Lee approves each line)

Structural fact: the canvas ships TWO chromes. `chromeV1` (`study_.canvas.tsx` ~1471, localStorage
`sa-canvas-chrome`) is reachable only via File ▸ "View archive: Dashboard v1". Most "orphans" below
are really v1-archive-only. Ranked safest first; line counts approximate.

| # | Candidate | Lines | Why it looks dead | Risk |
|---|---|---|---|---|
| 1 | `canvas/PipelinePlayer.tsx` | 96 | zero importers; superseded by `PipelineStage` (`pipeline-view.test.ts:16`) | none |
| 2 | `canvas/RecorderSpike.tsx` | 133 | zero importers; self-described "EXPERIMENT ONLY, not wired" | none |
| 3 | `canvas/SurviveBackdrop.tsx` + `canvas/hub-layout.ts` | 174 | backdrop has zero importers; hub-layout imported only by it | low |
| 4 | `canvas/GhostCellsLayer.tsx` | 72 | zero importers — but `docs/CANVAS-ROADMAP.md:302` calls it SHIPPED; may be a silently-unmounted feature, not dead code | **medium — confirm first** |
| 5 | `canvas/clip-thumb.ts` | 42 | zero importers, zero mentions | none |
| 6 | `canvas/cue-log.ts` (+test) | 178 | test-only — but roadmap still WANTS cue-log capture during film | **keep (parked)** |
| 7 | `canvas/snake-layout.ts` (+test) | 131 | roadmap: "retired from the region scaffold"; `outline-snake.ts` is the live one | none |
| 8 | dead import `ClipTrimStrip` in `CeqStudio.tsx:29` | 1 | imported, never rendered | drop the import only — two tests read the file by name |
| 9 | spotlight index-cursor model `spotlight.ts:80-122` | 45 | already proposed in UI-AUDIT (B6); test-only | none |
| 10 | `worldSeed` + "Seed ↻" no-op (`FrameNode.tsx`, `types.ts`) | ~10 | confirmed no-op (UI-AUDIT B2/D8) | none |
| 11 | `sa-ctrl` ctrl-drag marquee (`study_.canvas.tsx`, `ArrowEdge.tsx`) | ~20 | live prop is `selectionKeyCode={["Shift"]}` (UI-AUDIT D9) | none |
| 12 | the whole v1 archive chrome (`study_.canvas.tsx` 6203-6233, 6319, 6322-6737) + `BrandBar`, `Palette`, `LegendHud`, `LessonNavigator`, `PipelineTestPanel`, `LessonGridView`, `VisualMixPanel`, `StoryboardPanel` | ~1,800 | only reachable via the v1 archive | **a DECISION, not a cleanup** — Palette/Deck/Storyboard/Script/CueSheet/settings have no v2 home yet |

Keep-but-consolidate (two of everything): cut-player executors (`use-cut-player` vs `StitchPreview`'s copy);
trim UIs (`ClipTrimStrip` ⊂ `TrimDetail`); previewers (`CeqSetPreviewer` → outline spine + filmstrip);
publish pipelines (frame/Mux `publish-pipeline.ts`+`lesson-publish`+`frame-takes` vs the stitch path —
only the second has a v2 entry point); takes systems (Mux take board vs FS inbox); Film V1 vs V2 branches
in `CeqPreviewer` (declared an experiment — pick the winner); three keymap mechanisms (register the
film/studio keys so `?` stops lying); two highlight systems (retire the two LEGACY aliases in
`exhibit-highlights.ts`); three script surfaces on one `frame.script`.

Exhibit Lab zone: shipped as its own route `/exhibit-lab` (navbar "⚗ Exhibit Lab", next to Pipeline).
Mounting it INSIDE the rebuilt canvas waits on the v1/v2 decision above.

## 2. Probe schema

`src/components/canvas/exhibit-lab/probes.ts` — `Probe { id: ProbeId; name; ask; student }`, ten seeded
with STABLE ids: `four_questions · rewind · fast_forward · statement_check · year_end_cross ·
accrual_or_deferral · date_check · what_if_we_dont · show_me_the_math · flip_it`. Exhibits registry:
`cycle · rubric` only (deferred exhibits deliberately not registered).

Run machine `probe-run.ts` — `RunStepDef { id; prompt; kind: choice|text|sign|order|confirm; options?;
explain; data?; optional? }`, `ProbeRun { ref; steps; cursor; done }`. THE LAW is structural:
`reveal(run)` is the ONLY door to `explain` and returns null until the step has a resolution
(attempt or explicit skip); `next()` refuses to advance an unresolved step; the first answer stands;
per-run toggles (`setStepEnabled`) only reach OPTIONAL steps ahead of the cursor.

## 3. The exhibit + probe reference shape (addressable now, consumed by nothing)

```ts
interface ExhibitProbeRef { exhibit: "cycle" | "rubric"; probe: ProbeId; stepsOff?: string[]; seed?: Record<string, string|number|boolean> }
refKey(ref) === "rubric:four_questions"   // parseRefKey round-trips; JSON-plain so it can ride in scene JSON later
```
The Lab's filming queue is the only reader. CEQs/Frames are NOT wired to it this pass.

## 4. Seams (record, no consumers)

- `probe_attempts` — `migration/supabase-migrations/20260822_0900_probe_attempts.sql` (manual-apply, NOT
  applied by this branch). Writer: `src/lib/probe.functions.ts` `logProbeAttempts` (service role, fail-soft)
  fed by the local-first queue in `exhibit-lab/probe-attempts.ts`. `is_test` defaults ON in the Lab. No read path.
- `CeqChoice.misconception_tag?: string` in `types.ts` — additive, scene JSON only, nothing consumes it.
- Session 3 note: no student-read shape changed; `misconception_tag` is optional on choices.

## 5. Canon

`SURVIVE-METHOD.md` at the repo root, seeded verbatim from the spec. Lee edits from there.

---

# CEQ Practice — cram mode, navigation & release (branch `ceq-practice`)

Releases the authored Exam 1 CEQs to students before the videos. Built on `notifications` (for
the `question` intake) with `set-architecture` merged in (the Cram → Practice → Review model). The
cram-video slot stays in the shell as a **Cram Blast · coming soon** strip, so publishing a set's
video fills it with no layout change.

## 0. Pre-flight data — DONE on the live DB (2026-08-21)

**Scene dedupe (launch blocker) — fixed in code, not by editing data.** Every set existed in the
30-set workspace scene (`f103b5cd`, 08-14) and in its own per-set scene (edited 08-19/20). One
shared loader (`loadDecksDeduped` in `student.functions.ts`) now serves the tree, practice, and
playback: **per-set scenes (exactly one card deck) own their deck first, then newest `updated_at`**
— so even if the workspace scene is touched later and becomes "newest", the per-set copy still
wins, and a deck's cards are read only from its winning scene. The workspace scene was never
written to (a write there could have flipped ownership). Verified: 30 unique decks, 0 duplicates
served.

**Flipped live (`flip_exam1_live.ts --apply`, writes only to per-set scenes):** 19 Exam 1 sets →
`status=live`, 6 missing `sortOrder` values filled by name order, the 5 untitled/0-question
library stubs parked. **Exam 1 unit seeded**: `exam_units` "Exam 1" (Intro 1) with Ch 1, 2, 3, 6,
7, 8, 9 → `/learn` groups under it; the homepage uses the Starter Map either way.

**Final counts per topic (authoritative per-set scenes):**

| Ch | Topic | Sets | Questions |
|---|---|---|---|
| 1 | The Accounting Cycle | 1 | **8** |
| 2 | Analyzing Transactions | 2 | 48 |
| 3 | Recording Journal Entries | 3 | 60 |
| 6 | Trial Balances | 1 | 11 |
| 7 | Adjusting Entries | 4 | 32 |
| 8 | Financial Statements | 4 | 29 |
| 9 | Closing Entries | 4 | 18 |
| | **Total** | **19** | **206** |

**206, not 210:** the stale workspace copy of the Accounting Cycle set had 12 questions; the
authoritative per-set scene (edited 08-20) has 8. Either you cut four on purpose or they exist
only in the workspace — check `f103b5cd` if you want them back. Excluded from release: Ch 4
Receivables (8 Qs), Ch 5 Posting (24 Qs), Ch 10 Principles (14 Qs) — authored but not Exam 1
topics, left `draft`; the 5 stubs (parked, no topic/0 questions). Note the **Ole Miss campus
map** maps only Ch 1–3 to Exam 1, so that campus page shows `3 topics · 6 sets · 116 questions`;
the default/Starter Map shows all seven.

## Reference scheme
`Topic.Set.Question` (e.g. `3.2.14`), displayed in the stage as `3.2 · Q14 / 24` with the
question's shorthand as subtitle; set titles are the base stem. Numbers are derived at read
time from `chapter_number` + `sortOrder` + `stageOrder`; **analytics key on the stable deck id +
CEQ node id** (`fetchSetPractice` now returns node ids, not positions). The full reference is
prefilled into "Ask me about this one" and carried on the lead (`topic` = reference,
`source_path` = `ceq:<setId>:<ceqId>`).

## Navigation (homepage/campus/Greek player)
Rail: `3 Recording Journal Entries · 3 sets` → expands to `3.2 What is the journal entry… · 24
questions` with a thin **coverage** bar (questions attempted, never accuracy; localStorage,
updated live). Clicking a set enters cram at Q1. Variations never appear in the rail. Footer stat
is computed: `7 topics · 19 sets · 206 questions` (`~Xh video` appends only when runtimes exist).
Mobile: the rail collapses to the existing topic bar + drawer; the stage header carries
`1.1 · Q1 / 8`. `/learn` uses the identical cram component inside its set modal (no redesign,
per the earlier instruction to hold `/learn` until the HTML player).

## Cram mode (`src/components/site/PracticeStage.tsx`, shared)
Desktop: `↑/↓` highlight, `⏎` lock-in → green/red resolve with the filming-side sfx (`confirm` /
`vinylScratch`), `⏎` advances, `←/→` step (skips logged), `Shift+→` next set; hint strip in the
header; ~120 ms in-place swap; optional auto-advance after a **correct** answer only (toggle,
off by default, persisted). Mobile: tap row to lock in, fixed thumb-reachable **Next →**, swipe
left/right, 48 px rows; verified at 390×844 — no horizontal scroll, Next in viewport.
Feedback: correct highlighted, wrong pick struck; `Lee works this one in the review video —
coming soon.`; **Ask me about this one →** opens a box prefilled with the reference + shorthand →
`kind=question` through the unified intake (priority founder alert, student confirmation
"Got your question on 3.2.14"). Progress, not scores: no %, grade, or score anywhere; end of set
shows `You've been through 24 of 24 · 8 to review` + elapsed, primary **Retry the 8 you missed →**
(missed questions come back as pass 2+), then `Next set →` / `Review with Lee →` when it exists.
Rough-pass copy: "First pass is always rough — that's the point. Run the missed ones again."

## Analytics — `practice_attempts` (migration `20260821_1400`, applied)
`set_id, ceq_id, event (answer|skip|abandon), choice_id, correct, ms (reveal→lock-in),
attempt_number, session_id, user_id (nullable), campus, surface (home|campus|greek|learn),
is_test, created_at`. Written per event via `logPracticeEvents` (no auth; Exam 1 is ungated);
abandon = last question reached, written on unmount. **Admin:** `/outreach/practice` — per
question: attempts, % missed, median time, skips, quit-here, asks; sortable; filter. Asks are
highlighted — this is the filming priority queue. My test rows were deleted after verification.

## Access
Exam 1 practice is free and ungated on solo/campus pages (the school → professor gate stays,
the Greek member gate on `/go/` stays — both sit before the stage). Paid exams stay locked behind
the existing notify box (paid sets never carry questions or ids to the client).

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,360 pass · `bun run build` OK. Screenshots in
`docs/screenshots/ceq-practice/`: rail expanded · cram mid-question (desktop) · resolution with
the ask box · end-of-set with retry · mobile cram at 390 (+ resolved/Next) · admin analytics.
