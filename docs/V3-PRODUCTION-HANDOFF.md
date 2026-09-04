# V3 Production System — handoff

**Read this first.** It is the context for the sessions that build out `/v3` —
talkthrough, arrangement, filming. Written 2026-09-02 at the end of a long
session; everything here is either verified or explicitly marked as not.

---

## The goal, in one line

Lee films Blast Off shorts. The job is a production line: **talk through a set →
the tool digests those ideas into slides → film it**, with as little hand-made
work as possible. His words: *"more talk-made where I created it by talking in
the talkthrough booth."*

Everything moves under `/v3`, because the old canvas grew an outline, a
Pipeline, an Exhibit Lab, publishing, takes and videos — all reachable from
every screen. V3 is a **menu**, not a workspace.

---

## Where the work lives

| | |
| --- | --- |
| Repo | `github.com/Survive-Accounting/survive-accounting-hub` |
| This worktree | `C:\Users\lee\Documents\sa-film-camera` |
| Branch | `film/free-camera-pinned-ceq` |
| Main | deploys to production (`surviveaccounting.com`) on push |

**Do not push to main without Lee's word.** Another session was working on main
as of this handoff. Everything below is committed to the branch.

Plan doc (living): https://claude.ai/code/artifact/2d4a68d9-4e80-4ae7-a94c-4372665c11b5

---

## Update — 2026-09-02 evening session (this branch)

Done and verified in the browser (DOM checks; the pane is 0×0 here):

- **Zod enum bug fixed.** `BLAST_FRAME_KINDS` in `blastoff/plan.ts` is the one
  list; both server schemas (`blastoff.functions.ts`, `blastoff-sync.functions.ts`)
  derive from it. A plan with intro/bio/outro loads and renders (13 frames on
  *Internal vs. external users*). The SAVE path is schema-tested, not exercised
  against the DB — Lee's first edit in Arrange is the live proof.
- **Talkthrough** (`components/talkthrough/Booth.tsx`, mounted by `/talkthrough`
  and `/v3/…/blast-off/talkthrough`): Prompter gone, "talking about the set as a
  whole" gone, focused question is the real `SetCard`, transcript 13.5px muted,
  every segment has a × (soft archive + undo), **Import transcript** (paste or
  .txt) parses stamps / "Question N" / "Set:" headers — `talkthrough-import.ts`,
  14 tests. Importing was NOT clicked against the live store; the parse preview
  was. First real import is Lee's.
- **Blast Off under /v3**: `/v3/$topic/$set` → `/blast-off` (which step?) →
  `/talkthrough` · `/arrange` · `/film`. The old `/blast-off` still works; its
  editor/capture live in `blastoff/BlastOffEditor.tsx`. Set screen is now an
  index route (`v3.$topic.$set.index.tsx`) so the steps are flat siblings.
- **Detour cards**: inserts carry `callout.detour: true` (additive) — navy card,
  gold edge + label, `==key phrase==` highlighted gold. `insertStem()` marks the
  phrase; `inline-md` now allows a lone `=` inside a highlight. Verified in the
  Arrange preview with a cheat code (save blocked in the test browser). Not yet
  seen on the canvas film surface with a real synced insert.

Still unverified (needs Lee): everything in "NOT verified" below, plus the
first Arrange save, the first transcript import, and "Send to film" with a
detour card on the canvas.

