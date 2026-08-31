// BRAND ANIMATION — the pure halves under test: the wordmark's timeline math (a component that
// claims to be a pure function of progress must prove the endpoints) and the globe's placement
// rules (determinism + never inventing a position).
import { describe, expect, test } from "bun:test";

import { segments, segProgress, wordWidth } from "@/components/brand/AnimatedWordmark";
import { GLYPHS, PATH_WEIGHT } from "@/components/brand/wordmark-glyphs";
import { campusLatLng, SCHOOL_COORDS, STATE_CENTROIDS } from "@/lib/globe/campus-geo";
import { ALL_SCHOOLS } from "@/lib/schools";

describe("wordmark timeline", () => {
  const words = ["surv⚡ve", "accounting"];

  test("every glyph the two words need exists, with a weight per path", () => {
    for (const w of words) for (const ch of w) {
      if (ch === "⚡") continue;
      expect(GLYPHS[ch], `missing glyph "${ch}"`).toBeDefined();
      expect(PATH_WEIGHT[ch]?.length).toBe(GLYPHS[ch].d.length);
    }
  });

  test("t=0 draws nothing, t=1 completes EVERY stroke (including the last)", () => {
    for (const w of words) {
      const segs = segments(w);
      expect(segs.length).toBeGreaterThan(0);
      for (const p of segProgress(segs, 0)) expect(p).toBe(0);
      for (const p of segProgress(segs, 1)) expect(p).toBe(1);
    }
  });

  test("per-segment progress is monotonic in t and starts in stroke order", () => {
    const segs = segments("surv⚡ve");
    let prev = segProgress(segs, 0);
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      const cur = segProgress(segs, Math.min(1, t));
      cur.forEach((p, i) => expect(p + 1e-9).toBeGreaterThanOrEqual(prev[i]));
      prev = cur;
    }
    // mid-draw, an early stroke is at least as far along as a later one
    const mid = segProgress(segs, 0.5);
    for (let i = 1; i < mid.length; i++) expect(mid[i - 1] + 1e-9).toBeGreaterThanOrEqual(mid[i]);
  });

  test("word widths are positive and accounting is wider than survive (it's the long word)", () => {
    expect(wordWidth("surv⚡ve")).toBeGreaterThan(0);
    expect(wordWidth("accounting")).toBeGreaterThan(wordWidth("surv⚡ve"));
  });
});

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
