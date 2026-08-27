# "Who's It For?" — users + branches exhibit (branch `users-exhibit`)

Internal/external users + financial/managerial accounting as ONE mirrored exhibit — the WALL
divider is the mental model. New canvas element kind `users` (config-driven: content lives in
`users-exhibit-config.ts`, accuracy fixes are config edits, scene data stores geometry only).

- **Spotlight**: click any element → its whole side illuminates, the other mutes (0.32 +
  desaturate), clicked element brightest; chips also reveal their one-line want; single-select
  over the shared highlight store so ` and 0 clear it for free.
- **Shared reveal layer** (`exhibit-modes.ts` grew a REVEAL section): authored 4-state sequence
  (wall+headers → chips → serves+plates → mnemonics) on Tab/Shift+Tab, FILM SURFACES ONLY —
  authoring + student always render full, so ` can never strand a blank exhibit. Tab falls
  through to the walk at either end. D toggles the HOW THEY DIFFER strip (4 opposing pairs,
  pair-lighting; never part of the sequence).
- **Importance cues** (`exhibit-cues.tsx`, shared, first use): MUST KNOW / EASY POINT /
  A+ DETAIL corner tags, session-dismissible, deliberately NOT on the ` bus. Board of
  Directors carries the professor-variance A+ line.
- Registered in types/templates/stage-elements/canvas nodeTypes; `exhibit-demo` dev lab now
  mounts the card (wide + narrow) with film keys as the QA surface.
- Tests `users-exhibit.test.ts`: classification audit pinned, text diet, reveal shape, key
  precedence. Browser QA on /exhibit-demo: all interactions verified headless; screenshots
  unavailable unattended (pane not displayed — known limitation).

# Cycle modes — the Accounting Cycle exhibit's 3-CEQ mode switcher (branch `exhibit-lab-v2`)

SOURCE DOCS · DEFINITIONS · ORDER — the exhibit tunes itself to the three CEQ types Lee films for
this topic. Smallest viable version per the studio timebox; click-to-highlight untouched in every mode.

- **Shared layer** `exhibit-modes.tsx` — mode chip row (authoring chrome, never on camera) + a
  realm-shared module store (same pattern as the highlight clear bus, so authoring canvas, studio
  preview, and film surfaces stay on the same mode) + the ORDER orbit state. The cycle card
  *declares* `CYCLE_MODES`; nothing existing was refactored.
- **Config** `cycle-exhibit-config.ts` — authorable per-step `{docName, icon}` source docs and
  cram-version definitions, matched to authored step labels by ORDERED keyword rows
  (collision-audited: post-closing → post, unadjusted → adjusted, plain "Trial Balance" last).
  Also derives where END OF PERIOD begins (the first trial-balance step).
- **SOURCE DOCS / DEFINITIONS** — a film click still runs the highlight cycle exactly as before,
  PLUS a popover anchored just outside the clicked step (doc rows with lucide line icons, or the
  one-liner definition). Click again / click elsewhere / mode switch / ` closes it.
- **ORDER** — the boiling brand bolt orbits the oval step to step (~1s dwell; chord ≈ arc at 7–9
  steps, last→first chord is short so the loop wraps seamlessly). The current step lights with the
  shared glow merged into the same `ns` object — never written to the highlight store, and the
  tease-mode source pins stay byte-identical. Dotted DURING THE PERIOD / END OF PERIOD arcs sit
  outside the ring and hand off at the first TB step; no TB step ⇒ no arcs. GPU-composited: one
  transform transition on a full-size wrapper (translate-% = container-%).
