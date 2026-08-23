# Rubric v2 — navigable, zoomable, progressive-reveal (branch `exhibit-lab-v2`)

The probe/quiz flow had made itself the core interaction. It is demoted, not deleted: the rubric
is the screen. Filming-side only; no student-facing exhibit UI ships.

## 1. Probes demoted to a drawer (§1)

`RubricExhibit.tsx` is now a thin FILMING WRAPPER. The Probe Library, the ask-first step panel and
the chip tray live in a **collapsible drawer, closed by default** (the `PROBES` tab on the right
edge). Nothing was deleted — every probe, scenario and grading path is intact and one click away;
Lee runs the questions verbally on camera.

- `ExhibitLab.tsx` extracts `ProbeControls` (scenario picker + library) and hands it to the exhibit
  as `labControls`, so there is exactly **one** probe surface, never two. The Cycle keeps it in the
  rail (it has no drawer).
- **The keyboard has one owner at a time.** `StepPanel` owns `registerKeyTarget`, and it only mounts
  while the drawer is open — so a closed drawer automatically hands `1–9 · S · ← → · \`` back to the
  rubric. The exhibit's handler also bails on `if (drawerRef.current) return;` for the shared keys.

## 2. The board (§2) — `RubricBoard.tsx` + `rubric-view.ts`

`A = L + E | Revs & Exps`, centre stage, with two things under **every** element, always:

- the one-word definition — `OWN · OWE · VALUE · EARNED · COSTS`;
- a **mini T-account with the signs inside it**, replacing the floating `(+/−)` glyphs. Left column
  is DEBIT, right is CREDIT; the `+` side is the normal balance and renders bolt-orange while the
  `−` is muted. No labels — the T teaches the sign and the normal balance silently.

**The sign table is derived from one source of truth** (`acctType().increase`, the same model the
probes grade against) and asserted **verbatim** in the tests, because a backwards normal balance
would be fatal:

| element | left | right | normal |
|---|---|---|---|
| Assets | + | − | debit |
| Liabilities | − | + | credit |
| Equity | − | + | credit |
| Revenues | − | + | credit |
| Expenses | + | − | debit |

## 3. Zoom navigation (§3)

Click any element (or press `1`–`5`) → a GPU-composited zoom into that element: big header
(`ASSETS` with `OWN` beside it), its T-account at 1.5×, and its **account list from the starter COA
in COA order**. Each chip is modeled as a NODE — `{ id: "coa:A:cash", element, label }`, emitted as
`data-node-id` / `data-element` — so drag-to-journal-entry is additive later. Drag is **not** built.

A slim **breadcrumb rail** pins the whole mini-rubric at the top while zoomed: click an element to
jump laterally, click the rail to zoom out (`Esc` does the same).

**Motion law:** all three layers (full rubric · rail · zoom panel) stay **mounted** and animate on
`opacity` + `transform` only — no remount, no reflow, no bounce. The zoom panel keeps painting the
*last* element through its fade-out, so a lateral jump never blanks mid-transition.

## 4. Statements layer (§4)

Toggled by the `statements` button or key `6`: `BALANCE SHEET` under `A = L + E`, `INCOME STATEMENT`
under `Revs & Exps`, and a bridge **icon** + `R/E` at the divider (full name in the tooltip only —
text diet). It also shows under the header while zoomed.

## 5. Progressive reveal (§5)

