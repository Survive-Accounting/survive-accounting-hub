# studio-tease-mode — note-frame eyebrow + tease mode

## 1. Note frame eyebrow

The note card's eyebrow was the topic name (`THE ACCOUNTING CYCLE`). It is now the
static string **`FOUND ON YOUR EXAM`** on every note frame, regardless of topic,
exam, school or professor.

One constant, one file: [`src/components/canvas/frame-copy.ts`](src/components/canvas/frame-copy.ts).

```ts
export const NOTE_EYEBROW = "FOUND ON YOUR EXAM";
```

Applied in both places a note frame is drawn — the live frame and the film-stack
standins — so a note never shows the topic in either. CEQ cards keep their topic
kicker in student view; that is a different card doing a different job, and the
prompt scoped this to note frames.

Everything else about the card is untouched: position, cream stock, amber
dog-ear, quotation marks, type treatment.

**Why it's a constant and not a prop:** anything in that file gets *filmed into
footage*. Footage that names a school can only ever be sold to that school. Exam
number, university and professor are stamped by the HTML player at watch time.

## 2. Tease mode

Clicking a step in the accounting cycle now advances it through three states, in
one fixed order, looping:

```
normal  →  highlighted  →  blurred  →  normal
```

One click = one advance. No modifiers, no mode toggle, no context menu — the
gesture has to be predictable while Lee is on camera. States are per node and
independent; any mix across the nine steps is valid.

Built in the **shared exhibit layer**
([`exhibit-highlights.ts`](src/components/canvas/exhibit-highlights.ts) +
[`exhibit-base.tsx`](src/components/canvas/exhibit-base.tsx)), not as a cycle-card
patch — so the T-account, journal-entry and trial-balance cards inherit tease
mode by declaring, exactly like they inherit glow today. `CycleNode` gained only
paint (it reads `ns.scale` / `ns.contentFilter`); it has no behaviour code.

### On camera

| state | treatment |
|---|---|
| `normal` | unchanged |
| `highlighted` | amber border + layered bloom, and a **1.06** scale so it still reads at thumbnail size |
| `blurred` | `blur(11px) contrast(0.72)` **on the text only** — the pill keeps a crisp border at 0.9 opacity, so the viewer sees a step is *there* and can't read it |

The blur is deliberately heavy: the radius exceeds the pill's glyph height
(10–16px), and the contrast drop stops letterforms reassembling when a viewer
pauses and zooms. Transitions are **180ms ease** — fast, no bounce.

A blurred node is *not* also dimmed (that would hide it rather than tease it),
and blurring alone doesn't dim the other steps — only a **lit** node drives the
recede, because hiding one step isn't the same as spotlighting another.

Arrows are unaffected by node state, as specified: an arc still glows only when
*both* its endpoints are lit.

### Persistence

None. State lives in component state, cleared on unmount. No `localStorage`, no
`sessionStorage`, no card-data write — pinned by test, so a refresh always
returns every node to normal.

## 3. Reset binding — the audit

Every key compared anywhere in the canvas today:

```
/  @  ArrowDown ArrowLeft ArrowRight ArrowUp  Backspace  C/c  D/d  Delete
Enter  Escape  F/f  F7  F8  F10  PageDown  PageUp  R/r  Tab  V/v  \  `  ~
```

- **`Escape` — rejected.** Already bound: it clears the memo selection in the
  previewer (`CeqPreviewer.tsx:2012`) and closes every popover, menu and inline
  editor. Overloading it mid-take would dismiss things Lee didn't mean to.
- **`0` — chosen.** **No digit key is bound anywhere in the canvas.** It sits at
  the far end of the number row, well away from `` ` ``, and "back to zero" says
  what it does. (The Idea Bank's 1–7 category keys live inside its own textarea
  and `stopPropagation`, so they never reach the canvas.)

**`0` is deliberately narrow:** it calls `clearExhibitHighlights()` and nothing
else. `` ` `` remains the full global wipe — practice state, spotlights, arrows,
performance arrows, exhibit highlights, text highlights — **completely
unchanged**, pinned by test. `0` is the one you can hit on camera without losing
your memos.

Bound in both keymaps (the recording surface and the film controller), so it
works wherever `` ` `` works.

## 4. One law I narrowed — flagging it explicitly

Two existing tests banned *any* transform in the emphasis path. They were written
after a real incident: a pop-to-centre spotlight **resized the card mid-take**.

Lee's spec asks for a "slight scale up" on a highlighted step, so I narrowed both
tests rather than deleting them. The protection now targets the harm instead of
the word:

- **Still banned:** `translate`, `width`, `height`, `top`, `left` in `nodeStyle`;
  `popToCentre`, `bigScale`, `chainScale` in the card.
- **Now allowed:** one bounded `scale` on the **node**, read from a single shared
  constant and asserted `≤ 1.1`. The card asserts it has exactly *one* `scale(`
  in the whole file and that the pill's translate is still the plain centering
  offset.

A pill is absolutely positioned, so scaling it cannot change the card's box —
the original failure mode can't recur. If you'd rather have zero motion, drop
`EXHIBIT_GLOW.litScale` to `1` and both tests still pass.

## Verification

- `1092 tests, 0 fail` · `tsc` clean · production build clean.
- 24 new tests in
  [`tease-mode.test.ts`](src/components/canvas/tease-mode.test.ts) covering the
  cycle order, independence, immutability, blur strength, transition timing, the
  key bindings, and that nothing persists.

**Not verified:** the blurred-node zoom check and the on-camera screenshots need
a human at 1080p — see the note in the handoff.