- **Keys (binding audit)** — `M` cycles modes (was unbound in both keymaps; consumed only while a
  moded exhibit is mounted). In ORDER mode `Tab`/`Shift+Tab` step the bolt (a manual step pauses
  playback) and `P` plays/pauses — both checked BEFORE the Tab walk in BOTH the recording branch
  and the film-popout branch, so the walk keeps Tab everywhere else; Enter still walks. `` ` ``
  resets the bolt to step 1, paused, via the exhibit clear bus (`0` reaches it too — same bus).
- Tests `exhibit-modes.test.ts`: mode-cycle order, both cycle vocabularies (7-step template +
  9-step Lab labels) land on the right config entries, period-handoff indices, text diet, and
  key-precedence / film-safety source pins. Full canvas suite: 1222 pass, 0 fail.

Skipped per spec: vertical-specific work, extra modes, drag, probe revival.

# Ledger exhibits — Journal Entry · T-Accounts · Financial Statements (branch `exhibit-lab-v2`)

The three tools Lee remembered from earlier versions of the app, unearthed, rebuilt on the Lab's
current UX, and — the point — **wired to each other and to the rubric**. Filming-side first;
nothing student-facing ships.

## What was already there (the dig)

| Old asset | Verdict |
|---|---|
| `je-logic.ts` (413 lines, pure, tested) | The sophisticated part: sides, moves/hops, memos, `autoBalance`, `balanceState`, `blankFrom`. Still good — but coupled to the canvas card's node/dispatcher model. |
| `JeCardNode.tsx` (1,526 lines) | The heavy authoring card: guided/practice, answer key, reveal-correct, spotlight, `hidden` stepper, ???-until-valued amounts. Too much surface to drag into the Lab. |
| `TAccountCardNode` (in `OtherCards.tsx`, ~78 lines) | Thin: two stacked lists + a net balance. The `TAccountEntry.label` field already existed — the labelled-amount idea was right, the presentation wasn't. |
| `ScheduleCard` presets `incomestmt` / `balancesheet` | A generic table engine, not a statement that knows what it means. |

**Kept none of the components; kept the ideas.** The old cards stay exactly where they are, untouched
— this is a new Lab surface, not a migration.

## The connection that makes them one system

A rubric `Scenario.entry` (`Chip[]`) **already is a journal entry**. So one transaction bank drives
all three exhibits, and `ledger-model.ts` is the only new model:

```
RUBRIC  →  JOURNAL ENTRY  →  T-ACCOUNTS  →  STATEMENTS
(type)      (dr / cr)        (balances)     (where it lands)
```

Every account carries its rubric `AcctType`, so signs, normal balances and statement placement come
from `rubric-view` — the same source the probes grade against. Nothing is re-derived (pinned by a
test that greps the three components for hand-rolled side logic).

## 1. Journal Entry (`JournalEntryExhibit.tsx`)

- **One piece at a time**: description → each line's ACCOUNT → its AMOUNT. Unrevealed pieces print
  `???` — present, unreadable, obviously pending (Lee's "they're ??? or they're shown").
- **Spotlight**: click a line to light it and dim the rest.
- Switches: the rubric **type chip**, that type's **(+/−) pair**, the **Dr = Cr proof**, and
  **posting glyphs** showing which column each line lands in — the seed of the JE→T connection.
- `Tab` forward · `Shift+Tab` back · `` ` `` blank · `A` all · `7 8 9 0` switches.

## 2. T-Accounts (`TAccountExhibit.tsx`)

- **Staggered**: debits and credits interleave down the T in posting order, so the story reads in
  time instead of as two stacked columns.
- **Every amount is labelled** — "Beg. balance", the transaction that put it there, "End. balance".
  No unexplained numbers, asserted by a test over every row of every account.
- **`Tab` posts the next journal entry** into every account it touches at once; the rows that just
  landed flash gold, and balances count up *with* the story rather than jumping to the end.
- The ending balance sits under its own rule, on its own side, and the ledger proves itself with a
  **trial balance**.

## 3. Financial Statements (`StatementsExhibit.tsx`)

- Built from the same posted balances: **Income Statement → R/E bridge → Balance Sheet**, with
  arrows carrying net income across. The R/E panel sits between them because that is exactly what
  the rubric calls it.
- Reveal builds it in seven beats, ending on the **A = L + E tie-out**.

## Four defects found by looking at the pixels and the math

1. **The expense total printed ABOVE its own detail lines.** A total above the lines it sums reads
   as an error on camera. Detail first, then the total under its rule.
2. **`Dividends -0`.** Negative zero is not a number a statement may print.
3. **A net LOSS wore the success colour.** An exhibit that paints a loss green teaches the wrong
   reflex — a loss is now "NET LOSS" in the warning colour, panel border and bridge label included.
4. **An asset with a credit balance was reported as a positive asset**, silently breaking A = L + E.
   Caught by a test that runs *every* seeded scenario through the balance sheet alone: pay rent with
   no opening cash and Cash carries a credit balance. Statement rows are now **signed against the
   account's normal side**.

