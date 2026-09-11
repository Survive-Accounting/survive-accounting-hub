import { describe, expect, test } from "bun:test";

import { CONTENT_BOTTOM } from "@/components/blastoff/layout";
import { BIG_CALLOUT_CAP, bigCalloutBand, bigCalloutSize } from "./BigCallout";

const H = 1920;

// Lee, 2026-09-08: "some of my slides are so short that they can fill up the whole screen.
// Other times it will be better to have current version then illustration."
describe("the big callout's type scale", () => {
  test("a short line goes enormous; a long one steps down", () => {
    const short = bigCalloutSize(H, "Debits go left.");
    const long = bigCalloutSize(H, "Ask what the company received and then what it gave up, every single time.");
    expect(short).toBeGreaterThan(long);
    expect(short).toBe(Math.round(H * BIG_CALLOUT_CAP.plain));       // the cap — the whole point of the mode
  });

  test("bullets and a picture each take room away from the heading", () => {
    const alone = bigCalloutSize(H, "Debits go left.");
    const withBullets = bigCalloutSize(H, "Debits go left.", { bullets: 2 });
    const manyBullets = bigCalloutSize(H, "Debits go left.", { bullets: 4 });
    const withArt = bigCalloutSize(H, "Debits go left.", { art: true });
    expect(withBullets).toBeLessThan(alone);
    expect(manyBullets).toBeLessThan(withBullets);
    expect(withArt).toBeLessThan(manyBullets);
  });

  test("never past the cap and never under the floor, whatever it is handed", () => {
    const huge = "x".repeat(4000);
    for (const opts of [{}, { bullets: 9 }, { art: true }, { bullets: 9, art: true }]) {
      expect(bigCalloutSize(H, huge, opts)).toBeGreaterThanOrEqual(Math.round(H * 0.03));
      expect(bigCalloutSize(H, huge, opts)).toBeLessThanOrEqual(Math.round(H * BIG_CALLOUT_CAP.plain));
      expect(bigCalloutSize(H, "", opts)).toBeGreaterThan(0);
    }
    expect(Number.isFinite(bigCalloutSize(H, "   "))).toBe(true);
  });

  test("it scales with the frame, so the pop-out and the Review stage agree", () => {
    expect(bigCalloutSize(960, "Debits go left.")).toBe(Math.round(bigCalloutSize(1920, "Debits go left.") / 2));
  });

  // 2026-09-12: captions are gone, so the words go bigger than they did when a rail sat under them.
  test("the type is bigger than it was under the old caption rail", () => {
    expect(BIG_CALLOUT_CAP.plain).toBeGreaterThan(0.096);
  });
});

describe("the band the words live in", () => {
  test("runs down to the content floor now, with and without a picture", () => {
    for (const art of [false, true]) {
      const b = bigCalloutBand(art);
      expect(b.bottom).toBeLessThanOrEqual(CONTENT_BOTTOM);
      expect(b.bottom).toBeGreaterThan(0.735);          // past where the old caption rail ended
      expect(b.top).toBeLessThan(b.bottom);
    }
  });

  test("a picture pushes the words down into the strip beneath it", () => {
    expect(bigCalloutBand(true).top).toBeGreaterThan(bigCalloutBand(false).top);
  });
});
