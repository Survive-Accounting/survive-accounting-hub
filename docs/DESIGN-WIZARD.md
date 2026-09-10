# Design — the wizard: brainstorm → slides → split → film → keep → post as one flow

Written 2026-09-09 against `film/free-camera-pinned-ceq` at `749f1189` (which is also
`origin/main`). Every `file:line` below was read at that commit; re-check a line before you edit
near it, because this tree moves daily. Design only — this document changes no code.

This is the design for P13. It is written for a session that has never seen this repo: read
§0, then build §8 in order. It does NOT fold the Talkthrough Booth into the Editor, and it says
why (§3.2). It does not design the OBS keep-loop, the hopper or site publishing (P10, P11 — see
`docs/` for those when they exist); it stops at "the pop-out is open on the right split and the
Editor knows it."

---

## 0. Read first

- `CLAUDE.md` — additive only, fail loud, never weaken a test, migrations listed under SQL LEE
  MUST RUN and never auto-run. This package needs no migration (§7).
- `docs/SESSION-CONTEXT.md` §2 — migration naming (`YYYYMMDD_HHMM_…`, never sequential).
- The five step routes under `src/routes/v3.$topic.$set.blast-off.*.tsx` and the bar that names
  them, `src/components/v3/StepBar.tsx:43-61` (`STEPS`: talkthrough · results · film · post ·
  improve — labelled Brainstorm · Editor · Rehearse & Film · Cross-post · Iterate).
- `src/components/v3/use-bank.ts:108-117` — `BlastOffStep` and `blastOffPath`, the one place
  the nested URL is spelled. `"post"` special-cases to `/v3/post`.
- `src/components/blastoff/plan.ts` — the plan. `BlastFrame.skipped` (`:93`), `cutAfter`
  (`:120`), `takeName` (`:123`), `cutAfterFrame` (`:395-404`), `planTakes` (`:427-441`),
  `takeLabel` (`:444`), `filmFrames` (`:591`).
- `src/components/blastoff/capture/prompter-sync.ts` — the cross-window contract. Read the
  header (`:1-27`) and `popoutTake`/`previewIndex`/`usePopoutTake` (`:213-249`) before touching
  anything that talks between windows.
- `src/components/blastoff/capture/popout.ts` — how the 9:16 pop-out opens itself (`:73-111`).

Tests run with `bun test` (~300 ms). Eight test files read source files as text and assert on
substrings; the ones this package can trip are listed in §9.3. Never weaken them.

---

## 1. The goal, in Lee's words

The line Lee wants is one motion per set: talk it through, get the suggested slides placed,
tidy the draft, cut it into shorts, film each short from where he is standing, keep the good
take, post. His own sentences, as they sit in the code today:

- "edit five videos at once and then push them to filming and then film five back to back."
  (`src/components/blastoff/SplitPanel.tsx:12-13`)
- "It should just have suggested slides and put them IN THEIR PLACE already." / "I mentioned I
  wanted a cheat code HERE. In between this and this." (`src/routes/v3.$topic.$set.blast-off.suggestions.tsx:99-100`,
  `src/components/blastoff/idea-to-slide.ts:106-108`)
- "The editor page is for AFTER we've reviewed. So create a new route to go to, then land back on
  editor when we're actually a bit closer to filming." (`suggestions.tsx:3-8`)
- "Talkthrough is just talking. Review is seeing the filming draft as it stands and adding new
  slides, editing current ones, removing, rearranging — just getting it SOLID before I do the
  film run." (`src/routes/v3.$topic.$set.blast-off.results.tsx:4-6`)
- "if we make splits, just in post it could maybe say split 1, split 2… I'll name it what I
  need to. I'd also like to name it from the edit side." (`plan.ts:407-409`)
- "would be a huge help if I could collapse a split group." (`src/components/blastoff/ReviewDeck.tsx:563-564`)
- "I am planning to pop out the capture window and be looking at that when I'm recording live…
  but the /film window is still open and has the slides right there too." (`prompter-sync.ts:14-19`)
- "steps one through five existing up there in the top hidden… make sure the split card doesn't
  get hidden." (`StepBar.tsx:63-66`)

Lee's note to the 2026-09-09 audit named the flow as "brainstorm → slides → split → film → keep
→ post" and asked for it to feel like one thing. The audit's finding (its §13): about 70% of it
exists, mis-arranged. This document is the arrangement.

---

## 2. What exists today (cited)

### 2.1 The steps and their doors

| step | URL | what is there | door forward |
|---|---|---|---|
| menu | `/v3/$topic/$set/blast-off` | five `Door`s repeating the StepBar (`blast-off.index.tsx:81-93`) + a read-only `FilmPreflight` (`:106-145`) | click a door |
| 1 Brainstorm | `…/talkthrough` | the Booth on this set (`blast-off.talkthrough.tsx:83-97`); PreFlight `onGo` ends the session, queues the review, and navigates to the NEXT set's Brainstorm (`:104-117`) | the GenerationDock's "Review" link → Suggestions (`src/components/talkthrough/GenerationDock.tsx:134-140`) |
| (unnumbered) Suggestions | `…/suggestions` | `SessionView` at full width + "Build the draft" (`suggestions.tsx:103-123`, `:158-164`) | "To the Editor" (`:142-146`, `:208-211`) |
| 2 Editor | `…/results` | `ReviewDeck` (`results.tsx:107`), the SAME `SessionView` folded in a `<details>` under the whole deck (`:109-149`), and `SplitPanel` toggled from the bar (`:97-105`) | the StepBar's Step 3 pill — the only link to film anywhere on the page |
| 3 Rehearse & Film | `…/film` | `BlastOffCapture` full screen (`blast-off.film.tsx:45-51`); `validateSearch` accepts only `?popout=1` (`:25-27`); Escape exits to the MENU (`:46`, `BlastOffCapture.tsx:488`) | none |
| 4 Cross-post | `/v3/post` | one row per take, keyed `<setId>` for the first and `<setId>#N` after (`v3.post.tsx:131-138`); PostProduction and the CaptionSheet take that key (`PostProduction.tsx:66-68`, `v3.post.tsx:512-515`) | the row's "→ Film / → Editor" resume link (`v3.post.tsx:490-498`) |

