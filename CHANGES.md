# vertical-filming — 9:16 frames, capture window, mode toggle

> **This branch stacks on `studio-tease-mode`.** Both edit `CeqPreviewer.tsx`, so
> branching vertical off `main` would have conflicted immediately. Merge
> `studio-tease-mode` first; its changelog is the second half of this file.

## The supersession, recorded

**9:16 publications are filmed NATIVELY VERTICAL.** The earlier stitch spec had a
`ReframeDef` that composited a vertical from the 16:9 source. That renderer was
never built and now never will be — this branch removes the reason for it.

The publish gate changed to match. It used to ask *"does this 9:16 have an
authored reframe?"*; it now asks *"was this actually shot vertical?"*:

| gate | level | when |
|---|---|---|
| `framing/not-vertical` | **block** | every clip in a 9:16 cut was filmed landscape |
| `framing/mixed-orientation` | **block** | some were — a mixed cut letterboxes mid-video |
| `framing/unknown-orientation` | confirm | clips predate the field; confirm by eye |

`ReframeDef` stays as a type so the plan doc still reads, but nothing constructs
one.

## 1. Orientation as a first-class property

[`orientation.ts`](src/components/canvas/orientation.ts) is the one place that
knows what a frame's shape means — capture size, authoring frame, type scale,
composition bands, safe zones, exhibit fit. All pure, all unit-tested.

[`orientation-store.ts`](src/components/canvas/orientation-store.ts) holds the
workspace's current shape. Module-level, not React state, for the same reason the
slate is: the studio window and the capture popout are **one React tree**
(`PanelPopout` portals into the popout document), so a prop would have to thread
through the previewer, the film portal and the takes inbox — three places to
forget. It persists across reloads, because a silent revert to landscape
mid-session means filming the rest of a set in the wrong shape without noticing.

**The law, enforced by test:** orientation is a *layout* concern, never a content
fork. The CEQ, choices, memos, callouts, exhibits, highlights, boss styling and
spine are identical in both. One CEQ, two ways of drawing it.

Toggle lives in the Filming Mode status strip: `▭ 16:9` / `▯ 9:16`, default 16:9.

## 2. The vertical layout — retypeset, not shrunk

- **Composition:** card band on top, camera band below, clamped to Lee's 55–65%
  and always summing to exactly 1 (no gap, no overlap). Default 60/40.
- **Type steps UP:** `TYPE_SCALE["9:16"] = 1.35`. A 9:16 frame is 900 units wide
  against 1600, so landscape-sized type would render ~44% narrower in absolute
  terms and read as fine print at arm's length.
- **A legibility floor** (`stem: 30`, `choice: 26`) that nothing may go under —
  a stem that can't fit above it wraps rather than shrinking.
- **Safe zones per orientation.** Vertical's end-screen zone is the *social
  chrome* band: full width along the bottom, where TikTok/Reels/Shorts stack the
  caption and handle. `clearsEndScreen()` catches a punchline that would sit
  under one.
- **Exhibit reflow** (`exhibitFit`) lives in the shared layer, so the T-account,
  JE and trial-balance cards inherit it. Scales an exhibit down to the card band
  and **never past 1×** — blowing a diagram up past its authored size only
  softens it.

## 3. The vertical capture window

`captureCssSize` / `isCaptureExact` / `snapCaptureSize` / `captureFeasibility` all
take an orientation and default to landscape, so every existing call site is
unchanged. In 9:16 the window opens and snaps to **1080×1920 physical**, with the
same devicePixelRatio handling — verified in tests at 1×, 1.5× and 2× scaling.

The badge judges against the *active* orientation; a vertical window measured
against 1920×1080 would have read "wrong" while being exactly right.

The slate, the film keymap and the whole F9 → F10 loop are untouched and
orientation-agnostic by construction — they never knew the frame's shape.

## 4. Takes are tagged

`TakeRecord.orientation` is stamped **at ingest**, the only moment the shape is
known for certain, and rides onto the attached `TakeRef` so the publish gate can
see it. Vertical takes show a `9:16` chip in the rail, so a mixed pass is visible
long before it reaches the stitcher. Absent = `16:9`, which is what everything
filmed before today is.

## Verification

**Verified live in the running app:** the toggle renders in the Filming Mode
strip, switches, persists to `sa-orientation`, and shows the confirmation note.

**Verified by test** — 36 new tests in
[`orientation.test.ts`](src/components/canvas/orientation.test.ts), 1122 total,
0 fail, `tsc` clean:
frame/capture aspect agreement, type floor, band clamping and summation, safe
zones, exhibit fit, pixel-exactness at three scalings, and the wiring pins.

### NOT verified — needs you, and I won't claim otherwise

