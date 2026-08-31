// BRAND ANIMATION — the globe's placement rules under test: determinism and never inventing a
// position. (The drawn-wordmark timeline tests left with the drawn wordmark itself, rejected
// 2026-08-31 — see docs/BRAND-ANIMATION.md.)
import { describe, expect, test } from "bun:test";

import { campusLatLng, SCHOOL_COORDS, STATE_CENTROIDS } from "@/lib/globe/campus-geo";
import { ALL_SCHOOLS } from "@/lib/schools";

describe("campus placement", () => {
  test("every seeded campus slug has precise coordinates", () => {
    const missing = ALL_SCHOOLS.filter((s) => !SCHOOL_COORDS[s.slug]).map((s) => s.slug);
    expect(missing).toEqual([]);
  });

  test("all coordinates are on Earth (and in the US, where these campuses are)", () => {
    for (const [slug, [lat, lng]] of Object.entries(SCHOOL_COORDS)) {
      expect(lat, slug).toBeGreaterThan(18);
      expect(lat, slug).toBeLessThan(72);
      expect(lng, slug).toBeGreaterThan(-160);
      expect(lng, slug).toBeLessThan(-60);
    }
    for (const [code, [lat, lng]] of Object.entries(STATE_CENTROIDS)) {
      expect(lat, code).toBeGreaterThan(18);
      expect(lng, code).toBeLessThan(-60);
    }
  });

  test("state fallback is deterministic, state-true, and never invented", () => {
    const a = campusLatLng("some-unknown-campus", "Texas");
    const b = campusLatLng("some-unknown-campus", "Texas");
    expect(a).toEqual(b); // same campus, same spot, every render
    expect(a).not.toBeNull();
    const [lat, lng] = a!;
    const [clat, clng] = STATE_CENTROIDS.TX;
    expect(Math.abs(lat - clat)).toBeLessThanOrEqual(0.8);
    expect(Math.abs(lng - clng)).toBeLessThanOrEqual(0.8);
    // two-letter form resolves too
    expect(campusLatLng("another-campus", "TX")).not.toBeNull();
    // no state, no seeded slug → NOT plotted, never invented
    expect(campusLatLng("mystery-campus", null)).toBeNull();
    expect(campusLatLng(null, "not-a-state")).toBeNull();
  });

  test("a seeded slug wins over its state fallback", () => {
    expect(campusLatLng("university-of-mississippi", "Mississippi")).toEqual(SCHOOL_COORDS["university-of-mississippi"]);
  });
});