`/arrange` is the pattern for a retired step: a `beforeLoad` redirect into results
(`blast-off.arrange.tsx:10-16`).

### 2.2 The builder already exists

`buildDraftFromIdeas(frames, ideas)` (`idea-to-slide.ts:110-114`) places every open board idea
after the card Lee was on when he stamped it (`afterFrameForCeq`, `:97-104`; the anchor is
`BoardItem.ceqIds[0]`, written by the booth). It is pure and unit-tested
(`idea-to-slide.test.ts:124`). The Suggestions page calls it by reading the stored plan, building,
saving, then navigating to the Editor (`suggestions.tsx:107-117`). The Editor's own board only
offers single "＋ slide" through `DeckApi.addSlide` (`ReviewDeck.tsx:121`, `results.tsx:70-75`),
which inserts after the SELECTED slide (`insertAfter(null, …)`, `ReviewDeck.tsx:572-580`), not at
the anchor.

### 2.3 The split already reaches Post

A cut is a mark on a frame (`cutAfter`, `plan.ts:120`); marking one inserts an outro and the
standard opener (`cutAfterFrame`, `:395-404`; `standardOpener`, `:380-386`). The run between two
cuts is a `PlanTake` with a name on its head frame (`:415-441`). The Editor's spine draws a header
per run with a fold and a rename (`ReviewDeck.tsx:1108-1134`); Post draws one row per run
(`v3.post.tsx:131-138`), computing the runs server-side over the NON-skipped frames
(`src/lib/blastoff.functions.ts:79-97`, the skip at `:93`). Nothing on the Editor or on `/film` knows which run is
being filmed.

### 2.4 Cross-window sync already works

The pop-out publishes `sa-film-active` `{ setId, qId, at, popout, countdown, count, shot }`
every frame change and every 2 s (`prompter-sync.ts:32-61`, `:117-130`); the main `/film` window
reads it with `usePopoutTake` (`:238-249`) and shows the NEXT slide. The main window writes
nothing while a pop-out record is fresh (`paused: take !== null`, `BlastOffCapture.tsx:428`;
`prompter-sync.ts:120-121`). F4 rides `sa-film-roll` the same way (`:147-197`). `usePopoutTake`
is mounted in exactly one place, `BlastOffCapture.tsx:129`.

### 2.5 The pop-out opens itself

`useCapturePopout().open` does `window.open(popoutHref(window.location.href), POPOUT_NAME,
POPOUT_FEATURES)` (`popout.ts:102-108`); `POPOUT_NAME = "sa-film-popout"` and `POPOUT_FEATURES`
are exported (`:30-31`) and pinned (`popout.test.ts:28-32`). `popoutHref` keeps every other
search param (`:50-54`, pinned `:12-16`). The film route declares `popout` so TanStack keeps it on
a cold load (`blast-off.film.tsx:25-27`, pinned `popout.test.ts:23-27`).

### 2.6 Two things are called Split

- The in-plan cut (§2.3): the scissors in the gap between two spine rows
  (`ReviewDeck.tsx:1136`, `cutAfter` at `:766`). This is the split Lee means.
- `SplitPanel` (`src/components/blastoff/SplitPanel.tsx`): cuts a SET into sibling sets through
  `splitSet` (`src/lib/split-set.functions.ts`), writes `deck.splitFrom` / `splitInto`
  (`:113`, `:136`) which nothing reads back, and navigates away to the topic page (`SplitPanel.tsx:87`).
  It is the StepBar's `right` slot on the Editor (`results.tsx:97-103`), labelled "Split", and
  Lee asked that it never be hidden (`StepBar.tsx:63-66`, `:75-77`).

### 2.7 The Booth owns a lifecycle the Editor must not inherit

The V3 Brainstorm route creates a session the moment it mounts (`blast-off.talkthrough.tsx:60-63`);
`Booth` builds a `TalkthroughRecorder` per session (`src/components/talkthrough/Booth.tsx:238-242`)
and stops the mic on unmount (`:260`). The Editor, meanwhile, reloads the whole page when a card
is cloned (`ReviewDeck.tsx:788-789`) and holds a debounced plan save (`BlastOffEditor.tsx:56-78`).

---

## 3. The decision

The Editor becomes the home of the flow. Everything that used to be its own landing (the menu,
Suggestions) becomes a redirect into it; everything that leaves it (film) comes back to it. The
board rides on the Editor as a collapsible left panel with the builder in its header. The split
header on the spine gets the film door. The film surface learns which split it is filming. The
Editor learns which split is being filmed, read-only.

