# QUESTION TYPES — the scaffolding plan (v1 target: ORDERING)

Written 2026-08-15 with Lee. The first non-multiple-choice CEQ type is
ORDERING ("put the accounting cycle steps in order 1..N"), but the point is
the FOUNDATION: every decision below is made so the NEXT types (matching
definitions→A/B/C, short answer, fill-the-JE) drop in as declarations, the
way exhibit cards do on `exhibit-base` (see NEW-EXHIBIT-CHECKLIST.md — same
philosophy, applied to question types).

## 1. The data spine — one additive discriminator

`CeqCard.qType?: "mc" | "ordering"` (absent = "mc", so all 256 existing
frames are untouched scene JSON). Every future type extends this union.

ORDERING REUSES `choices` AS ITS ITEMS — this is the load-bearing decision:
- `choices[i].text` = the step's label ("Record journal entries").
- The AUTHORED array order = the CORRECT order (1..N). No second answer
  field to drift out of sync; reordering rows in the editor IS authoring
  the answer.
- `correct` is unused for ordering (readiness exempts it).
- Because items are choices, EVERYTHING built on choices keeps working
  free: memo chains per item, stem chains, spotlights, choice-row editing,
  shuffle machinery, export, publish stitching. This is why not a new
  parallel structure.

## 2. The type registry — behavior by declaration

`question-types.ts(x)` mirrors `stage-elements.tsx`: one registry keyed by
qType, each entry declaring:

```
{
  label: "Ordering",             // Add/convert menus
  usesCorrectFlag: boolean,       // readiness: "exactly one correct" applies?
  authoringHint: string,          // one line shown in the editor
  Face: component,                // the card's interactive face (film+student)
  readiness(card): ReadinessFail[],  // type-specific checks
}
```

The previewer/player render `REGISTRY[card.qType ?? "mc"].Face`; MC's Face
is the existing choices block extracted as-is (zero behavior change, pinned
byte-equivalent by tests). New types NEVER touch CeqPreviewNode again.

## 3. The ORDERING face — authoring, film, student: one component

- Renders the items as pills/rows with an EMPTY ORDER SLOT on the left of
  each ("__" → tap sequence fills 1, 2, 3…).
- INTERACTION (film + student identical — practice = performance):
  * Click items in the order you believe: first click stamps 1, next 2, …
    clicking a stamped item un-stamps it (and renumbers the later ones).
  * Enter = grade: each slot goes green (right position) or scratches red
    (wrong position) — the same right/wrong visual language as MC.
  * ` = reset stamps (the global reset model, temporary state only).
  * 🔀 SHUFFLE — re-jumbles the DISPLAY order (Fisher-Yates over a display
    permutation kept in temporary state; the authored order never moves).
    Students jam it a couple times; film gets a fresh board per take.
  * Tab/Enter chain-walk unchanged — memos chain to items like choices.
- DISPLAY ORDER vs TRUTH: the card stores truth (array order); the face
  holds a `displayPerm` in practice state, seeded shuffled. Grading maps
  through the permutation. Nothing about presentation ever persists.

## 4. Authoring flow

- ⋮ strip menu gains "Question type ▸" (mc / ordering) — a patchQ of qType,
  undoable, convert-in-place (choices stay; correct flags just go dormant).
- The editor's choice rows double as the item list; the existing drag
  handles reorder = author the answer. A small "1 2 3…" ghost column shows
  the authored order so it reads as an ordering question at a glance.
- Readiness (registry-driven): ordering needs ≥3 items, no empty items;
  EXEMPT from "exactly one correct". MC rules unchanged.

## 5. Student side

The player renders the same Face (it already ships the card data). Grading
is client-side state, no schema change; the "Q 14/29" counter, free/paid
gating, and stitch/publish pipelines are type-agnostic already (they read
takes, not choices semantics).

## 6. Build order (each step green + shippable)

1. `qType` + registry + MC extraction (pure refactor, byte-equivalent pin).
2. Ordering Face: stamps + grade + ` reset (no shuffle yet).
3. Shuffle (displayPerm) + readiness rules + the ⋮ type switcher.
4. Seed ONE cycle-order CEQ in the Accounting Cycle set; film-mode pass.
5. Student-player parity check + a /callout-demo-style demo variant.

## Later types ride the same rails (not now)

matching → items + a right-hand column, same stamp interaction;
short-answer → Face with a reveal, no choices; fill-the-JE → Face renders
the JE card as the answer surface. Each = a registry entry + a Face.
