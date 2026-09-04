// CEQ GEOMETRY RESOLUTION — the ONE place that decides where a question's card and
// its chain memos sit. Three surfaces used to answer this question separately (the
// Studio previewer, new-memo placement, and the canvas deal), and they had already
// drifted apart: the previewer walked ACTIVE slots while the deal used raw indices,
// so a set with a switched-off slot previewed differently from how it dealt.
//
// THE MODEL — template vs instance:
//   TEMPLATE  deck.layout      per SET. The rack Lee sculpts in Question 0. A
//                              starting arrangement, not live-linked state.
//   INSTANCE  CeqCard.geom     per QUESTION. What actually renders. Written only by
//                              moving/resizing that question's own card or memos.
// Resolution is always `instance ?? template ?? generated fallback`. An absent
// instance therefore renders EXACTLY as it did before instances existed — which is
// why the split needs no data migration and nothing authored shifts.
import type { CeqInstanceGeom, DeckLayout, DeckSlotLayout } from "./types";

/** A resolved spot: frame-local position + the scale the content renders at. */
export interface Spot { x: number; y: number; scale: number }

const SLOT_H = 150; // nominal chip height at scale 1 — the overflow stacking step

// ---- THE FRAME PRIMITIVES ---------------------------------------------------
// These lived in CeqPreviewer.tsx and were imported back here, which made
// CeqPreviewer ↔ ceq-geom a RUNTIME IMPORT CYCLE. A cycle is only a latent bug
// until the bundler happens to order the two modules unfavourably inside a
// chunk — then one module's consts are still in their temporal dead zone when
// the other's code runs, and the previewer dies with "Cannot access X before
// initialization" in production only (dev serves unbundled ESM, so it never
// reproduces there). They are pure geometry with no React in them, so this is
// where they always belonged.

export const CARD_W = 560, CARD_H = 480;

export function dealCentre(fw: number, fh: number, scale = 1): { x: number; y: number } {
  return { x: Math.max(0, Math.round((fw - CARD_W * scale) / 2)), y: Math.max(0, Math.round((fh - CARD_H * scale) / 2)) };
}

/** THE VERTICAL DEFAULT (Lee, 2026-09-03: "maybe we should increase the size
 *  of the CEQ card? … it needs to just be fitting the vertical space better.
 *  It's hard to see on a phone"). With no saved spot, a 9:16 frame deals the
 *  card at 1.3× — 728 of 900 wide — instead of 560 on 900. A saved instance
 *  or template still wins, so "apply placement to all" is untouched. */
export const VERTICAL_DEAL_SCALE = 1.3;
// A function declaration on purpose (tdz-graph ratchet: no module-scope arrow
// callables on the render path).
export function defaultCardScale(fw: number, fh: number): number { return fh > fw ? VERTICAL_DEAL_SCALE : 1; }

/** THE SLOT PALETTE (Lee) — a set's baseline is a fixed rack of {@link PALETTE_N}
 *  slots running down the RIGHT side of the frame, evenly spaced and guaranteed not
 *  to overlap (the step is never smaller than a slot's own height). Generated, never
 *  hand-placed, so two slots can't be born at the same coordinate. Lee then drags
 *  any slot where he wants it and resizes it — a bigger slot is simply one that fits
 *  bigger content. */
export const PALETTE_N = 5;

export function paletteSlots(fw: number, fh: number, n: number = PALETTE_N): { x: number; y: number; scale: number }[] {
  const c = dealCentre(fw, fh);
  const x = Math.min(fw - 210, c.x + CARD_W + 70);
  const top = 20;
  const span = Math.max(SLOT_H, fh - top - 20 - SLOT_H); // room the rack can use
  const step = n > 1 ? Math.max(SLOT_H + 12, Math.round(span / (n - 1))) : 0;
  return Array.from({ length: n }, (_, i) => ({ x, y: top + i * step, scale: 1 }));
}

export function defaultMemoPos(fw: number, fh: number, i: number): { x: number; y: number; scale: number } {
  return paletteSlots(fw, fh)[Math.min(i, PALETTE_N - 1)];
}

