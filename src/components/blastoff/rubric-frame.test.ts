// THE RUBRIC BLOCK'S GEOMETRY, pinned: inside the Shorts safe column, above the caption rail,
// clear of its own home camera — in both templates. Pure numbers (RubricFrame.tsx RUBRIC_GEOM),
// no DOM.
import { describe, expect, test } from "bun:test";

import { camRect } from "./capture/webcam-spots";
import { CAPTION_RAIL, SAFE, camDefault, cardPlacement } from "./layout";
import { PHONE_W } from "./PhoneFrame";
import { RUBRIC_GEOM, rubricBottomFrac } from "./RubricFrame";

describe("the rubric frame", () => {
  test("the block fills the safe column's width and no more", () => {
    expect(RUBRIC_GEOM.w).toBeLessThanOrEqual(Math.round(PHONE_W * (SAFE.right - SAFE.left)));
    // the L's right edge is E's right edge, which is the block's right edge
    expect(RUBRIC_GEOM.x.E + RUBRIC_GEOM.top.w).toBe(RUBRIC_GEOM.w);
    // the two rows under E stack inside the block's height
    const rows = RUBRIC_GEOM.top.h + RUBRIC_GEOM.sub.gap + RUBRIC_GEOM.sub.h + RUBRIC_GEOM.sub.gap + 1 + RUBRIC_GEOM.sub.h;
    expect(rows).toBeLessThanOrEqual(RUBRIC_GEOM.h);
  });

  test("top-aligned in both templates, and its bottom clears the caption rail and the home camera", () => {
    for (const layout of ["pass1", "pass2"] as const) {
      expect(cardPlacement(layout, "rubric").align).toBe("top");
      // PhoneFrame puts a top-aligned stage at SAFE.top + .02
      const bottom = rubricBottomFrac(SAFE.top + 0.02);
      expect(bottom).toBeLessThan(CAPTION_RAIL.top);
      const cam = camDefault(layout, "rubric");
      expect(cam).toEqual({ spot: "home", size: 0.28 });
      const W = 1080, H = 1920;
      const ring = camRect("home", W, H, cam.size);
      expect(bottom * H).toBeLessThan(ring.y);
    }
  });
});
