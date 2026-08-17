// BOSS REVEAL — the flash, the label, the drop, then calm.
//
// Ctrl+Alt+Click marks a CEQ as a boss and fires this. The shape of it, from
// Lee's brief: dramatic on entry, calm at rest, because he has to keep talking
// over this card for a minute afterwards.
//
//   0ms    the bolt FLASHES in — bright, fast, scaling up — with the label
//   0ms    the 808 hits ON the flash (not after it)
//   ~700ms it SETTLES: bolt and label fade, the card keeps boss styling
//
// THE HARD CONSTRAINT, and the reason this file exists rather than a few inline
// styles: nothing in the reveal may cover the stem or the choices, at any point.
// This is a question a student has to read. So the flash lives in the MARGIN
// beside the card, and `revealZone` computes that margin per orientation — a
// 9:16 frame is much narrower, and a flash sized for landscape would sit on top
// of the text there.

import { isVertical, type Orientation } from "./orientation";

/** Total reveal, entry to settled. Lee's brief: 600–900ms. */
export const REVEAL_MS = 760;
/** The flash itself — fast and bright; the rest of the window is the settle. */
export const FLASH_MS = 260;
/** The drop must land ON the flash. Anything above ~40ms reads as a mistimed cue. */
export const DROP_OFFSET_MS = 0;

export type BossLabel = "BOSS" | "FINAL BOSS";

/** FINAL BOSS is automatic, never a separate control: the last CEQ in the set is
 *  the final boss by definition, and a manual flag would be one more thing to
 *  forget. Note frames don't count — the last *question* is what matters.
 *  Pure. */
export function bossLabel(ceqId: string, ceqOrder: string[]): BossLabel {
  const last = ceqOrder[ceqOrder.length - 1];
  return last && last === ceqId ? "FINAL BOSS" : "BOSS";
}

export interface Rect { x: number; y: number; w: number; h: number }

/** WHERE THE FLASH IS ALLOWED TO LIVE — the margin outside the card, never over
 *  it. Returns null when there is no room, and the caller then skips the flash
 *  rather than drawing it across the question.
 *
 *  Landscape: the card sits centred with room either side, so the flash takes the
 *  right margin. Vertical: the card spans nearly the full width, so the only safe
 *  band is ABOVE it — which is also where the eye already is when a card deals. */
export function revealZone(frame: { w: number; h: number }, card: Rect, o: Orientation): Rect | null {
  const MIN = 90; // below this a flash is a smudge, not a callout
  if (isVertical(o)) {
    const band = card.y;                       // the gap above the card
    if (band < MIN) return null;
    return { x: 0, y: 0, w: frame.w, h: band };
  }
  const rightEdge = card.x + card.w;
  const right = frame.w - rightEdge;
  if (right >= MIN) return { x: rightEdge, y: card.y, w: right, h: card.h };
  if (card.x >= MIN) return { x: 0, y: card.y, w: card.x, h: card.h };  // try the left
  return null;
}

/** Does a proposed flash rect keep clear of the card? The test that encodes the
 *  hard constraint — if this ever returns false, the reveal is covering text. */
export function clearsCard(zone: Rect, card: Rect): boolean {
  return zone.x + zone.w <= card.x || zone.x >= card.x + card.w
    || zone.y + zone.h <= card.y || zone.y >= card.y + card.h;
}

/** The label's size for an orientation. It has to read like a game callout, so
 *  it is big — but a vertical frame's safe band is short, so it steps down. */
export function labelSize(o: Orientation, zone: Rect): number {
  const base = isVertical(o) ? Math.min(zone.h * 0.42, zone.w * 0.13) : Math.min(zone.w * 0.34, zone.h * 0.16);
  return Math.max(22, Math.round(base));
}

/** The CSS keyframes. Kept here beside the timings so the two can't drift —
 *  a 760ms constant with a 1200ms animation would settle long after the sound. */
export const BOSS_REVEAL_CSS = `
@keyframes sa-boss-flash {
  0%   { opacity: 0; transform: scale(0.55) rotate(-8deg); filter: brightness(2.4); }
  38%  { opacity: 1; transform: scale(1.12) rotate(2deg);  filter: brightness(1.6); }
  100% { opacity: 1; transform: scale(1)    rotate(0deg);  filter: brightness(1); }
}
@keyframes sa-boss-label {
  0%   { opacity: 0; transform: translateY(10px) scale(0.9); letter-spacing: 0.02em; }
  40%  { opacity: 1; transform: translateY(0)    scale(1.04); letter-spacing: 0.22em; }
  100% { opacity: 1; transform: none;                        letter-spacing: 0.16em; }
}
@keyframes sa-boss-settle { to { opacity: 0; transform: scale(0.86); } }
.sa-boss-flash { animation: sa-boss-flash ${FLASH_MS}ms cubic-bezier(0.16,1,0.3,1) both,
                            sa-boss-settle 220ms ${REVEAL_MS - 220}ms ease-in both; }
.sa-boss-label { animation: sa-boss-label ${FLASH_MS}ms cubic-bezier(0.16,1,0.3,1) both,
                            sa-boss-settle 220ms ${REVEAL_MS - 220}ms ease-in both; }
`;