/** The set's slot rack: whatever is saved, padded out to the full palette with
 *  INACTIVE generated slots. Saved slots keep their geometry and their on/off state;
 *  layouts predating the palette have no `off` flag, so all of their slots stay
 *  active and nothing moves. */
export function rackOf(saved: DeckSlotLayout[] | undefined, fw: number, fh: number): DeckSlotLayout[] {
  const gen = paletteSlots(fw, fh);
  return gen.map((g, i) => saved?.[i] ?? { ...g, off: true }).concat((saved ?? []).slice(PALETTE_N));
}

/** Only ACTIVE slots take placements, in order. */
export function activeSlots(rack: DeckSlotLayout[]): DeckSlotLayout[] {
  return rack.filter((s) => !s.off);
}


/** Where THIS question's card sits: its own spot, else the set's template card,
 *  else the deal centre. */
/** LAYOUT OPT-OUT gate — the ONE place "does the template apply to this frame"
 *  is decided. Pass a card's template through this at every resolve/apply site. */
export function templateFor<T>(ignoreLayout: boolean | undefined, template: T | undefined): T | undefined {
  return ignoreLayout ? undefined : template;
}

export function resolveCardSpot(instance: CeqInstanceGeom | undefined, template: DeckLayout | undefined, fw: number, fh: number): Spot {
  const s = instance?.card ?? template?.card;
  if (s) return { x: s.x, y: s.y, scale: s.scale ?? 1 };
  const scale = defaultCardScale(fw, fh);
  return { ...dealCentre(fw, fh, scale), scale };
}

/** Where THIS question's memo at FLAT chain index `i` sits.
 *  1. the question's own instance slot, if it has one;
 *  2. else the i-th ACTIVE template slot (switched-off slots are skipped — on/off is
 *     a set-level decision, so it is read from the template even for an instance);
 *  3. else, past the last active slot, stacked below it at that slot's size;
 *  4. else the generated palette position.
 *  Never returns the same spot for two different indices. */
export function resolveMemoSpot(instance: CeqInstanceGeom | undefined, template: DeckLayout | undefined, i: number, fw: number, fh: number): Spot {
  const own = instance?.memoSlots?.[i];
  if (own) return { x: own.x, y: own.y, scale: own.scale ?? 1 };
  const live = activeSlots(rackOf(template?.memoSlots, fw, fh));
  const slot = live[i];
  if (slot) return { x: slot.x, y: slot.y, scale: slot.scale ?? 1 };
  const last = live[live.length - 1];
  if (last) return { x: last.x, y: last.y + Math.round(SLOT_H * (last.scale ?? 1)) * (i - live.length + 1), scale: last.scale ?? 1 };
  return { ...defaultMemoPos(fw, fh, i), scale: 1 };
}

/** Fold one moved/resized element into a question's instance geometry, leaving every
 *  other element of that question alone. `slot < 0` (or undefined) means the card. */
export function withInstanceSpot(instance: CeqInstanceGeom | undefined, slot: number | undefined, spot: Spot): CeqInstanceGeom {
  const next: CeqInstanceGeom = { card: instance?.card, memoSlots: instance?.memoSlots ? [...instance.memoSlots] : undefined };
  const rounded: DeckSlotLayout = { x: Math.round(spot.x), y: Math.round(spot.y), scale: spot.scale };
  if (slot == null || slot < 0) { next.card = rounded; return next; }
  const slots = next.memoSlots ? [...next.memoSlots] : [];
  slots[slot] = rounded;
  next.memoSlots = slots;
  return next;
}

/** STAMP a question's instance from the template — "apply the layout to this
 *  question". `chainCount` = how many chain memos the question actually has, so we
 *  only write the slots it uses. Used by apply-to-all and by a deal in Layout mode. */
export function stampFromTemplate(template: DeckLayout | undefined, chainCount: number, fw: number, fh: number): CeqInstanceGeom {
  const card = resolveCardSpot(undefined, template, fw, fh);
  const memoSlots: DeckSlotLayout[] = [];
  for (let i = 0; i < chainCount; i++) { const s = resolveMemoSpot(undefined, template, i, fw, fh); memoSlots[i] = { x: s.x, y: s.y, scale: s.scale }; }
  return { card: { x: card.x, y: card.y, scale: card.scale }, memoSlots };
}
