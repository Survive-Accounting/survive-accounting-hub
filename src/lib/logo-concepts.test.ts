// Guards the Logo Lab concept data: four concepts, scalable sources, token
// colors only, monochrome-capable C, and — the legal guard — no skull / stealie
// vocabulary anywhere in any source.
import { describe, expect, test } from "bun:test";

import { LOGO_AMBER, LOGO_CONCEPTS, LOGO_CREAM, LOGO_NAVY, LOGO_RED } from "./logo-concepts";

describe("logo lab concepts", () => {
  test("four concepts, A/B/D/C, each with at least one mark", () => {
    expect(LOGO_CONCEPTS.map((c) => c.id).sort()).toEqual(["A", "B", "C", "D"]);
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

  test("D: both pencil gradients, dark bolt, standalone + fallback + animated demo", () => {
    const d = LOGO_CONCEPTS.find((c) => c.id === "D")!;
    const by = (id: string) => d.marks.find((m) => m.id === id)!;
    // the gradient COMPARISON: brand amber→red vs hot orange→yellow
    expect(by("d-word-brand").svg).toContain("#FCA311");
    expect(by("d-word-brand").svg).toContain("#E0284A");
    expect(by("d-word-hot").svg).toContain("#FF7A00");
    expect(by("d-word-hot").svg).toContain("#FFE03D");
    // inverted model: letters currentColor, bolt dark charcoal-navy w/ edge light
    for (const w of [by("d-word-brand"), by("d-word-hot")]) {
      expect(w.svg).toContain('fill="currentColor"');
      expect(w.svg).toContain('fill="#111A30"');
    }
    // standalone goes to 16px; the fallback is bolt-ALONE (no pencil rect, no gradient)
    expect(by("d-mark-hot").sizes).toContain(16);
    expect(by("d-fallback").svg).not.toContain("<rect");
    expect(by("d-fallback").svg).not.toContain("linearGradient");
    // animated demo is SMIL, loops, and is labeled as the secondary variant
    expect(by("d-anim").svg).toContain("animateTransform");
    expect(by("d-anim").svg).toContain('repeatCount="indefinite"');
    expect(by("d-anim").label).toContain("static is primary");
    // every D mark shares ONE bolt silhouette (template — variants can't drift)
    const boltD = "M44 0 L14 0 L6 40";
    for (const m of d.marks) expect(m.svg).toContain(boltD);
  });

  test("legally distinct: no skull / stealie vocabulary in any source or copy", () => {
    const all = LOGO_CONCEPTS.map((c) => c.name + c.blurb + c.marks.map((m) => m.label + m.svg).join("")).join("");
    expect(/skull|stealie|steal your face/i.test(all)).toBe(false);
  });
});
