import { describe, expect, test } from "bun:test";

import { FRAME_TEMPLATES, placeTemplate, templateById, templatePlacementsAreSafe } from "./frame-templates";

describe("frame archetype templates", () => {
  test("there are 8 uniquely-ided templates", () => {
    expect(FRAME_TEMPLATES.length).toBe(8);
    expect(new Set(FRAME_TEMPLATES.map((t) => t.id)).size).toBe(8);
  });

  test("every template names a visualType and at least one placement", () => {
    for (const t of FRAME_TEMPLATES) {
      expect(t.visualType.length).toBeGreaterThan(0);
      expect(t.placements.length).toBeGreaterThan(0);
    }
  });

  test("all placements sit inside the phone-safe region", () => {
    for (const t of FRAME_TEMPLATES) expect(templatePlacementsAreSafe(t)).toBe(true);
  });

  test("templateById resolves + rejects", () => {
    expect(templateById("comparison")?.id).toBe("comparison");
    expect(templateById("nope")).toBeUndefined();
  });

  test("placeTemplate yields positive in-frame coords with a min width", () => {
    const t = templateById("worked_model")!;
    const out = placeTemplate(t, 800, 450);
    expect(out.length).toBe(2);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(800);
      expect(p.y).toBeLessThan(450);
      expect(p.w).toBeGreaterThanOrEqual(180);
      expect(p.x + p.w).toBeLessThanOrEqual(800);
    }
    expect(out.map((p) => p.kind)).toEqual(["je", "computation"]);
  });
});
