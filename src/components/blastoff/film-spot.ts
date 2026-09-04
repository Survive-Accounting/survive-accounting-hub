// THE VERTICAL SPOT — where every card of a rip sits on the 9:16 frame.
//
// Lee (2026-09-03), after his first send-to-film: "When I arrive to the canvas
// the slide is off to the top right of the frame … in capture mode the slides
// are still positioned top right, 1/5 or so of the size … I am liking the
// position of CEQ's, detours, found on your exam MUCH more in the position we
// see in /review … more centered … make it big enough that it fits best in the
// shorts zone. I trust you to position this."
//
// The set carried card spots saved in earlier landscape sessions (data.geomV /
// deck.layoutV), so the studio and the capture window honoured a stale corner.
// Send-to-film now stamps THIS spot on every planned frame: centred, dealt at
// the vertical scale, with the card's centre ON the frame's middle — the spot
// the Review phone draws it at, inside the band Shorts and Reels leave clear of
// their own UI. Pure, so it is under test rather than argued about.
import { CARD_H, CARD_W, VERTICAL_DEAL_SCALE } from "@/components/canvas/ceq-geom";

export const FILM_FRAME = { w: 900, h: 1600 } as const;

/** The card's centre sits at this fraction of the frame's height. */
export const CARD_CENTRE_Y = 0.5;

export interface CardSpot { x: number; y: number; scale: number }

export function verticalCardSpot(cardW: number = CARD_W, frameW: number = FILM_FRAME.w, frameH: number = FILM_FRAME.h, scale: number = VERTICAL_DEAL_SCALE): CardSpot {
  const w = cardW * scale;
  const h = CARD_H * scale;
  return {
    x: Math.max(0, Math.round((frameW - w) / 2)),
    y: Math.max(0, Math.round(frameH * CARD_CENTRE_Y - h / 2)),
    scale,
  };
}
