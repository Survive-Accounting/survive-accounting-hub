import { describe, expect, test } from "bun:test";

import { FRAME_TEMPLATES, placeTemplate, templateById, templatePlacementsAreSafe } from "./frame-templates";

describe("frame archetype templates", () => {
  test("there are 9 uniquely-ided templates", () => {
    expect(FRAME_TEMPLATES.length).toBe(9);
    expect(new Set(FRAME_TEMPLATES.map((t) => t.id)).size).toBe(9);
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

  // DISCLAIMER CARD — the true-black Jackass-format open. Guards the pieces the
  // stamped frame depends on: the black plate, the 4-step line choreography
  // (HEADS UP first), each line shipped film-hidden with the slow arrive-fade,
  // and the logo slot whose data.w overrides the 180px template minimum.
  test("disclaimer: black plate + 4 cue-flagged hidden lines + logo slot", () => {
    const t = templateById("disclaimer")!;
    expect(t.frameData?.plate).toBe("black");
    const cues = t.placements.filter((p) => p.cue);
    expect(cues.length).toBe(4);
    for (const p of cues) {
      expect(p.kind).toBe("heading");
      expect((p.data as { cueHidden?: boolean }).cueHidden).toBe(true);
      expect((p.data as { slowReveal?: boolean }).slowReveal).toBe(true);
    }
    expect((cues[0].data as { text?: string; tone?: string }).text).toBe("HEADS UP");
    expect((cues[0].data as { tone?: string }).tone).toBe("red");
    const logo = t.placements.find((p) => p.kind === "image");
    expect(logo).toBeDefined();
    expect((logo!.data as { w?: number }).w).toBeLessThan(180); // overrides the min width
    expect(templatePlacementsAreSafe(t)).toBe(true);
  });

  test("disclaimer placements carry px heights through placeTemplate", () => {
    const t = templateById("disclaimer")!;
    const out = placeTemplate(t, 800, 450);
    expect(out.filter((p) => p.cue).every((p) => (p.h ?? 0) > 0)).toBe(true);
    expect(out[0].h).toBe(Math.round(0.24 * 450)); // HEADS UP slab height
  });
});