## Verification

- 1,478 tests pass (80 in the Lab file); `tsc --noEmit` clean.
- The accounting is tested, not eyeballed: every seeded entry balances, one account accumulates
  across transactions on the right sides, the trial balance ties, R/E = beginning + NI − dividends,
  dividends reduce equity without touching net income, and every scenario balances the sheet alone.
- Screenshots in `docs/screenshots/ledger-exhibits/`.

## Deliberately not built

Drag-to-journal-entry, probes on these three (the `exhibit + probe` reference shape is ready and
nothing is wired), student-facing routes, and the Formulas exhibit. The old canvas cards are
untouched.

---

# Rubric v3 — the full picture, on switches (branch `exhibit-lab-v2`)

The rubric is not one picture; it is a picture with switches. Each CEQ wants a different amount of
it on screen, so every piece now turns on and off independently and a **mode** is a named set of
switches for the question being taught.

## 1. The full picture (Lee's MEMORIZE! slide)

Turn `accounts` on and every type shows every account at once — the whole COA in one frame, which
is the picture for *"what is the normal balance of ___"*. Assets split **CURRENT / LONG TERM**
(the split is a seam index into the flat list, so the probes still narrow against one source of
truth), and long-term gains Vehicles · Buildings · Land.

**Contra accounts are called out** the way the slide calls them out: Accumulated Depreciation and
Dividends render bold with their **flipped** pair beside them in bolt-orange.

## 2. The signs moved ABOVE the rubric

`(+/−)` / `(−/+)` sit above each element — Lee's preferred spot — bigger, and **both glyphs share
one colour**. The coloured `+` is no longer decoration: it arrives only when the `normal` switch is
on, so lighting the normal balance is a deliberate teaching beat. The mini T-account survives as
its own switch (the debit-column/credit-column lesson), off by default.

## 3. Click a letter → that element opens in place

Clicking `A` (or pressing `1`) opens **that** element's definition + account list under it; the
others stay as they are. A switch opens them all at once. Opening any column claims the full width
for every column, so the equation never re-flows halfway through a build.

Zoom survives for a focused shot: **Shift+1–5**, breadcrumb rail, `Esc` to come back.

## 4. Movement arrows — ↑ ↓ ↑↓

With `arrows` on, a slot above each letter click-cycles **↑ → ↓ → ↑↓ → none**, for working a
transaction against `A = L + E` on camera. The slot holds its height whether or not a glyph is in
it, so clicking through never nudges the frame.

## 5. Teaching modes + the gear

A ⚙ in the corner (authoring chrome — never filmed) carries the modes and the individual switches:

| mode | the question it is for | switches |
|---|---|---|
| Types | "What TYPE of account is ___?" | defs · accounts |
| Debits / Credits | "Which side increases it?" | signs · T-accounts · defs |
| Normal balances | "What is the normal balance of ___?" | signs · **normal** · accounts |
| Statements | "Which statement does it land on?" | statements · defs |
| Movements | "A = L + E — what moves?" | arrows · signs |
| All | the playground | everything |

A mode is a **starting point, never a lock** — every switch stays adjustable after you pick one.

**Keys** (drawer closed): `Tab`/`Shift+Tab` reveal · `` ` `` blank · `Esc` close/zoom out ·
`1–5` open · `Shift+1–5` zoom · `6 7 8 9 0` statements/signs/defs/accounts/arrows · `N` normal ·
`T` T-accounts · `M` cycle mode. Digits are read by **code**, so `Shift+1` is still "the first
element", not `!`.

## 6. Layout law learned here

A switched-**off** piece renders nothing; a piece that is switched **on but not yet revealed**
keeps its space at opacity 0. Reserving space for everything (the v2 behaviour) pushed the frame
off-centre for pieces a lesson never shows; reserving space for nothing would make a `Tab` build
jump. Splitting the two is what keeps both the build and the framing still.

## Verification

- 1454 tests pass (62 in the Lab file: the asset partition, contra flips, movement cycle, every
  mode's switch set, and the source pins above); `tsc --noEmit` clean.
- Screenshots in `docs/screenshots/rubric-v3/`: default · full picture · normal balances · one
  column opened · movements.

---

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
