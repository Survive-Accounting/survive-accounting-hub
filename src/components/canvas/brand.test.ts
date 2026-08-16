// Guards the brand module against the supplied kit: primary red/blue, the
// internal-seam split (red meets blue directly — NO white line between; white
// only on the outside), mono single-colour, and the colour catalogue. No
// skull/circle (a plain bolt).
import { describe, expect, test } from "bun:test";

import { BOLT_OUTER, BOLT_PRESETS, BOLT_RIGHT, boltColorById, boltSvgMarkup, BRAND_BLUE, BRAND_RED, LOGO_MODES, SEC_SCHOOLS } from "./brand";

describe("brand system", () => {
  test("primary is the kit's red/blue; white + black are single-colour house options", () => {
    expect(BOLT_PRESETS.map((p) => p.id)).toEqual(["red-blue", "white", "black"]);
    expect(BOLT_PRESETS[0].c1).toBe(BRAND_RED);
    expect(BRAND_RED).toBe("#C62828");
    expect(BOLT_PRESETS[0].c2).toBe(BRAND_BLUE);
    expect(BRAND_BLUE).toBe("#1565C0");
  });

  test("the current 16-team SEC, all with two hex colours", () => {
    expect(SEC_SCHOOLS.length).toBe(16);
    for (const o of [...BOLT_PRESETS, ...SEC_SCHOOLS]) {
      expect(o.c1).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(o.c2).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(new Set([...BOLT_PRESETS, ...SEC_SCHOOLS].map((o) => o.id)).size).toBe(19);
  });

  test("five logo modes (outro = the end card)", () => {
    expect(LOGO_MODES.map((m) => m.id)).toEqual(["bolt", "wordmark", "lockup", "slogan", "outro"]);
  });

  test("boltColorById resolves presets + SEC, falls back to red/blue", () => {
    expect(boltColorById("lsu").name).toBe("LSU");
    expect(boltColorById("nope").id).toBe("red-blue");
    expect(boltColorById(undefined).id).toBe("red-blue");
  });

  test("two-colour bolt: c1 base + c2 right region (seam split, NO gradient, NO white between)", () => {
    const m = boltSvgMarkup({ c1: BRAND_RED, c2: BRAND_BLUE });
    // the full silhouette filled red, plus the right region filled blue overlaid
    expect(m).toContain(`d="${BOLT_OUTER}" fill="${BRAND_RED}"`);
    expect(m).toContain(`d="${BOLT_RIGHT}" fill="${BRAND_BLUE}"`);
    // white keyline is a STROKE (outer only), and there is NO gradient / no white
    // fill dividing the two colours
    expect(m).toContain('stroke="#FFFFFF"');
    expect(m).toContain("paint-order=\"stroke\"");
    expect(m).not.toContain("linearGradient");
    expect(m).not.toContain('fill="#FFFFFF"'); // white is never a FILL (would be a seam gap)
    // legally distinct — a plain bolt, no skull / circle composite
    expect(m).not.toContain("<circle");
    expect(/skull|stealie/i.test(m)).toBe(false);
  });

  test("mono bolt: single flat fill, no seam overlay", () => {
    const m = boltSvgMarkup({ c1: "#161616", c2: "#161616" });
    expect(m).toContain(`d="${BOLT_OUTER}" fill="#161616"`);
    expect(m).not.toContain(BOLT_RIGHT); // no right-region overlay when mono
  });

  test("Dead-style bolt: silhouette + seam open at ~the same top tip, serrated + closed", () => {
    // both open at ~the same top tip. Hand-edited, so within a few px (not byte-equal).
    const tip = (d: string) => d.replace(/^M\s*/, "").split(/\s*L/)[0].trim().split(/\s+/).map(Number);
    const [ox, oy] = tip(BOLT_OUTER), [sx, sy] = tip(BOLT_RIGHT);
    expect(Math.hypot(ox - sx, oy - sy)).toBeLessThan(3);
    // a serrated bolt: many vertices, and both paths are closed
    expect((BOLT_OUTER.match(/[ML]/g) ?? []).length).toBeGreaterThan(12);
    expect((BOLT_RIGHT.match(/[ML]/g) ?? []).length).toBeGreaterThan(12);
    expect(BOLT_OUTER.endsWith("Z")).toBe(true);
    expect(BOLT_RIGHT.endsWith("Z")).toBe(true);
  });
});
