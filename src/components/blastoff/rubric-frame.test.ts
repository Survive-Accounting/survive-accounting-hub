// THE RUBRIC BLOCK'S GEOMETRY, pinned: inside the Shorts safe column; the slide variant is the
// row alone (plus a balance line) without Rev/Exp and the full L with them; and the rubric slide's
// column — the card, the heading, the boxes — ends above the caption rail both ways, using a
// generous estimate for the card (a three-line transaction).
import { describe, expect, test } from "bun:test";

import { camRect } from "./capture/webcam-spots";
import { CAPTION_RAIL, SAFE, camDefault, cardPlacement } from "./layout";
import { PHONE_W } from "./PhoneFrame";
import { RUBRIC_GEOM, rubricBlockH } from "./RubricFrame";
import { RUBRIC_SLIDE } from "./RubricSlide";

/** A generous card height in phone units: kicker row, three lines of stem, the card's padding. */
const CARD_EST = { rest: 118, revExp: 100 };

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

  test("the rubric slide's column ends above the caption rail, and its camera is the home circle", () => {
    const H = PHONE_W * 16 / 9;
    const top = H * (SAFE.top + 0.02);
    for (const revExp of [false, true]) {
      const block = rubricBlockH(revExp) * (revExp ? RUBRIC_SLIDE.blockScaleRevExp : 1);
      const heading = revExp ? 16 : 18;
      const bottom = top + (revExp ? CARD_EST.revExp : CARD_EST.rest) + 8 + heading + 6 + block;
      expect(bottom / H).toBeLessThan(CAPTION_RAIL.top);
    }
    for (const layout of ["pass1", "pass2"] as const) {
      expect(cardPlacement(layout, "rubric").align).toBe("top");
      expect(camDefault(layout, "rubric")).toEqual({ spot: "home", size: 0.28 });
    }
    // the home circle sits below the rail's top, so a column that clears the rail clears it too
    const ring = camRect("home", 1080, 1920, 0.28);
    expect(ring.y / 1920).toBeGreaterThan(CAPTION_RAIL.top);
  });
});
