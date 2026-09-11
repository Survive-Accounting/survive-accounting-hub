# /learn — the cream shell, the study rail and the cram machine (report, 2026-09-11)

Lee's 09-11 brief, built in five slices, each pushed to main. This is the report the brief
asked for, in its order.

## Which SVG became which variant

| file Lee sent | variant | what it is |
|---|---|---|
| `image (1).svg` | `open` | open-top abacus on the deck, one tall stamp post, peach body |
| `simple-premium-isometric-vector-illustration-of-a- (1).svg` | `compact` | boxed machine, abacus in a window, twin posts on top, slate |
| `simple-premium-isometric-vector-illustration-of-a-.svg` | `conveyor` | rounded dark body, the longest belt, the winding line |

All three keep the 2048×2048 viewBox. Nothing was redrawn. The c2pa metadata was stripped.

## Files / components

- `src/components/learn/cram-machine-data.ts` — generated: every path's `d` / fill / opacity in
  source order, plus the gradient defs, per machine. Regenerate from the SVGs; do not hand-edit.
- `src/components/learn/CramMachine.tsx` — the inline SVG component (`CramMachine`, memoised),
  the part maps (`MACHINES`), the bolt matrices (`BOLT_PLACEMENTS`, `boltMatrix`), the motion CSS
  (`CRAM_MACHINE_CSS`), `machineForSection`.
- `src/components/learn/PracticeCard.tsx` — the card: machine on top, "Practice" / "~10 min",
  idle float, hover / focus / touch run, reduced motion.
- `src/components/learn/StudyRail.tsx` — the row: `[...videos, practice]`, scroll-snap, hidden
  scrollbar, fade + arrow only on real overflow, one card width per tier (`--lk-card-w`).
- `src/components/learn/LearnHome.tsx` — rows are rails; the first heading is "Easy Points for
  Exam 1" with "start here ↓" under it on every tier; later sections get a one-time entrance.
- `src/components/learn/LearnTop.tsx` — the exam pills are gone; "Exam 1 ▾" is a listbox.
- `src/components/learn/learn-theme.ts` — `DEFAULT_LOOK = "cream"`; eight looks stay behind `?look=`.
- `src/components/learn/learn-gate.ts` — `QUICK_ROUND_SIZE`, `practiceTimeLabel`, `examName`.
- `src/components/site/PracticeStage.tsx` — two opt-in props, `roundSize` and `guidance`; every
  other surface (landing, practice-demo) renders exactly as before.
