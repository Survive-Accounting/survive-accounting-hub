// THE END-OF-TOPIC FRAMES' GEOMETRY, pinned: the header block clears the corner camera, the
// Up Next rubric ends above the caption rail, both kinds are full-frame with the corner bubble.
import { describe, expect, test } from "bun:test";

import { camRect } from "./capture/webcam-spots";
import { END_OF_TOPIC_GEOM } from "./EndOfTopicFrames";
import { CAPTION_RAIL, camDefault } from "./layout";
import { isFullFrame, isInsert } from "./plan";
import { RUBRIC_GEOM } from "./RubricFrame";

describe("the end-of-topic frames", () => {
  test("full-frame inserts with the corner camera", () => {
    for (const k of ["topic_done", "up_next"] as const) {
      expect(isFullFrame(k)).toBe(true);
      expect(isInsert(k)).toBe(true);
      expect(camDefault("pass1", k)).toEqual({ spot: "corner" });
      expect(camDefault("pass2", k)).toEqual({ spot: "corner" });
    }
  });

  test("the header column stops short of the corner camera", () => {
    const W = 306, H = 544;
    const ring = camRect("corner", W, H);
    expect(END_OF_TOPIC_GEOM.left + END_OF_TOPIC_GEOM.headerW).toBeLessThan(ring.x);
  });

  test("Up Next's rubric ends above the caption rail", () => {
    const H = 544;
    const G = END_OF_TOPIC_GEOM;
    // chip, title (one line), subtitle, the gap, then the block at rubricScale
    const header = G.chipH + 7 + G.titleSize * 1.05 + 3 + G.subtitleSize * 1.2 + 12;
    const bottom = G.top + header + RUBRIC_GEOM.h * G.rubricScale;
    expect(bottom / H).toBeLessThan(CAPTION_RAIL.top);
  });
});