```
Brainstorm --End session--> (next set's Brainstorm, unchanged)
     |                              GenerationDock "Review" --> /results?board=1
     v
Editor  = [ Board panel | spine | slide | editor/illustrator ]
           header: Build the draft · N in place         split header: Film this split
                                                               |
                                                               v  window.open(.../film?take=N&popout=1)
                                                        9:16 pop-out (sole writer of sa-film-active)
                                                               |
                                        Editor spine shows "filming Split 2 · 4/11", live row lit
                                                               |
                                                     Escape closes the pop-out
Post (/v3/post) -- one row per split already; "-> Film" carries ?take=N
```

### 3.1 Why the Editor is the home

- It is where the hour goes (`StepBar.tsx:66`), and it already owns the plan, the selection, the
  folds and the rename. Every other step is a visit.
- The plan has ONE writer while the Editor is mounted: `usePlan.commit` with a 500 ms debounce
  and a flush on unmount (`BlastOffEditor.tsx:61-78`). Any surface that wants to change the draft
  while the Editor is open must go through the deck (§4.3), or its write is overwritten by the
  next flush (`saveBlastPlan` is a whole-plan replace — `blastoff.functions.ts:103-105`).

### 3.2 Why Brainstorm stays its own page — and is not folded into the Editor

Reject folding the Booth into the Editor. Three concrete reasons:

1. **The mic.** `Booth` starts a recorder per session and stops it on unmount
   (`Booth.tsx:238-242`, `:260`). The Editor calls `window.location.reload()` on clone
   (`ReviewDeck.tsx:789`). One clone during a live brainstorm would kill the recording.
2. **The session lifecycle.** The Brainstorm route creates a session on mount when the set has no
   open one (`blast-off.talkthrough.tsx:60-63`), and PreFlight ends it, queues generation and
   navigates onward (`:104-117`). Those are page-level effects with their own settled/booted
   guards; hosting them inside a panel that can be folded and unfolded invites double sessions.
3. **Space.** The Editor is three equal columns at 1440 px (`ReviewDeck.tsx:998`,
   `src/components/v3/Shell.tsx:65,117`). The Booth is its own three-column surface. Together
   they do not fit; neither works as a drawer.

Brainstorm is a door you walk through, then leave. The bridge back is the GenerationDock's link
(§5.6), which already exists.

### 3.3 Why Suggestions dies as a page

It was created on 2026-09-08 because the board was invisible on the Editor (folded under the
deck — `suggestions.tsx:9-13`). Once the board is a panel with the builder in its header, the
page is a second copy of the same component with a worse door forward. Keep the URL as a redirect
(§5.6) so the dock's link, bookmarks and the `BlastOffStep` union keep working.

### 3.4 Why SplitPanel is demoted, not deleted

The in-plan cut gives Lee the film outcome he asked for without moving cards between scenes. But
`splitSet` still does two things the cut does not: give each piece its own Brainstorm session and
board, and its own row on `/v3`. Until Lee has filmed a few cut plans and not reached for the
knife, keep it — renamed so the two Splits stop sharing a word — and watch for `deck.splitFrom`
rows appearing. Retire it after that, not before.

### 3.5 What "keep" means in this document

Nothing. The keep/try-again/scratch decision after a take is P10's design (OBS record-stop →
TakeDecision → hopper). This flow ends with the pop-out open on the right split; P10 starts there.
Do not pre-build a placeholder for it (§10).

---

## 4. Data model — additive, exact names, where each lives

There is no database change. Everything new is URL state, one browser preference, and two
component contracts.

### 4.1 URL search params

| route | param | type | meaning |
|---|---|---|---|
| `/v3/$topic/$set/blast-off/results` | `board` | `1` (present or absent) | open the board panel on load. Declared in `validateSearch` beside the existing `frame` (`results.tsx:33`). |
| `/v3/$topic/$set/blast-off/results` | `frame` | string | exists today — the slide to select (`results.tsx:31-33`). |
| `/v3/$topic/$set/blast-off/film` | `take` | positive integer, **1-based** | which split to film. `take=N` is Post's row `<setId>#N` (`v3.post.tsx:136`); `take=1` is the row keyed by the set id alone. Absent = the whole running order, exactly as today. Declared beside `popout` (`blast-off.film.tsx:25-27`). |
| `/v3/$topic/$set/blast-off/film` | `popout` | `1` | exists today. |

The take index is computed over `planTakes(filmFrames(plan.frames))` — the non-skipped list —
never over `plan.frames`. That is what `listBlastPlanSetIds` does (`blastoff.functions.ts:92-97`)
and what the spine's group numbering does (`ReviewDeck.tsx:1095`, over `activeRows`). The live
account-classification plan has a cut mark sitting on a skipped outro; computed over all frames
its take numbers would not match Post's.

### 4.2 Browser preference (localStorage, per browser, cosmetic)

| key | values | default | idiom to copy |
|---|---|---|---|
| `sa-editor-board` | `"open"` \| `"closed"` | closed | `FOLD_KEY` in `StepBar.tsx:68-71,82-83` — read after mount, write on toggle, try/catch both ways |

`?board=1` wins over the preference for that load and does not change it. Existing keys are
untouched: `sa-stepbar-folded`, `sa-review-right-tab` (`ReviewDeck.tsx:331`),
`sa-review-strip-view` (`:364`), `sa-v3-topbar` (`Shell.tsx:43`), `sa-film-active`, `sa-film-roll`.

### 4.3 Component contracts

`DeckApi` (`ReviewDeck.tsx:121`) grows two verbs. The existing one is unchanged.

