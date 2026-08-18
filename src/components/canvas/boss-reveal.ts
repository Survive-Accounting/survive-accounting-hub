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
// CENTRE STAGE + SCRIM (Lee, 08-17). The reveal takes the middle of the frame and
// dims the card behind it for the beat it lives. The earlier design kept the
// flash out in a free margin so it could never overlap the question — correct on
// paper, but it read as an afterthought stuck to the side of the card. The rule
// it protected still holds, by a better route: the question is obscured for
// ~760ms and fully legible the instant the scrim lifts, so nobody reads through
// a flash.

import { isVertical, type Orientation } from "./orientation";

/** Total reveal, entry to settled. Lee's brief: 600–900ms. */
export const REVEAL_MS = 760;
/** The flash itself — fast and bright; the rest of the window is the settle. */
export const FLASH_MS = 260;
/** The drop must land ON the flash. Anything above ~40ms reads as a mistimed cue. */
export const DROP_OFFSET_MS = 0;

/** LABEL (Lee, 08-17): "Boss Question!" reads as a callout; B O S S alone read
 *  as a logo. FINAL stays automatic on the last CEQ of the set. */
export type BossLabel = "Boss Question!" | "FINAL Boss Question!";

/** FINAL BOSS is automatic, never a separate control: the last CEQ in the set is
 *  the final boss by definition, and a manual flag would be one more thing to
 *  forget. Note frames don't count — the last *question* is what matters.
 *  Pure. */
export function bossLabel(ceqId: string, ceqOrder: string[]): BossLabel {
  const last = ceqOrder[ceqOrder.length - 1];
  return last && last === ceqId ? "FINAL Boss Question!" : "Boss Question!";
}

export interface Rect { x: number; y: number; w: number; h: number }

/** CENTRE STAGE, WITH A SCRIM (Lee, 08-17).
 *
 *  SUPERSEDES the margin rule this file was built around. The original brief
 *  said the reveal must never overlap the stem or the choices, so the flash was
 *  banished to whatever margin was free — and in practice it read as an
 *  afterthought stuck to the side of the card, which is what Lee saw.
 *
 *  The constraint is now satisfied a better way: the reveal takes the CENTRE and
 *  a scrim dims what is behind it for the ~760ms it lives. The question is
 *  deliberately obscured for that beat and fully readable the moment the scrim
 *  lifts, so no student ever has to read through a flash. That is the outcome
 *  the old rule was protecting; the margin was only one way to get it.
 *
 *  Same in both orientations — a centred callout needs no per-shape special
 *  case, which is why the null-zone fallback is gone too. */
export function revealZone(frame: { w: number; h: number }): Rect {
  return { x: 0, y: 0, w: frame.w, h: frame.h };
}

/** How dark the scrim goes at its peak. Enough to push the card back without
 *  blacking the frame — the viewer should still see a question is under there. */
export const SCRIM_ALPHA = 0.72;
/** The label's size for an orientation. It has to read like a game callout, so
 *  it is big — but a vertical frame's safe band is short, so it steps down. */
export function labelSize(o: Orientation, zone: Rect): number {
  // Centred, so it sizes off the frame's WIDTH — the label is one line and the
  // narrow vertical frame is what constrains it.
  const base = isVertical(o) ? zone.w * 0.115 : zone.w * 0.075;
  return Math.max(28, Math.round(base));
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
@keyframes sa-boss-scrim { from { opacity: 0; } to { opacity: 1; } }
@keyframes sa-boss-unscrim { to { opacity: 0; } }
/* The scrim fades UP fast with the flash, then all the way out — the question
   is obscured for the beat and fully legible the instant it clears. */
.sa-boss-flash { animation: sa-boss-flash ${FLASH_MS}ms cubic-bezier(0.16,1,0.3,1) both,
                            sa-boss-settle 220ms ${REVEAL_MS - 220}ms ease-in both; }
.sa-boss-scrim { animation: sa-boss-scrim 140ms ease-out both,
                            sa-boss-unscrim 260ms ${REVEAL_MS - 260}ms ease-in both; }
.sa-boss-label { animation: sa-boss-label ${FLASH_MS}ms cubic-bezier(0.16,1,0.3,1) both,
                            sa-boss-settle 220ms ${REVEAL_MS - 220}ms ease-in both; }
`;
