# Editor session — context + prompts (2026-09-11)

Paste this file's path into a fresh Claude Code session in this repo, then run the prompts in
order. Everything below was verified against the code on 2026-09-11 (main tip after
`ff5655cd`). Read `docs/SESSION-CONTEXT.md` too when other sessions are running.

## The line, in one paragraph

A **set** (deck) owns its cards (CEQs) and a **plan** (`blastOff.frames`, saved in
`canvas_scenes.nodes_json` through `lib/blastoff.functions.ts` `saveBlastPlan`). The plan is a
running order of **frames**; a **split** is a run of frames between cuts (`plan.ts planTakes`,
`cutAfterFrame`, `standardOpener`) and is one vertical short. The Editor is `/v3/<topic>/<set>/
blast-off/results` → `components/blastoff/ReviewDeck.tsx` (the spine strip, the slide preview,
the Editor/Illustrator panel). Filming is `…/blast-off/film` → `BlastOffCapture.tsx`
(spacebar walks frames; `?take=N` films one split, `?frame=<id>` starts on a slide, `?popout=1`
is the 9:16 window). Post is `/v3/post` (per-split rows, post-production: Whisper transcript →
caption burn on the Fly worker → cover → paste links). The map is `/v3`.

## Frames: the model you're extending

- Kinds (`plan.ts BLAST_FRAME_KINDS`): `open` (cold open), `intro`, `bio`, `outro` (bookends —
  every split carries its own; never generate bookends elsewhere), `ceq` (a card), callouts
  `phrase` (Memorize this), `cheat` (Cheat code), `tip` (Go deeper), `tricky`, `found` (Found on
  your exam), `exhibit`, `blank`, `bolt` (BoltZoom detour), `ad`, `cluster` (a map), `slogan`.
  Zod shape: `lib/blastoff-frame-schema.ts` (`text`, `title`, `bullets`, `cam`, `banner`,
  `display: "big"`, `prompter`, `prompterKeys`, `prompterMarks`, `cutAfter`, `takeName`,
  `skipped`, `cluster`, `variant`…). ADD NEW FIELDS ADDITIVELY and to the schema.
- A new "bumper" is a new **kind** (or a `variant` on an existing kind): add it to
  `BLAST_FRAME_KINDS`, `FRAME_LABEL`, `KIND_COLOR` (ReviewDeck), `FULL_FRAME_KINDS` if it owns
  the whole frame, `camDefault()` in `layout.ts`, and a renderer.