```ts
export interface DeckApi {
  addSlide: (kind: BlastFrameKind, patch: Partial<BlastFrame>) => void;   // unchanged
  /** One idea, placed at its anchor (afterFrameForCeq), selected and scrolled to. */
  addIdea: (idea: BoardIdea & { anchorCeqId?: string | null }) => void;
  /** Every idea not already on the draft (bankItemId), placed at its anchor in one commit.
   *  Returns how many were added; 0 means "everything here is already on the draft". */
  buildDraft: (ideas: readonly (BoardIdea & { anchorCeqId?: string | null })[]) => number;
}
```

Both are implemented inside `ReviewDeck` with the pure functions that already exist
(`addSlideFromIdea`, `afterFrameForCeq`, `buildDraftFromIdeas` — `idea-to-slide.ts:81-114`) over
`plan.frames`, committed through the deck's own `commit`. The new slide's id is found by diffing
ids before/after (no change to `idea-to-slide.ts`'s signatures — its tests stay as they are). The
dedupe is extracted as one pure helper so it can be tested without React:

```ts
// idea-to-slide.ts
/** The ideas that are not on the draft yet — a frame carrying the idea's bankItemId means it is. */
export function freshIdeas<T extends { itemId: string }>(frames: readonly BlastFrame[], ideas: readonly T[]): T[]
```

`SessionView` (`src/components/talkthrough/SessionView.tsx:82-87`) gains `compact?: boolean`
(§5.2.3). `/talkthrough` (`src/routes/talkthrough.tsx:158`) passes nothing and is unchanged.

`BlastOffCapture` (`BlastOffCapture.tsx:100-105`) gains `take?: number` (1-based, from the
route). `usePopoutTake` is mounted in `ReviewDeck` as a reader (§5.5) — it is a hook with no
writer side, so there is no new contract; the contract is the rule that the Editor never writes.

### 4.4 Plan JSON

Nothing new on `BlastFrame`. This package reads `skipped`, `cutAfter`, `takeName`, `bankItemId`
(`plan.ts:87-123`). Do not add a `takeId`, a `filmedAt` or a `liveTake` to the plan — the first
two are P10's, the third is transient and lives in `sa-film-active`.

### 4.5 Rows

`set_publish_status` keys (`<setId>`, `<setId>#N`) are untouched. No table is added.

---

## 5. The UI, surface by surface

### 5.1 The menu becomes a redirect (P8)

`src/routes/v3.$topic.$set.blast-off.index.tsx` → a `beforeLoad` redirect to
`/v3/$topic/$set/blast-off/results` with `replace: true`, byte-for-byte the shape of
`blast-off.arrange.tsx:12-16`. Delete the component, `Door` usage, `STEP_ICON` and
`FilmPreflight`. `src/components/blastoff/film-summary.ts` stays (pure, tested, no other importer
today — leave it; the six stats can re-home on Iterate later).

Consequences to carry in the same slice:

- `/film`'s Escape goes to the Editor directly: `blastOffPath(topic, set, "results")` at
  `blast-off.film.tsx:46` — no redirect hop while Lee is bouncing between the two.
- The "Blast Off" crumb that pointed at the menu is dropped from the four step routes
  (`results.tsx:81`, `blast-off.talkthrough.tsx:69`, `blast-off.film.tsx:41`,
  `blast-off.improve.tsx:34`). The StepBar is the way between steps; a crumb to the Editor from
  the Editor is noise.
- `v3.post.tsx:492-498`: when `info.next === "post"` the link falls back to
  `blastOffPath(topic, set)`, which now redirects to the Editor. That is the right landing; change
  the label from "Open set" to "Editor" so it does not lie.
- `production-time.test.ts:14` and `production-run.test.ts:258` pin that the menu path parses to
  `null`. They test pure path functions and stay green; do not "fix" them.

### 5.2 The Editor

#### 5.2.1 Layout

`results.tsx` renders, under the StepBar:

```
[ board panel (when open) 400 px ][ ReviewDeck — its three columns, unchanged ]
```

A two-column grid at the route level: `gridTemplateColumns: open ? "400px minmax(0,1fr)" :
"minmax(0,1fr)"`, `gap: 18`, `alignItems: "start"`. `V3Shell wide` stays at 1440 px
(`Shell.tsx:65`); with the panel open the deck's three columns get ~340 px each, which is fine
for the first ten minutes of an Editor visit and is why the panel folds. Do not add a wider shell
mode; do not make the panel a full-screen overlay (Lee: contained detail views, never full-screen).

The panel is sticky (`position: sticky; top: 12px; maxHeight: calc(100vh - 24px); overflowY:
auto`) like the middle stage (`ReviewDeck.tsx:1185`), so it stays beside a long spine.

#### 5.2.2 The panel header

Left to right:

1. The set label and session meta (what `SessionView` already draws, `SessionView.tsx:167-172`).
2. **Build the draft.** Keep the label text from `suggestions.tsx:162` verbatim, including its
   leading glyph and the `· N in place` count, where N = `freshIdeas(...).length`. Disabled with
   a title when N is 0. On press: `deck.current.buildDraft(fresh)` → the deck commits, selects the
   first placed slide and scrolls to it; the panel shows "N slides placed" for a few seconds and
   stays open. Zero placed shows the sentence from `suggestions.tsx:114` verbatim.
3. The session picker when there is more than one session (`suggestions.tsx:180-195`). Pick the
   FULLEST session by default, not the newest — the rule at `suggestions.tsx:63-67` was the fix
   for the "92 suggestions" bug; `results.tsx:59-61` still uses newest. Adopt the Suggestions rule.
4. Close (folds the panel; writes `sa-editor-board = "closed"`).

The "Generate review / Regenerate review" button, the QUEUED / GENERATING pill and the cost line
stay where `SessionView` draws them (`:188-207`) — Lee will often land here while the board is
still filling (`reviewStateOf`, `generationProgressOf`, `:104-108`).

#### 5.2.3 `SessionView compact`

When `compact` is true:

- No `maxWidth: 1200` on the root (`:165`).
- The header hides "Open film mode →" (`:176-178` — it opens the study canvas via the old
  handoff, `src/components/canvas/FilmPicks.tsx:46-49`; nothing in V3 films there, see
  `src/components/blastoff/FilmHandoff.ts:8-11`), the "Teleprompter" pop-out button (`:179-186`
  — the rehearsal rounds on `/film` replaced it, `StepBar.tsx:28-29`) and `AttachTake` (`:187` — the
  B8 one-take path writes a signed Mux asset as a `draft` publication, a dead end on the student
  side). Leave all three exactly as they are for the non-compact `/talkthrough` mount.
- `FilmPicksTray` (`:224`) is not rendered — it is the canvas film-pick tray, not V3.
- The verbatim transcript column (`:227-245`, fixed 460 px) becomes a closed `<details>` under
  the board, full width. Moments and quick notes go inside it.
- `ReviewBoardV2` (`:249-255`) is unchanged; it is fluid.

#### 5.2.4 "＋ slide" from the panel lands at the anchor

Today the Editor's board inserts after the selected slide (`results.tsx:70-75` → `DeckApi.addSlide`
→ `insertAfter(null, …)` `ReviewDeck.tsx:572-580`), while Suggestions inserted at the idea's anchor
(`suggestions.tsx:81-97`). Two rules for one gesture is a bug. The route's `addSlide` callback
becomes: look the idea up on the session board by `itemId` (`sessionBoard(tt.doc, session.id)`),
take `ceqIds[0]` as the anchor, and call `deck.current.addIdea({ kind, text, itemId, title,
anchorCeqId })`. Drop the `window.scrollTo({ top: 0 })` at `results.tsx:74` — the deck selects and
scrolls to the new slide. `frameForIdea` is no longer imported by the route.