The 2022 clicker style, stepped with the film keys: **Tab** next, **Shift+Tab** back, **`** resets
to blank. Seven authored steps — blank → `A = L + E` → defs → T-accounts → divider + `Revs & Exps`
→ their defs + Ts → statements layer (only if toggled ahead of time). One reveal per keypress, 150ms
fades. `reveal = null` is FREE MODE: the fully navigable exhibit.

## 6. Filming the frame — PRESENT mode

The Lab gained **P = present**: every affordance disappears (`.sa-present [data-lab-chrome]`), the
stage fills the window at a locked aspect (`fill · 16:9 · 9:16`), and the only way back is a button
that stays invisible until the mouse finds it. The board reflows for vertical: 9:16 **stacks** the
two universes rather than shrinking one line of glyphs into illegibility.

**Bug found by driving it, not by reading it:** entering present mode used to render the stage under
a *different parent*, which remounted the exhibit and silently wiped the reveal step, zoom and
statements Lee had just set up. The stage now holds **one position in the tree** and present only
restyles its container; pinned by a test asserting `{stage}` appears exactly once.

## 7. Ships to students later (§6)

`RubricBoard` is **controlled and dependency-light** — its entire import list is `react`, one font
constant, and the pure model (asserted as a whole list in the tests, so a prose mention of
`film-lock` can neither pass nor fail it). No probe module, no film-lock, no canvas card. The
filming keys live in the wrapper.

**Parked deliberately:** drag-to-journal-entry, probe automation, scenario chips on the rubric.

## Not done (flagged, not silently skipped)

The reveal runs in the Lab's PRESENT mode at both aspects, which is a clean OBS window-capture
target. Wiring the Rubric into the **canvas node registry** — so it appears inside the *canvas*
capture window / Recording Mode alongside CEQ frames — is a separate pass: it touches `types.ts`,
the node-type map and scene-JSON round-tripping, which is authoring-surface work this prompt did
not ask for.

## Verification

- 1436 tests pass (49 in the Lab file, incl. the verbatim sign table, the seven reveal steps, COA
  node ids/order, and the source pins above); `tsc --noEmit` clean.
- Screenshots in `docs/screenshots/rubric-v2/`: reveal 1 (blank) · 2 · 4 · 7 + statements · zoomed
  Assets · breadcrumb jump to Equity · present 16:9 · present 9:16.
- The continuous OBS demo take is Lee's to record — every state in it is captured above.

---

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

# Student player: Reset/context, Q navigator, Cram·Practice·Review, one notify, Semester Pass (branch `player-reset-nav`)

Two focused UX/state passes on the student Exam/CEQ player. Marketing footer and authoring
tools untouched.

## 1. Reset respects route context (`src/routes/landing.tsx`)
Precedence inside the player: **route-provided school/chapter → this session's pick → stored
last-used → generic picker.** Route context is immutable: a stored campus never outranks a URL
campus (campus-context already resolved url above stored; the player now keeps it through Reset).
- `routeLocked = campusSlug || goChapter || greekOrg`. On a locked route the button reads
  **Start over** and resets only the session: professor + the professor-skip cookie are cleared,
  topic/set selection, open topics and the practice session (`resetSeq` in the SetFlowPanel key)
  are dropped, school/course/chapter stay. Next state: "Pick your professor to start" with
  "Skip for now →". No navigation home, no school picker.
- On the generic homepage the button reads **Reset** and still returns to school selection.
- Note: picking a school on the homepage navigates to `/<school>` (existing), so a wrong pick
  lands on a locked page. The explicit exit is the new **Not your school?** link under the
  professor step (`changeSchool` → forget stored campus → generic picker). That is a navigation,
  never a Reset.
- Professor persistence inspected, unchanged: localStorage `sa-landing-prof` + `sa-prof-skip`
  cookie (both in `src/lib/campus-prefs.ts`).

## 2. `Q1 / 8` is a navigator (`src/components/site/PracticeStage.tsx`, shared with /learn)
The chip is a button (`aria-haspopup="dialog"`, `aria-expanded`) opening `QuestionNav`: a tile
per question — unattempted (neutral), correct (green + check), incorrect (red + ×), current
outlined in gold independently of state; each tile is labelled "Question 3, correct[, current]";
`done of N answered`; Escape / outside-click / × close it. Click any tile to jump (non-linear; a
retry pass widens back to the full set if you jump outside the missed subset).
**Answers persist**: `pickedBy` remembers the locked-in choice per question, so Q3 → Q7 → Q3
shows Q3's result — no wipe, no silent resubmit (this also fixes the old back-arrow re-answer).
Statuses come from the session's latest attempt; grading untouched.

## 3. Cram / Practice / Review pills (`src/components/site/StagePills.tsx`, new)
Always-visible, compact stage control in the set strip: `SET n OF m · [⚡Cram] [☑Practice]
[↺Review]`. Availability is **derived from the content model** (`set-flow.ts` inputs): Cram =
`playbackId`, Practice = `ceqCount > 0`, Review = `hasReview` — no new flags, nothing hardcoded;
a published video un-mutes its pill automatically. Unavailable stages stay visible and clickable
at 62% with `· SOON` and a dashed ring. Mode colours are semantic only: Cram `#006BA6`, Practice
`#FFA611`, Review `#8B7FC7` (violet exists nowhere else). The redundant PRACTICE status pill in
the question header is dropped on this surface (`statusLabel=""`). Phones: the three pills wrap
to their own row (26px tall, one row of three).

## 4. ONE notify interaction (`src/lib/notify-request.ts`, new)
Every "tell me when it's ready" builds a `NotifyReq` (`want: cram|review|exam|pass` + exam,
topic, set, headline/sub) and opens the single `NotifyModal` (bottom sheet on phones). Copy:
"Cram Blast for The Accounting Cycle is coming soon. Want me to tell you when it lands?",
"Review for this set is coming soon…", "Exam 2 is still being filmed. Opens Fall 2026…", plus a
context line (school · course · professor · exam). `submitNotify` now carries `want`, `examNum`,
`courseCode`, `note` ("wants:cram · exam:Exam 1 · topic:… · set:…") into the unified intake
(`runIntake`, kind `notify_exam`, source_path `/#notify:cram`).
**Removed**: `PaidNotifyRow` (the permanent email form in the sidebar AND the Poster) and its
`joinPricingWaitlist` path in the player. Switching to Exam 2/3/Final just browses (topics,
runtimes, "Opens Fall 2026"); the Poster shows one **Notify me when it's ready →** button; a
locked set row opens the modal with that set as context.

## 5. Semester Pass: line → bracket
Expanded (first visit): "Save with the Semester Pass — Exams 2, 3 + Final for $150." with a
44px always-visible ×. Dismissed (remembered in localStorage `sa-pass-line-dismissed`, the
existing key): an 18px bracket under Exam 2 → Exam 3 → Final labelled `Semester Pass · $150`,
clickable → the same modal. Never a banner again; tabs unobstructed at 390px.

## Content-model note
Availability is fully derivable for free sets. For **paid** sets `playbackId`/`reviewPlaybackId`
are withheld server-side (entitlement), so Cram/Review availability cannot be read client-side
for them — today they never reach the stage (locked rows open the notify), so nothing is wrong,
but if paid sets ever render pills the server must send boolean `hasCram`/`hasReview` instead of
ids. Also: no Exam 2+ topic currently has sets on the Ole Miss map, so the locked-set → notify
path was verified by code, the Poster CTA path by browser.

## Shared persistence the marketing code should use
`src/lib/campus-prefs.ts` — `rememberCampus` / `readStoredCampus` / `rememberProfSkip` /
`readStoredProfSkip` + the `sa-school` cookie; `useCampus()` (`campus-context.tsx`) for
`setSessionSchool` / `clearSchool`. Marketing components were not edited here.

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,360 pass · `bun run build` OK · eslint: no new
findings (baseline prettier/autocrlf noise only). Screenshots: `docs/screenshots/player-reset-nav/`.
