// Guards the brand module: colour catalogue, mono detection, and that the bolt
// markup is well-formed + recolours (no skull/stealie/circle — a plain bolt).
import { describe, expect, test } from "bun:test";

import { BOLT_D, BOLT_PRESETS, boltColorById, boltSvgMarkup, LOGO_MODES, SEC_SCHOOLS } from "./brand";

describe("brand system", () => {
  test("house presets + the current 16-team SEC, all with two hex colours", () => {
    expect(BOLT_PRESETS.map((p) => p.id)).toEqual(["red-blue", "purple-gold", "crimson-gray", "white", "black"]);
    expect(SEC_SCHOOLS.length).toBe(16);
    for (const o of [...BOLT_PRESETS, ...SEC_SCHOOLS]) {
      expect(o.c1).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(o.c2).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(o.name.length).toBeGreaterThan(0);
    }
    expect(new Set([...BOLT_PRESETS, ...SEC_SCHOOLS].map((o) => o.id)).size).toBe(21);
  });

  test("four logo modes", () => {
    expect(LOGO_MODES.map((m) => m.id)).toEqual(["bolt", "wordmark", "lockup", "slogan"]);
  });

  test("boltColorById resolves presets + SEC, falls back to red/blue", () => {
    expect(boltColorById("lsu").name).toBe("LSU");
    expect(boltColorById("white").c1).toBe("#FFFFFF");
    expect(boltColorById("nope").id).toBe("red-blue");
    expect(boltColorById(undefined).id).toBe("red-blue");
  });

  test("two-tone markup carries a hard-split gradient with both colours + a keyline", () => {
    const m = boltSvgMarkup({ c1: "#E0284A", c2: "#2C6FE0" }, "t1");
    expect(m).toContain(BOLT_D);
    expect(m).toContain("linearGradient");
    expect((m.match(/offset="0.5"/g) ?? []).length).toBe(2); // hard split
    expect(m).toContain("#E0284A");
    expect(m).toContain("#2C6FE0");
    expect(m).toContain('stroke="#FFFFFF"');
    // legally distinct: no skull / circle-composite
    expect(m).not.toContain("<circle");
    expect(/skull|stealie/i.test(m)).toBe(false);
  });

  test("mono (single colour) markup uses a flat fill, no gradient", () => {
    const m = boltSvgMarkup({ c1: "#FFFFFF", c2: "#FFFFFF" }, "t2");
    expect(m).not.toContain("linearGradient");
    expect(m).toContain('fill="#FFFFFF"');
  });

  test("unique uid → unique gradient id (no collisions when many render)", () => {
    const a = boltSvgMarkup({ c1: "#111111", c2: "#222222" }, "aa");
    const b = boltSvgMarkup({ c1: "#111111", c2: "#222222" }, "bb");
    expect(a).toContain("sa-bolt-aa");
    expect(b).toContain("sa-bolt-bb");
  });
});