#### 5.2.5 The StepBar's right slot on the Editor

`[ Board · N ] [ Split into sets… ]`

- **Board · N** toggles the panel. N is the fresh-idea count (the nudge is the number, not a
  modal). Gold border when open, muted when closed — the exact style pair already used for the
  Split button (`results.tsx:98-102`).
- **Split into sets…** is `SplitPanel`, renamed and demoted: muted text, no fill, `title="Move
  cards into sibling sets — not the in-plan cut (the scissors between two slides)"`. The
  over-the-ceiling hint (`liveCount > 12`) stays. The panel's own heading (`SplitPanel.tsx:103`)
  becomes "Split into sets".

It stays in the `right` slot because that slot survives the fold (`StepBar.tsx:75-77`), which is
what Lee asked for.

#### 5.2.6 The film door on the split header (P1)

On every split header (`ReviewDeck.tsx:1108-1134`), after the name button: a small gold
**Film this split** button. When the plan has no cuts there is no header (`cutCount > 0` gates
it, `:1108`), so the same button sits on the "Film draft" header line (`:1002-1006`) — the whole
set is split 1. The button:

```ts
// capture/popout.ts — pure, tested
export function filmPopoutHref(filmPath: string, take: number | null): string
//   filmPopoutHref("/v3/t/s/blast-off/film", 2) === "/v3/t/s/blast-off/film?take=2&popout=1"
//   filmPopoutHref("/v3/t/s/blast-off/film", null) === "/v3/t/s/blast-off/film?popout=1"
export function openFilmPopout(href: string): Window | null   // window.open(href, POPOUT_NAME, POPOUT_FEATURES); focus; null when blocked
```

called from the click handler only (popup blockers), with `blastOffPath(topic, set, "film")` as
the path and `groupNo + 1` as the take. `null` from `openFilmPopout` shows `POPOUT_BLOCKED`
(`popout.ts:32`) inline beside the button. The window name is `POPOUT_NAME`, so a second press on
any split refocuses the one pop-out and navigates it, which is the behaviour Lee has in the main
window today (`popout.ts:100-101`).

A secondary "in this window" link (`<Link to=… search={{ take }}>`) is optional; the Step 3 pill
still opens `/film` for the whole set in-page.

### 5.3 `/film` learns its split (P2)

`blast-off.film.tsx`:

- `validateSearch` returns `{ popout?: 1; take?: number }`; `take` is kept only when it parses to
  a positive integer. Keep the substrings `popout?: 1` and `popout: 1` intact — `popout.test.ts:23-27`
  pins them.
- pass `take` to `BlastOffCapture`.

`BlastOffCapture.tsx`, all inside the component:

- A pure range: `capture/take-range.ts` — `takeRange(frames: readonly BlastFrame[], take: number):
  { start: number; end: number; index: number; label: string; count: number } | null`, where
  `frames` is the already-filtered `filmFrames` list (`:121`), `start..end` are inclusive indexes
  into it, `index` is 0-based, `label` is `takeLabel(planTakes(frames)[index])`, `count` is the
  number of takes. `null` when `take` is out of range.
