// The vertical spot: centred, big, in the band the phone UI leaves clear.
import { describe, expect, test } from "bun:test";

import { CARD_H, CARD_W, VERTICAL_DEAL_SCALE } from "@/components/canvas/ceq-geom";
import { CARD_CENTRE_Y, FILM_FRAME, verticalCardSpot } from "./film-spot";

describe("verticalCardSpot", () => {
  test("a standard card is centred horizontally at the vertical deal scale", () => {
    const s = verticalCardSpot();
    expect(s.scale).toBe(VERTICAL_DEAL_SCALE);
    expect(s.x).toBe(Math.round((FILM_FRAME.w - CARD_W * VERTICAL_DEAL_SCALE) / 2));
    expect(s.x + CARD_W * VERTICAL_DEAL_SCALE).toBeLessThanOrEqual(FILM_FRAME.w);
  });
  test("its centre sits a little above the frame's middle — the clear band on Shorts", () => {
    const s = verticalCardSpot();
    const centre = s.y + (CARD_H * s.scale) / 2;
    expect(Math.round(centre)).toBe(Math.round(FILM_FRAME.h * CARD_CENTRE_Y));
    expect(centre).toBeLessThan(FILM_FRAME.h / 2);
    expect(s.y).toBeGreaterThan(FILM_FRAME.h * 0.09);            // below the status bar band
    expect(s.y + CARD_H * s.scale).toBeLessThan(FILM_FRAME.h * 0.8); // above the caption band
  });
  test("a wider card (the tutor card, 640) still fits and stays centred", () => {
    const s = verticalCardSpot(640);
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x + 640 * s.scale).toBeLessThanOrEqual(FILM_FRAME.w);
    expect(s.x).toBeLessThan(verticalCardSpot().x);
  });
  test("never negative on a frame too small for the card", () => {
    const s = verticalCardSpot(CARD_W, 400, 300);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });
});
