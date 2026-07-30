// Guards the Logo Lab concept data: three concepts, scalable sources, token
// colors only, monochrome-capable C, and — the legal guard — no skull / stealie
// vocabulary anywhere in any source.
import { describe, expect, test } from "bun:test";

import { LOGO_AMBER, LOGO_CONCEPTS, LOGO_CREAM, LOGO_NAVY, LOGO_RED } from "./logo-concepts";

describe("logo lab concepts", () => {
  test("three concepts, A/B/C, each with at least one mark", () => {
    expect(LOGO_CONCEPTS.map((c) => c.id)).toEqual(["A", "B", "C"]);
    for (const c of LOGO_CONCEPTS) expect(c.marks.length).toBeGreaterThan(0);
  });

  test("every mark scales to its box (viewBox + 100% size) and declares 2-3 render sizes", () => {
    for (const c of LOGO_CONCEPTS)
      for (const m of c.marks) {
        expect(m.svg).toContain("viewBox=");
        expect(m.svg).toContain('width="100%"');
        expect(m.svg).toContain('height="100%"');
        expect(m.sizes.length).toBeGreaterThanOrEqual(2);
      }
  });

  test("B ships a wordmark AND an isolated standalone S; the S goes to 16px", () => {
    const b = LOGO_CONCEPTS.find((c) => c.id === "B")!;
    expect(b.marks.length).toBe(2);
    const s = b.marks.find((m) => !m.ratio)!;
    expect(s.sizes).toContain(16);
  });

  test("A + B use only token colors; C is fully monochrome (currentColor)", () => {
    const src = (id: string) => LOGO_CONCEPTS.find((c) => c.id === id)!.marks.map((m) => m.svg).join("\n");
    for (const id of ["A", "B"] as const) {
      const hexes = src(id).match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
      for (const h of hexes) expect([LOGO_NAVY, LOGO_AMBER, LOGO_RED, LOGO_CREAM]).toContain(h.toUpperCase());
    }
    const cSrc = src("C");
    expect(cSrc).toContain("currentColor");
    expect(cSrc.match(/#[0-9A-Fa-f]{3,8}\b/g)).toBeNull(); // no hardcoded color at all
  });

  test("legally distinct: no skull / stealie vocabulary in any source or copy", () => {
    const all = LOGO_CONCEPTS.map((c) => c.name + c.blurb + c.marks.map((m) => m.label + m.svg).join("")).join("");
    expect(/skull|stealie|steal your face/i.test(all)).toBe(false);
  });
});
