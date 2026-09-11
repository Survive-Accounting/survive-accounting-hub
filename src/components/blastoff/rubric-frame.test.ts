// THE RUBRIC BLOCK'S GEOMETRY, pinned: inside the Shorts safe column; the slide variant is the
// row alone (plus a balance line) without Rev/Exp and the full L with them; the rubric slide's
// column — the card, the heading, the boxes, full size both ways since 2026-09-11 — ends inside the
// safe area (no caption rail on this kind), and the home camera sits in the L's crook. The card
// estimate is generous (a three-line transaction).
import { describe, expect, test } from "bun:test";

import { camRect } from "./capture/webcam-spots";
import { SAFE, camDefault, cardPlacement, isColumnKind } from "./layout";
import { PHONE_W } from "./PhoneFrame";
import { RUBRIC_GEOM, rubricBlockH } from "./RubricFrame";
import { RUBRIC_SLIDE, rubricCardW } from "./RubricSlide";

/** A generous card height in phone units: kicker row, three lines of stem, the card's padding. */
const CARD_EST = { rest: 140, revExp: 110 };
/** The heading's line, rest and with Rev/Exp. */
const HEAD = { rest: 21, revExp: 18 };

describe("the rubric frame", () => {
  test("the block fills the safe column's width and no more", () => {
    expect(RUBRIC_GEOM.w).toBeLessThanOrEqual(Math.round(PHONE_W * (SAFE.right - SAFE.left)));
    expect(RUBRIC_GEOM.x.E + RUBRIC_GEOM.top.w).toBe(RUBRIC_GEOM.w);
    const rows = RUBRIC_GEOM.top.h + RUBRIC_GEOM.sub.gap + RUBRIC_GEOM.sub.h + RUBRIC_GEOM.sub.gap + 1 + RUBRIC_GEOM.sub.h;
    expect(rows).toBeLessThanOrEqual(RUBRIC_GEOM.h);
  });

  test("the slide variant: the row alone without Rev/Exp, the full L with them", () => {
    expect(rubricBlockH(false)).toBe(RUBRIC_GEOM.top.h + RUBRIC_GEOM.balanceH);
    expect(rubricBlockH(true)).toBe(RUBRIC_GEOM.h);
  });

  test("the card fills the column: its paper and padding fit, within a flow unit", () => {
    for (const mul of [RUBRIC_SLIDE.cardMulRest, RUBRIC_SLIDE.cardShrinkRevExp]) {
      const drawn = RUBRIC_SLIDE.cardScale * mul * (rubricCardW(mul) + 44);
      expect(drawn).toBeLessThanOrEqual(RUBRIC_GEOM.w);
      expect(drawn).toBeGreaterThan(RUBRIC_GEOM.w - 1);
    }
  });

  test("the column runs down the safe area with no caption rail, and the home camera sits in the L's crook", () => {
    const H = PHONE_W * 16 / 9;
    const top = H * (SAFE.top + 0.02);
    for (const revExp of [false, true]) {
      const bottom = top + (revExp ? CARD_EST.revExp : CARD_EST.rest) + 8 + (revExp ? HEAD.revExp : HEAD.rest) + 6 + rubricBlockH(revExp);
      expect(bottom / H).toBeLessThan(SAFE.bottom);
    }
    expect(isColumnKind("rubric")).toBe(true);
    for (const layout of ["pass1", "pass2"] as const) {
      expect(cardPlacement(layout, "rubric").align).toBe("top");
      expect(camDefault(layout, "rubric")).toEqual({ spot: "home", size: 0.32 });
    }
    // The circle clears the top row (the only part the camera is told to keep off) and sits left
    // of the Rev/Exp column, whose left edge is the safe column's left plus E's x.
    const ring = camRect("home", PHONE_W, H, 0.32);
    const rowBottom = top + CARD_EST.revExp + 8 + HEAD.revExp + 6 + RUBRIC_GEOM.top.h;
    expect(ring.y).toBeGreaterThan(rowBottom);
    expect(ring.x + ring.w).toBeLessThan(PHONE_W * SAFE.left + RUBRIC_GEOM.x.E);
  });
});