- Out of range is loud: the same full-screen note pattern as `:528` ("Split N is not in this
  running order — N takes exist") with the Escape hint. No silent fallback to the whole set.
- `[i, setI] = useState(0)` (`:107`) → seeded to `range.start` once the plan is in (a ref guard,
  because `plan` arrives async).
- Space forward clamps to `range.end`, Shift+Space to `range.start` (`:473-474`). `roll()`
  (`:396`) and the countdown's `onStart` (`:397`) go to `range.start`, not 0. `isOpenFrame`
  (`:408`) is `idx === range.start` — after a cut the head of a run is the opener's intro
  (`plan.ts:382`), so the BoltZoom assembly lands on it exactly as on slide 1 of a whole set.
- The main window's "— end —" (`atEnd`, `:132`) is `previewIdx > range.end` when a range is set.
  `previewIndex` itself is untouched: the pop-out publishes node ids, and both windows resolve
  them against the same full list.
- Chrome label (main window only, beside the slide counter): `Split 2 of 5 · Liabilities`.
- Escape in the pop-out closes the window (`window.close()` works for a script-opened window);
  Escape in the main window still calls `onExit` (`:488`), which now lands on the Editor (§5.1).
  Update the "esc" line in `capture/HotkeysModal.tsx:21` and add one line: "filming a split:
  space stops at its last slide". No test pins the modal's text.
- `popoutHref(window.location.href)` (`popout.ts:50-54`) already keeps `take`, so the main
  window's own pop-out button carries the split along without a change.

F4 semantics are untouched. The roll still jumps to the head of the split; the F4-mid-take fix
(audit §7) is a separate item and must not be mixed into this slice.

### 5.4 Post: one line

`v3.post.tsx:492-498`: when `info.next === "film"`, the resume link carries
`search={{ take: r.takeIndex + 1 }}` so "→ Rehearse & Film" from a split's row opens that split.
Nothing else on Post changes in this package.

### 5.5 The Editor knows what is being filmed (read-only)

Mount `usePopoutTake(set.id, true)` in `ReviewDeck`. It re-renders the deck only when the
pop-out's `{ qId, countdown, count }` changes (`sameTake`, `prompter-sync.ts:232`), not on the
2 s heartbeat, because `popoutTake` drops `at` (`:213-218`). During the 10 s count that is ten
renders; otherwise one per slide.

A pure helper, `src/components/blastoff/live-take.ts`:

```ts
export interface LiveRow { frameId: string; takeIndex: number; pos: number; len: number }
/** Which spine row the pop-out is on, and where in its split. `frames` is the FULL plan
 *  (skipped included — ids resolve against it, as previewIndex does); takes are computed over
 *  filmFrames(frames) so takeIndex agrees with Post and the spine headers. Null during the
 *  countdown, for a node id not on this plan, or with no live take. */
export function liveRow(frames: readonly BlastFrame[], take: PopoutTake | null): LiveRow | null
```

Resolution is the same test `previewIndex` uses (`prompter-sync.ts:228`):
`filmNodeId(f) === take.qId || `blast-${f.id}` === take.qId`.

What the deck draws:

- In the "Film draft" header line (`ReviewDeck.tsx:1002-1006`): `● filming Split 2 · 4/11` in
  gold (the label via `takeLabel`), or `● countdown 7` while `take.countdown` is true with
  `take.count`. Nothing when there is no live take.
- The live row gets class `is-live` (`className` at `:924`) and a rule in `SPINE_CSS`
  (`:346-348`): `.sa-spine-row.is-live{outline:2px solid <GOLD>;outline-offset:-2px}`. Use
  `outline`, not `boxShadow` — the drop line already owns `boxShadow` inline (`:935`).
- When `frameId` changes, `scrollIntoView({ block: "nearest" })` on `[data-frame-id]`, guarded by
  a ref like `scrolledTo` (`:537-542`). If the live split's fold is closed, open it
  (`setCollapsedGroups`, `:566-567`) — a fold is UI, not storage; opening it while he films is the
  point.
- Selection is NOT moved. The live row is his camera; the selected row is his cursor.

The rule, and the test that pins it (§9.2): the Editor never writes `sa-film-active` or
`sa-film-roll`. `ReviewDeck.tsx` must not contain `publishFilmActive(`, `signalRoll(`, or
`useCapturePrompterSyncFrame(`. The pop-out is the sole writer while live, and the main `/film`
window pauses itself (`BlastOffCapture.tsx:428`); a third window that writes would fight both.

### 5.6 Suggestions becomes a redirect

`blast-off.suggestions.tsx` → `beforeLoad: throw redirect({ to: "/v3/$topic/$set/blast-off/results",
params, search: { board: 1 }, replace: true })`. Delete the component. Then:

- `StepBar.tsx`: remove the dashed Suggestions pill (`:116-134`) and the two folded-label special
  cases (`:100`, `:103`). `NumberedStep` (`:41`) can stay as it is.
- `use-bank.ts:108`: keep `"suggestions"` in `BlastOffStep` so `blastOffPath(topic, set,
  "suggestions")` keeps resolving to the redirect for any old link.
- `GenerationDock.tsx:134-140`: `resultsHref` returns
  `${blastOffPath(topic, set, "results")}?board=1` (it is consumed as an href string at `:173`).
- The timer's path detection (`src/lib/production-time.ts:49`, `production-run.ts:553`) never knew
  `suggestions`; landing on `results?board=1` now logs board time as Editor time. That is a gain,
  not a regression — say so in the commit.

### 5.7 Brainstorm: unchanged

PreFlight's `onGo` still navigates to the next set's Brainstorm (`blast-off.talkthrough.tsx:112-116`).
Lee asked for that on 2026-09-03 and it is how he batches five sets. The dock's link is the way
back to any set's board. Do not change it here (§10).

---

## 6. Server functions

None new. Used as they are:

- `loadBlastPlan` / `saveBlastPlan` (`src/lib/blastoff.functions.ts:27-44`, `:103-105`) — through
  `usePlan` only.
- `listBlastPlanSetIds` (`:63-102`) — Post's take rows, untouched.

Explicitly rejected:

- A `buildDraft` server function. The builder is pure and already on the client; the deck is the
  single writer while mounted (§3.1). A server write behind the deck's back is exactly the
  overwrite hazard this design removes.
- A `filmTake` / `startTake` server function or table. Which split is live is transient state
  that `sa-film-active` already carries between windows; persisting it is P10's hopper row, not
  this package.

---

## 7. Migration

**SQL LEE MUST RUN: none.**

High-water at the time of writing: `migration/supabase-migrations/20260907_0600_set_publish_captions.sql`.
If a later slice ever needs one, it is named `YYYYMMDD_HHMM_<concern>.sql` per
`docs/SESSION-CONTEXT.md` §2 — one concern per file, idempotent, `BEGIN … COMMIT`, ending in a
`SELECT` that proves it — and listed, never run. Nothing in §4 needs one, and a slice that finds
itself wanting a column should stop and re-read §4.4.

---

## 8. Build order — small, verifiable slices

One commit per slice. S4 and S5 change how the plan is written and are RISKY tier (run the suite
after each item); the rest are STANDARD. Typecheck + `bun test` per slice; one full build at the
end.

**S0 — Preconditions (no commit).** Confirm the tree is at or past `749f1189`. Then grep, because
P1/P2/P8 may have landed from another package before you arrive:

```
grep -n "take?: number" src/routes/v3.\$topic.\$set.blast-off.film.tsx      # P2 present?
grep -n "redirect(" src/routes/v3.\$topic.\$set.blast-off.index.tsx        # P8 present?
grep -n "filmPopoutHref\|Film this split" src/components/blastoff/ReviewDeck.tsx src/components/blastoff/capture/popout.ts   # P1 present?
```

Skip the slice for anything already there; still read what landed, because §5.3's range rules
and §5.2.6's button placement are what the later slices depend on.

**S1 — P8, the menu redirects.** §5.1 in full. Verify: `bun test` green; open
`/v3/<topic>/<set>/blast-off` and land on the Editor; Escape from `/film` lands on the Editor.

**S2 — P2, `?take=` on `/film`.** `capture/take-range.ts` + test; the route's `validateSearch`;
the clamps, the seed, the roll, the end, the chrome label, Escape-closes-the-pop-out, the hotkeys
lines (§5.3). Verify: tests; `/film?take=2` on a plan with cuts opens on the opener's intro of
split 2 and Space stops on its outro; `/film?take=9` shows the loud note.

**S3 — P1, the film door on the spine.** `filmPopoutHref` / `openFilmPopout` + tests; the button
on each split header and on the no-cut header (§5.2.6). Verify: press → a window named
`sa-film-popout` at `…/film?take=N&popout=1`; press on another split → the same window moves.

**S4 — the deck's two new verbs.** `freshIdeas` + test; `DeckApi.addIdea` / `buildDraft`
(§4.3); switch the route's `addSlide` to `addIdea` with the anchor (§5.2.4). Verify: the existing
`<details>` board's "＋ slide" now lands after the stamped card, not the selected one; typing in a
slide, then adding an idea, keeps both (one writer).

**S5 — the board panel.** `SessionView compact` (§5.2.3); the panel + header (§5.2.1-5.2.2);
`?board=1` and `sa-editor-board` (§4.1-4.2); the `Board · N` toggle in the right slot (§5.2.5);
delete the `<details>` block (`results.tsx:109-149`). Verify: `/results?board=1` opens with the
panel; Build the draft places ideas and selects the first; fold, reload, still folded.

**S6 — Suggestions redirects.** §5.6 in full. Verify: `/suggestions` lands on `/results?board=1`
open; the dock's link does the same; the StepBar shows five numbered pills and nothing dashed.

**S7 — Split into sets… .** The rename and the demotion (§5.2.5, §3.4). Verify: label, title,
still splits.

**S8 — the live readout.** `live-take.ts` + tests; the mount, the header line, `is-live`, the
scroll, the fold (§5.5); the source pin that the Editor never writes (§9.2). Verify: Editor +
pop-out on one screen; walk the pop-out with Space; the Editor's header counts and the lit row
follows; close the pop-out; the readout clears within 5 s (`POPOUT_STALE_MS`).

**S9 — Post carries the split (optional, five lines).** §5.4. Verify: a split's "→ Rehearse &
Film" opens `/film?take=N`.

---

## 9. Tests

### 9.1 New

- `src/components/blastoff/capture/take-range.test.ts` — no cuts + `take=1` → the whole list;
  a plan whose cut mark sits on a SKIPPED outro (the live defect) gives the same take boundaries
  as `listBlastPlanSetIds` would (compute over `filmFrames`); `take=2` starts on the opener's
  intro; out of range → `null`; `label` falls back to `Split N`.
- `src/components/blastoff/capture/popout.test.ts` additions — `filmPopoutHref` with and without a
  take; `popoutHref` on a URL already carrying `take=2` keeps it (the existing "everything else on
  it kept" case, `:12-16`, extended); the route pin `expect(route).toContain("take?: number")`.
- `src/components/blastoff/live-take.test.ts` — resolves by CEQ node id and by `blast-<id>`;
  `countdown` → `null`; a node id not on the plan → `null`; `pos`/`len`/`takeIndex` across a cut
  on a skipped outro; `null` take → `null`.
- `src/components/blastoff/idea-to-slide.test.ts` additions — `freshIdeas` drops an idea whose
  `itemId` matches a frame's `bankItemId`, keeps order, keeps everything on an empty plan.

### 9.2 Source-string pins to add (`src/components/blastoff/editor-board.test.ts`)

Read the files as text the way `popout.test.ts:9` does (normalise `\r\n`). Assert:

- `results.tsx` contains `board` inside `validateSearch` and no longer contains `<details`.
- `ReviewDeck.tsx` contains `usePopoutTake(` and does NOT contain `publishFilmActive(`,
  `signalRoll(`, `useCapturePrompterSyncFrame(`.
- `blast-off.suggestions.tsx` contains `redirect(` and `board: 1`.
- `blast-off.index.tsx` contains `redirect(`.
- `StepBar.tsx` does not contain `"suggestions")`.

### 9.3 Existing pins that must stay green

- `popout.test.ts:23-27` — the film route still contains `popout?: 1` and `popout: 1`.
- `popout.test.ts:28-32` — `POPOUT_NAME` / `POPOUT_FEATURES` unchanged.
- `production-time.test.ts:14`, `production-run.test.ts:258` — the menu path parses to `null`
  (pure functions; the redirect does not touch them).
- `takes.test.ts` — `planTakes` / `nameTake` / `runFor` untouched.
- `prompter-sync.test.ts` — nothing in `prompter-sync.ts` changes.
- `idea-to-slide.test.ts` — `addSlideFromIdea` / `buildDraftFromIdeas` signatures unchanged.

---

## 10. Do not build — and why

- **The Booth inside the Editor.** §3.2. The mic dies on the Editor's reload; the session
  lifecycle is page-level; the two surfaces do not fit.
- **A stepper / wizard route that hosts all five steps as tabs.** Each step is a URL so the back
  button, bookmarks and the timer's path detection (`production-time.ts:49`,
  `production-run.ts:553`) work. A tabbed host breaks all three and gains nothing the StepBar
  does not already give.
- **Changing PreFlight's next-set navigation** (`blast-off.talkthrough.tsx:112-116`). Lee asked
  for it; the dock is the bridge. Ask him before touching it.
- **A server function for Build the draft.** §6. One writer.
- **Any write to `sa-film-active` / `sa-film-roll` from the Editor.** §5.5. A third writer
  fights the two that already coordinate.
- **Persisting folds or keying them by head id.** The positional `collapsedGroups`
  (`ReviewDeck.tsx:563-567`) is a known wart (audit §2) and a separate small item. The live
  readout only opens a fold; it does not redesign folds.
- **Retiring `SplitPanel` / `splitSet` now.** §3.4. Rename, demote, watch.
- **Deleting `/v3/$topic/$set` (the three doors).** It hosts `TemplatePicker` (pass 1 / pass 2,
  `v3.$topic.$set.index.tsx:85-101`), which has no other home. A different package.
- **The spine's performance rewrite** (audit §1: O(n³) grouping at `ReviewDeck.tsx:1098`,
  unmemoised `PhoneFrame` thumbs). The panel adds width pressure, not renders; do not mix a memo
  pass into this package.