- Renderers: `PhoneFrame.tsx` (the 9:16 frame everything draws through — the Editor thumbnails,
  the preview, the film pop-out), `frame-view.tsx` (which renderer per kind, backdrop rule),
  `ContentFrames.tsx` (callouts; uses `stage.tsx` `reveal(progress, from, to)` / `riseIn` —
  reveals are PROGRESS-DRIVEN: the film surface advances `progress` per spacebar step, so a
  frame's "reveal steps" are whatever its renderer keys off `progress`), `CeqFrame.tsx`,
  `FoundOnYourExam.tsx`.
- Safe zones: `layout.ts` — `SAFE {top .10, bottom .78, left .05, right .84}` (status bar,
  like/share rail, caption/title/sound), `CAPTION_RAIL` + `captionRailRect(w, h, wide)` (the
  captions box; `wide` variant exists). A frame kind can choose its own caption box by branching
  on kind where `captionRailRect` is called.
- Camera: `layout.ts camDefault(layout, kind)` → spot `home|corner|hero|top|free|off` (+ size).
  `slogan`, `open`, `outro`, `bolt`, `ad` default off. Per-frame `cam` overrides.
- THE LOGO IS TEXT + AN SVG BOLT — `components/brand-cards/bolt-boil.tsx` `SurviveWordmark`
  (Rubik 900 letters, `BoltBoil` SVG as the "i"). Letters are DOM text, so "ve" → "bes" can be
  animated on the wordmark itself (wrap the tail in a span). `BoltBoil` takes red/blue/cream
  and a `boilFrame`/`boilSeconds` for the boil animation. Campus colours: `lib/schools.ts`
  (`c1`, `c2`).
- Curriculum data for a bumper (topic name, N of M topics, next topic): `useBank()` gives
  `BoothTopic[]` with `sets`; the set's topic and the next topic are `topicOfSet` /
  `nextSetAfter` in `components/v3/use-bank.ts`. The film route has `topic` and `set` already.

## Publish → player (what survives, what doesn't)

- The LESSON pipeline (`lib/publish.functions.ts`): Mux concat → Auphonic (loudness + intro/outro
  sting) → final Mux asset → `playbackId` on the set → `CramPlayer.tsx` (`<mux-player>`).
  No per-frame timing survives this trip.
- The SHORTS pipeline (V3, what Lee films now) does NOT publish to Mux yet: OBS take → upload in
  `/v3/post` post-production → Whisper transcript (`lib/transcribe.functions.ts`) → caption burn
  on the Fly worker (`worker/src/stages.ts burn_captions`) → Lee posts by hand; "site" is a tick
  only (`docs/DESIGN-SITE-PUBLISH.md` is the design for serving splits to students).
- So a "skip this segment" button in the player needs: (1) site publish for splits to exist, and
  (2) segment start/end times. The honest source of times is the Whisper word timings the burn
  already has (`take-transcript.ts` / `short-captions.ts`): a frame's prompter lines can be
  matched against the transcript to find when the Up-Next frame started. Propose before
  building (Prompt 5).

## Conventions (read before editing)

- Fail loud. No silent fallbacks. Additive migrations only, listed as "SQL LEE MUST RUN".
- Module-scope callables on the canvas/render path are `function` declarations
  (`components/canvas/tdz-graph.test.ts` pins it).
- Every file starts with a header comment recording decisions and Lee's words — keep that.
- Run `bunx tsc --noEmit` and `bun test <dir>` per item; the full suite has one known failure
  (`bolt-palette.test.ts` "distinct accents").
- Push: `git fetch origin main && git rebase origin/main && git push origin HEAD:main`. Commit
  with `--only <paths>`; another session may be editing `/learn` — don't touch
  `src/components/learn/*` or `src/routes/learn.tsx` from this session.
- Browser: dev server is launch config `film-camera-dev` on :8097. Resize before measuring.
- Editor gotchas from 2026-09-10: the strip is a sticky overflow-x box (anything positioned
  inside it clips — the hover peek is a fixed layer); `usePlan` fetches once per set and
  reconciles cards locally (do not re-fetch on ceqs change — it raced the debounced save);
  publish rows are keyed by split seat (`setId`, `setId#2`…) and re-keyed on cut/wizard via
  `components/v3/publish-rekey.ts`.

## Small Editor items still open (do these first, they're quick)

1. **Insert a slide from the slide preview**, not only from the spine gap: a "＋ add after this"
   button under the preview (SlidePane) opening the same kinds chooser the gap uses
   (`gapKinds()` in ReviewDeck → `insertAfter(sel.id, kind, patch, true)`).
2. **Summary split gate (later):** a split can be marked `summary`; the player recommends
   watching the topic's cram videos first (same soft-gate pattern as Practice on /learn).

## The end-of-topic frames — revised prompts

These replace the generic prompts. Prompt 1 is already answered above, so start at Prompt 2.
Lee's priority: **the A = L + E rubric first** (he needs it on the cram path). Topic Complete,
Up Next, Survibes and the skip button come later.

### Prompt 2 — the Equation Rubric slide kind (`rubric`)

Add a frame kind `rubric` to `BLAST_FRAME_KINDS`, the zod schema, `FRAME_LABEL` ("Rubric"),
`KIND_COLOR`, `INSERT_KINDS` (so the gap's "+" and the preview's "add after" offer it), and
`camDefault` (spot `home`, size 0.28 — the rubric is content, camera small). Renderer in
`ContentFrames.tsx` (or a new `RubricFrame.tsx` it imports), drawn through `PhoneFrame` like
every other kind, inside `SAFE`, left of the like/share rail, above the caption rail.

Data on the frame (schema, additive): `rubric: { mode: "ale" | "dc"; text: string; amount:
number; arrows: Record<"A"|"L"|"E"|"Rev"|"Exp", ("up"|"down")[]>; show: "arrows" |
"amounts"; equityEffect: boolean }`. Only `mode: "ale"` renders; `dc` (debit/credit,
normal-balance (+/−) rubric) is reserved and refused loudly for now.

Layout (match `end-of-topic-frames.html` "Rubric tool"): an L. Top row A = L + E as three boxes
with the operators between; under E, two smaller dashed boxes Rev then Exp joined by short amber
connectors; the open space left of Rev/Exp holds the "Transaction" chip, the transaction text,
and the balance line at the bottom. Cell state: blank / ↑ / ↓ / ↑↓; up = amber, down = light
blue; a box with arrows gets a brighter border; arrows pop in (scale) — on the film surface,
key the pop off `progress` so the spacebar reveals A, then L, then E, then Rev/Exp (left to
right). "Arrows + amounts" shows the amount beside each arrow and the balance line reads
"⚖ Balanced" or "⚖ Off by $X" using A = L + E + Rev − Exp. Equity-effect toggle (off by
default): when on and E is empty, E shows a faded arrow derived from Rev (↑→E↑) and Exp
(↑→E↓). Respect reduced motion.

Authoring (the Editor panel for this kind, `SlideEditor`): clicking a box cycles blank → ↑ →
↓ → ↑↓ → blank; a text field, an amount field, the show toggle, the equity checkbox, and a
preset row with these eight, applied on click: owner invests $10,000 (A↑ E↑); borrow $5,000
(A↑ L↑); buy $800 supplies with cash (A↑↓); $1,200 services on account (A↑ Rev↑); pay $600
rent (A↓ Exp↑); $1,000 cash for work due next month (A↑ L↑); $500 dividend (A↓ E↓); pay $2,000
on loan (A↓ L↓). Pure logic (cycle, derived E, balance) in `components/blastoff/rubric.ts`
with tests. Stop with a screenshot of the block on a frame in both display settings, and the
gap's "+" showing "Rubric".

### Prompt 3 — Topic Complete and Up Next (later)

Two kinds, `topic_done` and `up_next`, full-frame (`FULL_FRAME_KINDS`), camera `corner`
bubble. Topic Complete: the small wordmark top-left, chip "Topic complete", the topic's name,
a segmented charge bar (one segment per topic in the exam, done ones filled amber→red, the
newest animating its fill), "X of Y topics charged", then a card: chip "Your move", "Now go
practice", one line, red "Start practice questions". Topic name and X/Y come from the bank
(`topicOfSet`, the exam's topics in order) — never typed. Up Next: small wordmark, chip "Up
next", the NEXT topic's name (`nextSetAfter`), a subtitle, and the rubric block in arrows mode
auto-cycling borrow → supplies → services on account → rent every ~3 s; marks the start of a
skippable segment (a `segment: "skippable"` flag on the frame; see Prompt 5). Screenshot both.

### Prompt 4 — Survibes (later)

Kind `survibes`, full-frame. Opens on the normal `SurviveWordmark` large and centred; at ~0.7 s
a white-blue flash, a big split red/blue bolt strikes in from above, the "ve" span flips on its
X axis and returns as "bes" (the wordmark is DOM text — wrap the tail), the background lights
red-left/blue-right with faint scanlines; then the wordmark glides to the top and the camera
(large rounded box, left) and a LARGE captions box (full safe width under the camera, ~29px
captions — branch `captionRailRect` on this kind) fade in. Props via progress: a step pops a
card over the top area (first prop: chip "Memorize this", "Luca Pacioli", "The 'Father of
Accounting.' Exams love it.", timeline 3200 BC · 1300s · 1494 · Now) while the wordmark shrinks
to the corner and the camera to a small circle. Authoring-only 2:00 countdown on the film
surface (main window chrome only — never in the pop-out or the export; the prompter/chrome
escape is `data-sa-film-chrome`). Reduced motion → settled state.

### Prompt 5 — skip button in the student player (after site publish exists)

Proposal first: segment start/end from Whisper word timings matched to the Up Next frame's
prompter lines, stored on the split's `set_publish_status` row (`segments` jsonb, additive
migration), read by `CramPlayer` to show "⏭ Skip to <next topic>" while inside the segment.
Wait for Lee's approval before touching the pipeline.
