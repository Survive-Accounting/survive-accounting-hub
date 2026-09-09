import { describe, expect, test } from "bun:test";

import {
  OUTRO_BEATS,
  OUTRO_CLASS,
  OUTRO_ENTRANCE_MS,
  OUTRO_KEYS,
  entranceEndsMs,
  outroBeat,
  outroClass,
  outroEntranceCss,
} from "./outro-entrance";

// Lee, 2026-09-08: "Cram what's on your exam is an outro card only for now. THAT is the slide
// that needs entrance animation too."
describe("the outro's beat sheet", () => {
  test("every piece has a beat, in the order they arrive", () => {
    expect(OUTRO_BEATS.map((b) => b.key)).toEqual([...OUTRO_KEYS]);
    for (const k of OUTRO_KEYS) expect(outroBeat(k).key).toBe(k);
    expect(() => outroBeat("nope" as never)).toThrow();
  });
  test("the wordmark is first and the CTA is the ONE hard landing", () => {
    expect(OUTRO_BEATS[0].key).toBe("wordmark");
    expect(OUTRO_BEATS.filter((b) => b.hard).map((b) => b.key)).toEqual(["cta"]);
  });
  test("the pill arrives on its own beat, after the lockup has settled", () => {
    const domain = outroBeat("domain");
    expect(outroBeat("cta").atMs).toBeGreaterThan(domain.atMs + domain.durMs);
  });
  test("everything is at rest before the entrance is over — nothing moves under the caption", () => {
    expect(entranceEndsMs()).toBeLessThanOrEqual(OUTRO_ENTRANCE_MS);
    for (const b of OUTRO_BEATS) expect(b.atMs + b.durMs).toBeLessThanOrEqual(OUTRO_ENTRANCE_MS);
  });
});

describe("outroEntranceCss", () => {
  test("one rule per piece, keyed off the beat sheet", () => {
    const css = outroEntranceCss();
    for (const b of OUTRO_BEATS) {
      expect(css).toContain(`.${outroClass(b.key)} { animation-delay: ${b.atMs}ms`);
      expect(css).toContain(`animation-duration: ${b.durMs}ms`);
    }
    expect(css).toContain(`.${OUTRO_CLASS} {`);
    expect(css).toContain(".sa-oe-flash {");
  });
  test("the travel is the caller's px, and reduced motion zeroes it", () => {
    const css = outroEntranceCss(64);
    expect(css).toContain("--sa-oe-y: 64px");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*--sa-oe-y: 0px/);
  });
});