- `src/components/learn/CramPlayer.tsx` — passes the round size and "Next topic →" to the drawer.
- Removed: `PracticeArt.tsx` (the gears placeholder) and its tests.
- Tests: `cram-machine.test.ts` (part maps, oranges, bolt matrix inside the paper, rotation),
  `learn-redesign.test.ts` (the Final's line, the quick round), `learn-gate.test.ts` (the looks).

## How the parts are grouped, and why not `<g>`

Recraft exported flat paths whose source order IS the z-order; moving a path into a later group
would paint it over things it used to sit under. So each path keeps its place and carries
`data-part` instead: `stamp-head`, `stamp-base`, `abacus-frame`, `abacus-beads`, `power-line`,
`power-node`, `input-tray`, `incoming-paper`, `output-tray`, `finished-paper`, `success-mark`,
`placeholder`; anything unlisted is the machine body. The CSS animates by part with translate
only, which needs no transform origin. The `placeholder` (the orange rectangle Recraft drew
where the logo goes) is never rendered; the real bolt is inserted at exactly that z-index.

## How campus primary is injected

`CramMachine` sets `--campus-primary` / `--campus-secondary` on the `<svg>` from the school's
`c1` / `c2` (the brand's `BOLT_LIT` / `BOLT_SHADE` when no school). Only paths that were
Recraft's orange AND belong to `power-line` / `power-node` are painted `var(--campus-primary)`;
the node glow circle too. Cream, navy/charcoal, off-white and the illustration's green are
untouched — the success check stays green.

## How the real Survive bolt is inserted, and the transform per machine

`BOLT_OUTER` / `BOLT_RIGHT` from `canvas/brand` — the same paths BoltBoil and the wordmark draw —
in a `<g transform="matrix(…)">`. `boltMatrix(paper)` takes the orange rectangle's top, right
and left corners: top→right is bolt-x, top→left is bolt-y (the sheet's two in-plane axes), one
uniform scale fits the bolt inside with a 14% margin, centred on the rectangle. Rendered as a
sticker: shadow (offset copy, 22% black, no filter), white keyline, `c1` fill, `c2` seam, and a
gloss rect clipped to the bolt's outline that sweeps once after it lands.

| machine | matrix |
|---|---|
| open | `matrix(0.8195 0.4851 -0.8205 0.4834 1658.5823 1287.0009)` |
| compact | `boltMatrix(MACHINES.compact.paper)` — corners (1643.9,1423.88) (1750.99,1487.44) (1522.88,1492.59) |
| conveyor | `boltMatrix(MACHINES.conveyor.paper)` — corners (1632.74,1498.82) (1726.89,1559.44) (1516.05,1568.32) |

(The matrices are computed at module load and pinned by test: finite, centred, all four bolt
corners inside the rectangle's 10–90% band.)

## The animation sequence (one run, ~1.8 s, CSS keyframes, no library)

| ms | what |
|---|---|
| 0 | card lifts 5px / 1.015; machine scales 1.03 |
| 100–360 | power node lights (campus primary), scale .6 → 1.15 → 1 |
| 150–650 | current — a bright bar clipped to the power line's paths — sweeps along the line |
| 450–850 | abacus beads shift twice |
| 750–1100 | finished paper (and its check) nudges along the belt |
| 950–1270 | stamp head comes down and back |
| 1150–1470 | bolt appears, pops .9 → 1.05 → 1 |
| 1400–1720 | gloss sweeps the bolt |
| 1800 | resting, powered: the bolt stays |

Plays once per hover entry or focus (a `run` counter remounts the animated group). Touch: once
when the card is 60% in view. Reduced motion: no float, no run; the final state from the first
paint. Verified in the pane by sampling computed styles every 250 ms.

## How variants rotate by section

`machineForSection(i) = ["open", "compact", "conveyor"][i % 3]`, `i` = the topic's index on the
page. Never random. The idle float's phase is also `-(i × 0.9 s)`, so cards never bob together.

## The quick round

`QUICK_ROUND_SIZE = 15`, `SECONDS_PER_QUESTION = 40` → the card says "~10 min" for a full round,
"~5 min" for an 8-question bank, never the bank size. `PracticeStage` takes `roundSize`: the
first pass is the first 15 in the set's saved order; "More practice" serves the next 15 and wraps
to the top when the bank is used up; "Retry round" / "Retry all" replay the current list. All
questions stay in the bank — nothing was deleted or hidden. Practice is still per set: the card
opens the topic's first set with questions (as before); a topic-wide round is post-launch.

## How the recommended completion actions are determined

`guidance` on `PracticeStage` (from CramPlayer): `m` = questions missed in this pass.

- `m > 0`: **Recommended · Retry missed (m)** › Next topic → › More practice · Retry all
- `m = 0`: **Recommended · Next topic →** › More practice (or Retry round when the bank has no
  more) › Retry round

"Next topic →" opens the first set of the next topic in the exam's order (CramPlayer's
`nextTopicIndex`); on the last topic it becomes "Back to the videos". Verified in demo mode: a
clean 2-question pass showed Recommended / Next topic → / Retry round, and the button moved the
player from the first topic's set to the next topic's.

## Intentionally deferred

- A topic-wide round across sets (practice is per set today; the card opens the first set with
  questions). Needs a product call on how to key coverage and progress.
- `estimatedPracticeMinutes` as a stored per-section field — derived from the bank today.
- "97 questions available" inside the practice drawer (kept off the card, as asked).
- The `?looks=1` picker and the seven other looks stay in the tree until Lee says remove them.
- The email-gate blur on later topics is unchanged (launch is tomorrow); the calmer disabled
  state from the email's §12 is after launch.
- Mid-practice hype videos: not built (as asked).