1. **The frame visually reshaping.** The local scene has no clips, so the
   previewer didn't mount for me to measure. The wiring is pinned by test
   (`frameW={isVertical(orient) ? frameSize(orient).w : frameW}`) but I have not
   seen a 9:16 frame drawn.
2. **1080×1920 in OBS at Reset Transform**, and razor-sharp text in a paused
   recording. The math is tested; the window is not.
3. **Phone legibility** — the explicit "view a 1080×1920 render on an actual
   phone" check. `TYPE_SCALE` of 1.35 and the floors are a considered starting
   point, not a measured one. Expect to tune `TYPE_SCALE` and `MIN_TYPE` after
   the first real look; they are two constants in one file precisely so that's a
   one-line change.
4. **The 5-CEQ vertical F9/F10 loop.** Needs OBS.
5. **Exhibit reflow on camera** — `exhibitFit` is applied by the shared layer but
   the cycle card consumes it via the shared shell (see below) — but how the
   scaled diagram reads on a phone is unverified.

### Exhibit reflow — wired (the gap from the first commit is closed)

`exhibitFit` is applied by **`ExhibitShell`**, so every exhibit card inherits it
by using the shell. `CycleNode` still knows nothing about orientation — pinned by
test — which is what keeps the future T-account / JE / trial-balance cards free
of it too.

**Landscape is bit-for-bit unchanged:** in 16:9 the fit is exactly `1` and no
transform or wrapper is emitted at all. Lee films landscape today, so the
vertical work must not be able to disturb it.

The inner box keeps its **natural** size and only the paint scales — the card's
own maths (pill percentages, the arc viewBox) are computed against the authored
size, so scaling the outer box instead would desynchronise the pills from the
arcs. The outer box reports the scaled size, so neighbours don't overlap it.

Still not eyeballed: how the scaled cycle actually reads on a phone.

---

# studio-tease-mode — note-frame eyebrow + tease mode

## 1. Note frame eyebrow

The note card's eyebrow was the topic name (`THE ACCOUNTING CYCLE`). It is now the
static string **`FOUND ON YOUR EXAM`** on every note frame, regardless of topic,
exam, school or professor, from one constant in
[`frame-copy.ts`](src/components/canvas/frame-copy.ts).

Applied to both the live frame and the film-stack standins. CEQ cards keep their
topic kicker in student view — a different card doing a different job.

**Why a constant:** anything in that file gets *filmed into footage*, and footage
that names a school can only ever be sold to that school. Exam number, university
and professor are stamped by the HTML player at watch time.

## 2. Tease mode

Clicking a step cycles `normal → highlighted → blurred → normal`. One click, one
advance, fixed order, looping — no modifiers, no mode, no context menu, because
the gesture happens on camera. Per node and independent.

Built in the **shared exhibit layer**, so future exhibit cards inherit it by
declaring. `CycleNode` gained paint only and still has no behaviour code.

| state | treatment |
|---|---|
| `highlighted` | amber border + bloom, **1.06** scale so it reads at thumbnail size |
| `blurred` | `blur(11px) contrast(0.72)` **on the text only** — crisp border at 0.9 opacity |

The blur radius exceeds the pill's glyph height and the contrast drop stops
letterforms reassembling when a viewer zooms. Transitions 180ms, no bounce. A
blurred node isn't also dimmed (that hides rather than teases), and blurring
alone doesn't dim the others — only a *lit* node drives the recede.

**Session-only:** no `localStorage`, no card write, pinned by test.

## 3. Reset binding — `0`

Every key bound in the canvas today:

```
/  @  Arrows  Backspace  C/c  D/d  Delete  Enter  Escape  F/f  F7  F8  F10
PageDown  PageUp  R/r  Tab  V/v  \  `  ~
```

- **`Escape` — rejected.** Already clears memo selection (`CeqPreviewer.tsx:2012`)
  and closes every popover and inline editor.
- **`0` — chosen.** No digit key is bound anywhere in the canvas. Far from
  `` ` ``, and "back to zero" says what it does.

`0` is narrow on purpose: `clearExhibitHighlights()` and nothing else. `` ` ``
remains the full global wipe, unchanged and pinned. Bound in both keymaps.

## 4. One law I narrowed — flagged

Two tests banned *any* transform in the emphasis path, written after a
pop-to-centre spotlight **resized the card mid-take**. Lee's spec asks for a
slight scale, so the tests now ban the *harm* rather than the word:
`translate`/`width`/`height`/`top`/`left` stay banned; one bounded `scale` from a
shared constant, asserted `≤ 1.1`, with the card pinned to exactly one `scale(`.
A pill is absolutely positioned, so scaling it cannot change the card's box.

Set `EXHIBIT_GLOW.litScale` to `1` for zero motion; both tests still pass.

**Not verified:** the blurred-node zoom check and the on-camera screenshots need
a human at 1080p.