**Second pass, same evening (Lee's feedback after testing on production):**
- Step bar on every step screen — Step 1 Talkthrough · Step 2 Generate results
  · Step 3 Send to filming (`components/v3/StepBar.tsx`, one `STEPS` list also
  drives the doors). The "Talkthrough studio ↗" link that broke the trail is
  gone; the shell's Exhibit Lab link opens a new tab.
- Step 2 = the studio's SessionView, extracted to
  `components/talkthrough/SessionView.tsx` and mounted at `/blast-off/results`
  (Generate review, board, exhibit prompts, resume talking).
- Booth: transcript moved to the TOP LEFT above the path; Start over (archives
  every segment + stamp, confirm first); CEQ MODE / EXHIBIT MODE toggle —
  exhibit mode lists the shipped exhibits, focus anchors segments to
  `exhibit:<id>`, Tab surfs exhibits.
- Recorder: a segment is PRESS-TO-PRESS — the ~0.9s silence cut is gone; a
  chunk ends on stop / focus change / stamp, hard cap 5 min. The voiced-time
  gate that keeps near-silence away from Whisper stays.
- Verified by DOM: all three steps, exhibit mode, the shell link target. NOT
  verified: a real recording under the new chunking (Lee's mic), Generate
  review from Step 2 (blocked in the test browser).

**Third pass:** `/v3` IS THE QUEUE (and the home). Every Exam 1 set grouped by
topic, a live status chip from its newest session (talking · session open ·
results ready · …) and three icon buttons straight to Step 1/2/3. Below it,
IDEAS IN PRODUCTION: board items with status `in_production` — pushed from a
results board with the new "→ queue" button (ReviewBoardV2), marked "done"
from the queue. Step 2 got a session picker (newest first) because a CEQ
sitting and an exhibit sitting are separate sessions with separate boards.
Sessions are per SET: exhibit-mode talk goes into whichever session is open
on that set — end the CEQ session first to keep the sittings apart.

## The route shape Lee wants

Today V3 stops at three doors. He wants it to keep nesting:

```
/v3
/v3/$topic
/v3/$topic/$set                      → "What are you making?"  Blast Off · Practice · Review
/v3/$topic/$set/blast-off            → "Which step are you on?"
/v3/$topic/$set/blast-off/talkthrough
/v3/$topic/$set/blast-off/arrange
/v3/$topic/$set/blast-off/film
```

**Not** `/blast-off` — the current set screen links there and it should link into
the nested route instead, reusing the existing `/blast-off` UI/UX (Lee likes that
screen; it is the route that is wrong, not the design).

### What each step means to Lee

- **Talkthrough** — pure brainstorming. He looks through the set and *stamps out
  ideas*: phrases, trigger words, cheat codes, tips, real-world examples,
  exhibits. Nothing is arranged here.
- **Arrangement** — the AI digests those ideas into reusable elements and drops
  them between slides. He reviews each slide and adds/removes. Editable after
  insert as an override, but the tool should get style and formatting right so
  production is fast.
- **Filming** — capture.

### Update — 2026-09-03: Step 2 is REVIEW, and it is the film draft

Lee: *"Talkthrough is just talking. Review is seeing the filming draft as it
stands and adding new slides, editing current ones, removing, rearranging —
just getting it SOLID before I do the film run."* Built by hand in this
session (the build queue judged it too big — see docs/TWO-MACHINES.md).

`/v3/$topic/$set/blast-off/results` now mounts `components/blastoff/ReviewDeck.tsx`:

- **Left — the film draft.** The Blast Off plan (`deck.blastOff`, the same
  frames film mode walks). Drag a row to reorder (arrows too). ＋ Memorize
  this / Cheat code / Deeper idea / Exhibit / Blank insert after the selected
  slide. Duplicate copies a slide right after itself. ✕ removes an insert;
  on a card the set owns it SKIPS the card (`frame.skipped`) — greyed and
  struck through in the list, absent from film mode and from the
  send-to-film handoff, one click to film it again. The set is never edited
  by the plan.
- **Middle — the slide.** Drawn by the canvas's own card at readable size.
  Underneath: the fields for that kind (rule + body for a cheat code, the
  phrase, the idea, the intro topic line, the outro tagline). For a CEQ:
  stem, choices (tick the correct one), feedback — **before and after** side
  by side while dirty, **✓ Save to bank** through `applyCeqEdit`, the door
  the review board already used. The card that films IS the bank card.
- **Right — the teleprompter.** `frame.prompter`: the lines Lee kept for this
  slide. Candidates are HIS words — segments captured while that CEQ was
  focused, or inside a stamp context of the slide's kind, or the bank item
  the slide came from (`components/blastoff/prompter.ts`, pure, tested). Click
  to keep; edit, reorder, drop. **✨ Proofread with AI** tightens them (Lee's
  law: never invents) and may add ONE marked suggestion. Film mode shows the
  slide's lines in a side panel (P toggles it).
- **The AI board** (transcript, script, CEQ edits, ideas) folds underneath.
  Every idea card gained **＋ slide**: it lands on the draft after the selected
  slide, as the kind its stamp maps to, with the item's text and `bankItemId`.
- Saves are debounced 500 ms in `usePlan` and flushed on unmount; the arrange
  step shares the hook and benefits.

**Second pass, same night (Lee's notes after using it):**
- Drag shows a sky line ABOVE or BELOW the row under the cursor; the drop
  goes where the line is. Space / Shift+Space walk the slides (never while
  typing) — the same keys as film mode.
- "Note frame" is now **Summary slide** — *Opening summary* / *Closing
  summary* when the set has both. They are two different cards; editing one
  never touches the other (that was the "it didn't save" confusion).
- The dark detour skin keeps a colour per kind: cheat code gold, memorize
  this orange, deeper idea sky — label, highlight and card edge
  (`detourAccent` in cards/CalloutCard.tsx), in review, film and cram cards.
- **Bullets** under a callout: `frame.bullets` (one per line in the editor)
  → `callout.extraStems` on the synced frame — the canvas card already draws
  them. The main phrase is highlighted for all three kinds (a deeper idea
  too, now).
- **The phone stage**: every slide previews on a 9:16 black stage with the
  TikTok / Shorts UI zones shaded (status bar, caption strip, action column).
  Toggle it off for the plain card.
- **The prompter, reorganised**: the stamps used near the slide as chips
  (click one to see its words), raw words folded under "All your words",
  **✨ Proofread into phrases** → one-sentence phrases (two max — cram
  videos), each with *keep* (prompter line) or *→ slide* with a kind picker
  to override the AI's guess; the slide lands right after the current one
  and carries the phrase as its first prompter line. One marked AI
  suggestion at most. `prompter.ts` is pure and tested.
- **Spotlight**: a callout CEQ (no choices) is a whole-card spotlight target
  (`spotlightTargetsOf` → self; the previewer's callout body carries the
  target). Verify on the canvas film surface by Ctrl+clicking a detour card.
- **Cram cards for students** (Lee: "Cram blast off vid > cram cards >
  practice"): `fetchSetCramCards` serves the set's synced detour frames
  (provenance blast-off, kinds phrase/cheat/tip, running order, same gate as
  practice); the /learn player has a **Cards** action between the video and
  Practice (`components/learn/CramCards.tsx`), ending in "Practice → ".
  Skipped cards and unsent edits never reach students: only what "Send to
  film" wrote into the set is served.
- Banked for later: film mode and the canvas mirrored, with a persistent
  vertical frame on the canvas (idea "Film mode canvas sync…").

**Third pass (after Lee's first send-to-film, same night):**
- `renderInline`: `__word__` underlines, a run of `___` is a blank line.
- The detour card: the title is the bold heading, nothing auto-highlighted
  (his own `==marks==` still work); a cheat code's body is the first line
  under the heading; lines under the heading are uniform full ink on the
  dark card for all three kinds (`frameBullets`, CalloutCard).
- The prompter: **This slide / All stamps** toggle; proofread runs by
  default and is remembered per set of words (`sa-prompter-tidy-v2`); each
  phrase has a TITLE (→ slide makes title + first line); in All stamps every
  phrase knows the card it was said on (↗ Q3 jumps there) and keep / → slide
  act on that slide. Raw words under a fold.
- Arrange: skipped cards struck through + SKIPPED; space / shift+space walk.
- **Skipped cards stay out of the canvas walk**: send-to-film now sends every
  frame; a skipped set card keeps its place and gets `data.filmSkip`, which
  `CeqStudio`'s set walk and student practice both filter (practice: "the
  final edit of slides is what practice will look like" — Lee's explicit yes).
  Un-skip on Review and send again to clear it.
- **The v3 film preset** (`FilmHandoff.openFilmMode`): the handoff writes the
  studio's own preference keys — filming mode ON (`sa-filming-mode`, the F2
  switch that drops the stem editor, script, mark-correct, spine, memo
  library), `sa-orientation` 9:16, `sa-fade-ms` 120, `sa-brand-cursor` on.
  Every one is still a toggle in the studio; nothing forked.
- **Spotlight pops, doesn't zoom** (studio film surface): `containSpot` lifts
  1.06 (choice) / 1.1 (memo, callout) from the centre with rail + glow; the
  super-spotlight flame rules are 1.08 / 1.12 instead of 1.25 / 1.6.
- **Background**: the film frame paints `deck.world`; a set with no world is
  flat near-black. Send-to-film now gives a world-less deck the default world
  so the backdrop is there on first open (View ▸ World changes it per set).
- NOT verified by hand: everything on the canvas side (walk skip, preset,
  spotlight feel, backdrop). Lee also reported CEQs not interactive in the
  capture window — the code path (active card live, choice click in film,
  highlight on mouse-up) looks intact; retest after the preset and report
  which surface and what was clicked.

**Fourth pass (Lee's notes after filming, later the same night):**
- **Duplicates on Arrange**: send-to-film writes the plan's detour/spine
  frames into the set as note nodes (`provenance: "blast-off"`); the bank
  loader read them back as set cards and the plan re-added them. `loadBoothBank`
  now skips provenance blast-off. Arrange: 14 frames + 3 skipped, no phantoms.
- **"Memorize This AND Found on your exam"**: the sync writes
  `showTopic: false` on detour callouts.
- **The detour moment**: on the dark card the kind label is big, in its
  colour, breathing like neon (`.sa-neon-label`, film only), with the boiling
  bolt beside it; the title is the bold heading (no auto-highlight); a cheat
  code's body is the first uniform line under it (`frameBullets`).
- **Watermark**: `SurviveWordmark` top-left in the film popout wrapper.
- **`__word__` / `____`** underline and blank in `renderInline`.
- **THE V3 FILM SURFACE** (`sa-v3-film`, set by the handoff; "filming mode"
  turned out to be the Pipeline cut room, which is the bloat Lee saw):
  `CeqStudio` renders ONE bar — 🎯 Capture · ▶ Teleprompter · 9:16/16:9 ·
  ⚙ Studio tools — and hides topbar, status strip, slim strip, spine,
  pipeline and memo library by their `data-sa-panel` markers (never
  unmounted). The previewer shows the vertical stack (`sa-view-overview` on).
- **Teleprompter that follows the film**: `/v3/teleprompter?set=<deckId>`
  loads the plan and shows the active frame's `prompter` lines; the Studio
  publishes `sa-film-active` `{setId, qId, at}` on every frame change.
- **Film popout interactivity**: the CEQ card carries `nodrag` in film so a
  drag on it is a text selection, not a pan; **Shift+click** highlights the
  word under the pointer (`wordRangeAtPoint`); plain click still selects /
  resolves a choice; Ctrl+click spotlights; Alt+drag moves.
- **Vertical card size**: with no saved spot a 9:16 frame deals the card at
  1.3× (`VERTICAL_DEAL_SCALE`); a saved instance/template still wins.
- **Alt+drag MOVES the card by its own hand now** (2026-09-03, late): with
  real pointer gestures on the inline film surface, ReactFlow's node drag
  never fired on the film pane even with the node marked draggable — which is
  why Alt+pick-up "never worked" for Lee. The card root now owns the gesture
  (`startAltMove` in CeqPreviewNode, capture phase, `MoveContext` → transient
  position delta in flow units, zoom-aware). The `nodrag` class added the
  night before is gone (it was blocking drags outright). VERIFIED in the test
  pane with real gestures: plain click selects, second click resolves,
  drag-select highlights, Shift+click highlights a word, Ctrl+click pops,
  Alt+drag moves the live card, Alt-hover shows the grips and ring.
- **How that was tested**: `/study/canvas?film=inline` with the handoff in
  localStorage opens the SAME film surface inline in the tab (the popout is
  `window.open("")` + a React portal of the same tree), so the in-app browser
  pane can drive it. The pane loads canvas data without a sign-in. Mind: the
  canvas autosaves scene files on load; never touch authoring controls there.
- **Alt-hover grips in the film popout** (built, same night): hold Alt and
  hover any node → a dashed gold ring; on the CEQ card, corner grips scale it
  (text too), left/right grips change its width, top/bottom grips scale, and
  Alt+drag on the body moves it (`AltGrips` in CeqPreviewer, `WidthContext`
  for the transient width). All TRANSIENT, like every grip in the previewer:
  the next seed/question resets it; nothing is written to the set.
- Still banked: right-click "save this position for future CEQs" (the
  persistent version of the above); canvas v3 clusters/exhibits/publishing.
- **The tutor card** (Lee: "do the bio slide in the same format as the
  memorize this, deeper idea, cheat code… but maybe a bit bigger"): the bio
  is a detour-format callout now — kind `tutor` (YOUR TUTOR, red on navy),
  heading "Lee Ingram", lines BAccy · MAccy — Ole Miss / Tutor since 2015 /
  1,000+ students, footer surviveaccounting.com — at 1.15× on the review
  stage and `cardW` 640 on the synced frame. Words live in
  `components/blastoff/bio-card.ts`. `SurviveBio` (the 9:16 brand card) stays
  for the Add menu and old scenes; a re-send removes the old staged bio.
  `CalloutSettings.footer` is new and additive.
- **Revert a saved CEQ edit** (Lee: "I'm just nervous to use it. Would be great
  if we could revert on this after the fact"): `applyCeqEdit` keeps the card's
  previous words in `data.editHistory` (last ten); `revertCeqEdit` puts the
  last one back; the review deck's CEQ editor shows **↶ Revert last save · n**.
- **The typewriter** on dark detour cards (film only): the heading types in
  word by word, then each line, ~45 ms a word (`typewrite` in CalloutCard,
  `.sa-type` in PV_CSS). Plays on every deal; off under reduced motion.
- **THE VERTICAL SPOT** (Lee: "the slide is off to the top right … 1/5 the
  size … more centered … big enough that it fits best in the shorts zone"):
  the set carried card spots from landscape sessions. Send-to-film now stamps
  `data.geomV.card` on every planned frame and `deck.layoutV.card` with
  `verticalCardSpot()` (`blastoff/film-spot.ts`, tested): centred, 1.3×,
  centre at 46% of the frame's height. Landscape `data.geom` is untouched.
  **Send to film again after this deploy** for the set to pick it up.
- **THE COLD OPEN + BACKDROP** (Lee, 2026-09-03 night: "an infinite zoom of
  the bolt … campus + course codes scrolling like a stock ticker … Survive
  white wordmark FIRM in the middle … 'Cram what's on your exam' … run for a
  cold open, then keep going until the opening summary slide, then cut out …
  INVERSE the white so the animation is going over just the Survive"):
  - `brand-cards/BoltZoom.tsx` (+ `bolt-zoom.ts`, tested): seven boiling
    bolts at geometric scales (1.6×, 7 s period) mirrored bottom-left→top-right,
    brand colours cycling with a gentle hue drift (psych 0.1 ≈ ±12°), the
    Power Four ticker (SEC first) from `GENERATED_SCHOOLS`, the wordmark firm
    with the tagline. Modes: `open` (full), `backdrop` (layers only, quiet),
    `knockout` (black stage, white wordmark, layers multiplied → motion inside
    the letters). `progress` pins a frame for an offline renderer; `live`
    false freezes it.
  - New frame kind **`open`** leads the standard spine (generatePlan /
    reconcilePlan guarantee it); canvas element **`blastopen`** registered
    everywhere `blastintro` is; `STANDARD_STAGE.open` stages it on send.
  - **The rule** `backdropFor(frames, i, isNoteOnly)`: open → `open`; every
    frame after it through the FIRST summary card → `backdrop` (intro) /
    `knockout` (summary); then nothing. `frame.backdrop` "zoom" | "off"
    overrides (the **✨ backdrop · auto/on/off** chip on the review deck).
    Send-to-film writes `data.filmBackdrop` on the planned nodes; the film
    frame (`FrameBgNode`) draws BoltZoom instead of the world when set.
  - Verified on the review stage. Film side: tsc + code. Re-send to film to
    get the open frame and the backdrops into the set. Remotion MP4 render of
    the open is the next step (separate folder, never in the web build).
- **Unblock-filming pass (Lee, 2026-09-03, late):**
  - The typewriter is LINE BY LINE now (heading, then each bullet, then the
    footer; `.sa-type` + `--i`, 240 ms a step). The first cut split every word
    into a span and dropped words on the synced frame — that was the "blank
    spaces in the bullets" bug. Verified finished-and-visible on the film
    surface.
  - Detour cards use the homepage faces at phone size: heading League
    Spartan 31 (balanced, up to one break), bullets Rubik 19 (short ones
    never break; a long one wraps rather than clipping off the card).
  - **Per-line spotlight**: the title, each bullet and the footer are their
    own spotlight targets (`spotlightTargetsOf` → title, line:i, footer;
    `CalloutBody.lineSpot`). Ctrl+click one: 1.06× and a gentle brand-colour
    glow that breathes gold → pink → cyan (`.sa-detour-spot`, `sa-lsd`, 20%).
    Verified on the film surface.
  - **Positions stick**: after an Alt-move or a grip drag on the LIVE card,
    its spot goes to the card's instance geometry for this orientation via
    the Studio's `onSaveInstance` (`PersistContext`); a width drag writes
    `cardW`. The next deal, take and the canvas agree. Stand-ins never persist.
- **Detour cards are full card width** (same pass): callouts were fit-content
  with a 320 floor, so a detour drew at about half a set card's width. Dark
  detour cards now floor at `cardW ?? CARD_W` and cap at the same, so every
  slide in a rip is the same width and the tutor card (640) reads bigger.
- Verified in Lee's own Chrome (signed in, this PC): the handoff path opens
  the Studio on the set; the film stack holds the four detour frames with neon
  labels and the wordmark. NOT verified: the popout's gestures (a new window).

---

## Lee's open requests, in his priority order

**1. Talkthrough is top priority.** He is going to talk through every Easy Points
set to bank add-on slides. Specifically:

- Remove the **Prompter**.
- Remove the paragraph *"Talking about the set as a whole. Click a question in
  the path to anchor…"*.
- **Segments must be deletable** — he trashes things often.
- Transcribed text: **much smaller, different colour/weight** — subtle but
  readable. Right now it is 18px `NEON.text`; he wants it quieter.
- Show **the actual CEQ frames** he will film (the `/blast-off` frame preview is
  "kinda perfect"), not talkthrough's own reformatted question layout.

**2. Filming fixes** — he tests these while talkthrough is built. See "unverified"
below.

**3. Transcript import** (his idea, answered yes): let him dictate notes outside
the app and upload the transcript later, so the app grabs the stamped moments.
Feasible because a `TalkSegment` is text + an optional `focusedCeqId`; audio is
optional. See "Speaking convention" below.

**4. Arrangement styling.** Inserted cheat codes / phrases / exhibits should use
the dark "CHEAT CODE" card look (screenshot: gold label, dark card, highlighted
key phrase) so they read as a *detour* between the bright white CEQ cards. Must
look good in short-form.

**5. Bird's-eye grid** on the film surface: every slide laid out, big `Q1 Q2 Q3`
labels, click a label to zoom into that question. `O` currently pulls back but
shows no other frames.

**6. Shift-drag selection-box text highlighting.** Forgiving box select over stem
or answer text; anything inside the box highlights. Then **Ctrl+click** to
spotlight what is highlighted. Highlights must **persist across CEQs** so he can
pre-highlight and flash through; `` ` `` resets.

**7. Postponed by Lee:** anything that is not talkthrough or filming.

---

## Known bug to fix

`/blast-off` throws a **Zod enum error** when a set's plan contains `intro`,
`bio` or `outro` frame kinds:

```
Invalid enum value. Expected 'ceq' | 'phrase' | 'cheat' | 'tip' | 'exhibit' | 'blank',
received 'intro'   (path: frames.0.kind)
```

**Located — it is one line.** `src/lib/blastoff.functions.ts:21`:

```ts
kind: z.enum(["ceq", "phrase", "cheat", "tip", "exhibit", "blank"]),
```

but `BlastFrameKind` (`src/components/blastoff/plan.ts:20`) is:

```ts
| "intro" | "bio" | "outro"                          // the standard spine
| "ceq"                                              // a card the set owns
| "phrase" | "cheat" | "tip" | "exhibit" | "blank";  // what Lee inserts
```

The spine kinds were added to the type and never to the schema, so **every set
whose plan has a real spine fails to load**. Add `"intro" | "bio" | "outro"` to
the enum. Derive it from the union rather than retyping the list, or this drifts
again the next time a frame kind is added. Reproduces on **Internal vs. external
users**.

---

## Speaking convention for dictated notes

The app already parses these stamp kinds, so **say the word and the import is
mechanical**:

| Say | Becomes |
| --- | --- |
| "Phrase: …" | `phrase` |
| "Trigger word: …" | `trigger_word` |
| "Tip: …" / "Trick: …" | `tip_trick` |
| "Cheat code: …" | `cheat_code` |
| "Real world: …" | `real_world` |
| "Memo: …" | `memo` |
| "Exhibit: …" | `exhibit` |
| "Short: …" / "Nerd out: …" | `short` / `nerdout` |
| "Reword this: …" | `reword` |
| "Revise choices: …" | `revise_choices` |

Anchor by saying **"Question 3"** before talking about Q3, and name the set at
the top of each block. `focusedCeqId` is what makes an idea land on the right
slide later.

---

## State: what is shipped vs unverified

### On production now
Free camera + CEQ pin · inline film surface (👁 preview in the Pipeline strip) ·
cycle card boots in PLAIN · provenance badge · sourcemaps on preview builds ·
TDZ ratchet · talkthrough flowing paragraph + Space start/stop · V3 shell.

### On the branch, not yet on main
- **The pill fix.** A *bare frame* (`callout.hidden`) only ever hid the stem; the
  cream card box kept rendering, so bookend slides painted a white slab over the
  artwork. Now transparent in film, still visible in authoring so it can be
  found and switched back on. *Verified: exactly 5 bare frames transparent, 12
  real cards keep their cream.*
- **Alt reaches the resize handles.** `ElementResizer` gates on
  `isVisible={!!selected && !film}` — it renders nothing in film, so CSS could
  never un-hide it. Alt state now lives in the shared `film-camera` store.
  Resizes never persist in film (that was the "card randomly resizes" incident).
- **Arrows moved to F1**, freeing Alt. *Lee confirms F1 works well.*

### NOT verified — needs Lee's hands
`O` · Alt move · Alt resize · the CEQ pin holding a card.
The browser pane collapses to **0×0** in this environment, and at that size
`fitFilm` correctly refuses to compute a shot and ReactFlow cannot hit-test a
selection. Do not claim these work without Lee.

---

## Environment: the expensive lessons

1. **`/study/canvas` is NOT auth-gated.** It loads locally with real data. It
   just pulls thousands of unbundled dev modules and takes **~40s** to first
   paint. An early check sees white; that is not an auth wall. Waiting was the
   fix, and assuming otherwise is what let a crash reach Lee.

2. **A worktree needs a real `bun install`.** Junctioning `node_modules` from
   another checkout breaks TanStack Start's virtual client entry (404 on
   `virtual:tanstack-start-client-entry`). Also copy `.env`, and give the
   worktree its own port in `C:\Users\lee\Documents\.claude\launch.json` (NOT
   the repo's tracked one).

3. **`await import()` from the browser console can resolve a SEPARATE module
   instance** from the app's — proven by toggling `pinOn` with `L` and watching
   the imported copy not change. **DOM checks are trustworthy; console store
   reads are not.** Several "home is null" readings this session were probably
   that phantom.

4. **The browser pane may be 0×0.** Screenshots come back blank and layout is
   degenerate. DOM inspection still works — use `getComputedStyle`, class names
   and node counts, not pixels.

---

## House rules that bit us

- **TDZ is the recurring killer.** Three production crashes: `ceq-geom`,
  `orientation-store` (`yl`), and `filmStandins` reading `liveIds` declared 36
  lines below it. Module-scope callables must be hoisted `function`s; mutable
  module state should be `var` materialised lazily. `tdz-graph.test.ts` now walks
  the real import graph out of `CeqPreviewer`/`CeqStudio` (160 modules) and
  ratchets: existing debt baselined, a new offender fails.
- **Source-reading tests must normalise CRLF** at read (`import-cycles.test.ts`
  enforces it).
- **Film never persists geometry.** Drags and Alt-resizes are performance moves.
- **Never weaken a passing test to go green** — restate the contract instead.
- **No data-rewriting** without Lee. `#1S11` still has duplicates (two cycle
  exhibits, two "Found on your exam" cards, a stray heading, two logo frames)
  left untouched deliberately.

## Not ours, but failing on main

- Three tests: `bolt-palette` + two `curated rotation order`, from the
  schools/picker work.
- Typecheck error at `partner-kit.server.ts:319` (`CHAPTER_SEATS_BUY_URL = ""`
  narrows to `never`). Does not block builds; does fail `bunx tsc --noEmit`.

---

## File map

| What | Where |
| --- | --- |
| V3 shell + screens | `src/components/v3/`, `src/routes/v3.*.tsx` |
| Bank data (topics→sets→questions) | `loadBoothBank()` in `src/lib/talkthrough.functions.ts` |
| Talkthrough UI | `src/routes/talkthrough.tsx` |
| Talkthrough capture engine | `src/components/canvas/talkthrough-audio.ts` |
| Stamps / segments / board | `src/components/canvas/talkthrough.ts` |
| AI digest pass | `src/components/canvas/talkthrough-pass.ts` |
| Blast Off editor + plan | `src/routes/blast-off.tsx`, `src/components/blastoff/plan.ts` |
| Blast frames (the real slides) | `src/components/blastoff/` |
| Film camera / pin | `src/components/canvas/film-camera.ts` |
| Film surface | `CeqPreviewer.tsx` (`FilmShell`, `withCeqPin`) |
