# Student player — simplification pass (branch `player-simplify`)

Trim the header to campus-only, remove Semester Pass and coverage from the player, and surface
Save my progress in the two places the student naturally reaches for it.

## Removed
* **Semester Pass** — the line + bracket + `SEMESTER_PASS_PRICE`/`SemesterPassLine` deleted from
  the player. Coverage/`passRequest` still available if we resurface it later at checkout.
* **Coverage UI** — `~80% covered` line, tiny bar, tooltip and the professor-vs-course variants
  deleted from `PlayerIdentity`. The underlying data (`campus_exams.coverage_pct`, the resolver
  `level`) is untouched — the other systems that read it keep working; this is presentation only.
* **Save my progress from the header** — the persistent pill (and its `✓ Saved` twin) are gone
  from `PlayerIdentity`. Nothing to save until the student has answered a question.
* **Post-set "Nice — save this…" invitation** — deleted; the two contextual entry points below
  replace it.
* **`showAsk`/`askDone`/`sa-two-set-ask`** — the whole flow is gone; the localStorage key is now
  orphaned and can be reclaimed later.

## Save my progress — the two contextual entry points
* **Chip beside Q#** — a small orange `🔖 SAVE` chip appears in the PracticeStage header once the
  student has answered ≥ 1 question in the session (`Object.keys(pickedBy).length >= 1`).
  Signed-in students see a green `✓ SAVED` mark instead. Opens the same `SaveProgressDialog`.
* **Q navigator footer** — under `SET PROGRESS · N of M answered`, a `Save my progress →` link
  (signed-out only), so the moment the student is literally looking at their progress they can
  save it. Kept small; the number grid stays the star.

Both are surfaces on `PracticeStage` and share the one dialog. Nothing auto-opens.

## Overflow menu
Signed out: **Save my progress** (new, top of menu) · Reset questions · Match/Change professor
· Change school. Signed in: Save is omitted (autosave handles it); the rest is unchanged.

## Save dialog copy
Shorter — heading **Save your progress**, one-liner body *"Pick up right where you left off next
time."*, primary **Email me a sign-in link**, secondary **Keep studying without saving**. Long
"You can keep studying for free…" paragraph gone (the secondary CTA already says it).

## No-block law
Still: Exam 1 works signed out, without a professor, and without Save. Nothing auto-pops.

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,423 pass · `bun run build` OK · screenshots in
`docs/screenshots/player-simplify/`.

# Student player — campus identity, no professor gate, Save my progress (branch `player-identity`)

The player should feel immediately usable AND obviously built for this student's campus/course.
Professor matching is personalisation, never a gate. The large hero bolt / campus rotation belongs
to the concurrent bolt session and is untouched here.

## No-gate professor behaviour
`flowDone = userPicked || ((school || notListed) && profDone)` in `ExamPlayer`. A click on any
topic/set (`pickSet`) sets `userPicked` and content opens at once — the invitation panel
(`MatchPanel`) returns null whenever content is showing. This holds on the generic page too
(no school → the Starter Map serves Exam 1). `userPicked` is an explicit flag, NOT `selById`
presence: the existing school-pick effect pre-fills the default live set, and a default must not
silently skip the invitation. The professor stage is now "Match your professor — Match ACCY 201
to your professor's exam — or pick any topic to start right now." with Skip; the rail stays
interactive beside it. Nothing in the flow asks for an account or an email to start.

## Identity header (`PlayerIdentity`, replaces `SidebarContext`)
Static campus bolt (the same `Bolt` + `boltFor` palette the Poster and picker use — no shared
bolt files touched) at 44px desktop / 32px mobile · `Ole Miss · ACCY 201` · `Prof. Aghazadeh` or
`+ Match my professor` (`+ Pick my school` when there is no school) · coverage line + 4px bar with
a tooltip · `Save my progress` · `•••`. Mobile gets a one-row compact variant above the topic
switcher (58px) so identity, Save and the menu stay in view; the sidebar copy lives in the drawer.

## Coverage data source
`campus_exams.coverage_pct` (migration 0109) — **Lee's editable estimate per campus exam, default
80, not computed.** Label: `{Last} Exam 1 · ~80% covered` ONLY when the professor's own map served
the exam rows (`resolveStudentMap().level === "professor"`), else `Course coverage · ~80%`.
Tooltip says exactly that ("Lee's estimate from the syllabus, not a computed score"). A write-in
professor has no map, so the line stays course-level — no fabricated professor coverage.

## ••• menu (replaces "Start over")
* **Reset questions** — `resetSeq` bumps → the SetFlowPanel key changes → practice remounts at Q1.
  Touches nothing persisted (practice_attempts is an append-only log; `student_set_progress`
  stays), so no confirmation is needed; the hint says "Saved progress stays." Disabled until a set
  is open.
* **Change / Match professor** — clears the professor + skip cookie, re-shows the invitation;
  school/course untouched; the next topic click skips it again.
* **Change school** — generic page: the existing school-change flow (picker returns); campus or
  Greek route: the page cannot become another campus, so it forgets the stored campus and
  navigates to `/#exam1`. Route precedence (route → session → stored → picker) is unchanged.

## Save my progress
Secondary pill under coverage (desktop) / `Save` in the mobile strip. Signed out → `SaveProgressDialog`
(`components/site/SaveProgress.tsx`): email → `supabase.auth.signInWithOtp` (magic link, the same
session `/learn` uses via the new shared `lib/use-student-auth.ts`), redirect back to the page the
student was on (`/<school>#exam1`), "Keep studying without saving" always available. A
**resume context** (school slug, course, professor, exam, topic, set, stage) is written to
localStorage `sa-resume` and to the auth user's metadata (`sa_resume`); on return, once a session
exists, it is consumed once and the player reopens at that exam/topic/set. Signed in → the pill
becomes `✓ Saved` (title: signed in as …, saves automatically) and the player writes
`student_set_progress` (`in_progress` on set open, `complete` on cram complete — the rows `/learn`
reads; `complete` never downgrades) and `practice_attempts` carry `user_id`.
**Not persisted (no model yet):** per-question answers inside a set; the in-session navigator
state is client-only. **Stubbed/assumed:** the Supabase redirect allow-list must include
`https://surviveaccounting.com/**` for the per-campus return path — if it doesn't, the link
falls back to the site URL and the localStorage resume still restores exam/topic/set on `/`.

## Semester Pass
Both states now sit ABOVE the exam tabs. Expanded: one line with a 44px ×; collapsed (remembered):
an 18px bracket capping Exam 2 · Exam 3 · Final (columns 2–4 of the same 4-column grid as the
tabs), `SEMESTER PASS · $150`, clickable → the notify modal. Hidden on Greek pages as before.

## Checks

## Fold: TwoSetAsk → SaveProgressDialog (08-21)

The old "Nice — save your progress and get told when Exam 2 lands?" inline card (TwoSetAsk +
`submitExamAsk` source `two_set_ask`) is deleted. After one **completed set** — cram-video end OR
practice DONE, driven by SetFlowPanel's new `onSetComplete` (fires once per set-id) — a single
dismissible line appears under the stage: **"Nice — save this so you can pick up where you left
off." → "Save my progress →"** opens the same `SaveProgressDialog` the header pill uses. Never for
Greek pages and never for a signed-in student (their set progress is already saving). The `sa-two-
set-ask` dismissal key survives; `submitExamAsk` is unreferenced by the player now.
`bunx tsc --noEmit` clean · `bun test` 1,419 pass · `bun run build` OK · eslint: no new findings.
Screenshots in `docs/screenshots/player-identity/`.

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
