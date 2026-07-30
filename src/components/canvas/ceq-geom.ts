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
import { activeSlots, dealCentre, defaultMemoPos, rackOf } from "./CeqPreviewer";
import type { CeqInstanceGeom, DeckLayout, DeckSlotLayout } from "./types";

/** A resolved spot: frame-local position + the scale the content renders at. */
export interface Spot { x: number; y: number; scale: number }

const SLOT_H = 150; // nominal chip height at scale 1 — the overflow stacking step

/** Where THIS question's card sits: its own spot, else the set's template card,
 *  else the deal centre. */
export function resolveCardSpot(instance: CeqInstanceGeom | undefined, template: DeckLayout | undefined, fw: number, fh: number): Spot {
  const s = instance?.card ?? template?.card;
  if (s) return { x: s.x, y: s.y, scale: s.scale ?? 1 };
  return { ...dealCentre(fw, fh), scale: 1 };
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
