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