- **The F4 mid-take fix** (audit §7, `BlastOffCapture.tsx:396`, `:502-507`). S2 touches the
  same function's neighbours; keep the roll semantics exactly as they are and let that fix be its
  own commit later.
- **P10 (OBS keep / try again / scratch, the hopper) and P11 (posted to the website).** Their
  own designs. No placeholder buttons, no `TakeDecision` stub, no `short_jobs` table.
- **The ReadyModal re-fire** (`ProductionTimer.tsx:108`, `:263-267`: `dismissed` is one string,
  so every Editor↔Film bounce re-shows it). §5.1 makes that bounce direct, so it will show more
  often. It is the obvious next small item — not this one.
- **Ctrl+I in the pop-out** (`IdeasDock` has no `?popout=1` guard; `ProductionTimer.tsx:247-249`
  is the guard to copy). Separate.
- **Data rewrites** — the cut mark on the skipped outro in `deck-e1s-2-1`, any feedback text.
  Lee's hands, in the UI.

---

## 11. Decisions made here that Lee may overrule

1. The board panel is **closed by default**; the `Board · N` count is the nudge. If he wants it
   open whenever there are fresh ideas, that is one line in S5 (default = `fresh > 0`).
2. Escape in the pop-out **closes the window**. Today it navigates the 560×1000 window to the
   menu, which nobody wants; but he may prefer it to do nothing.
3. `Split into sets…` stays for now (§3.4). The retire decision is his, after a few cut plans.
4. The no-cut plan gets the film button on the "Film draft" header, filming `take=1` = the whole
   set. If that reads as clutter beside the Step 3 pill, drop the no-cut button and keep the pill.
