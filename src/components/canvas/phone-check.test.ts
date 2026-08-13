import { describe, expect, test } from "bun:test";

import { baseTextPxForKind, contrastRatio, phoneChecks, phoneRenderScale, type PhoneEl } from "./phone-check";

const el = (over: Partial<PhoneEl>): PhoneEl => ({ id: "e", kind: "list", x: 100, y: 60, w: 200, h: 120, textPx: 14, ...over });

describe("phoneRenderScale", () => {
  test("16:9 frame fits inside the landscape phone (height-bound)", () => {
    const s = phoneRenderScale(800, 450, 844, 390);
    expect(s).toBeCloseTo(390 / 450, 5); // height is the tighter dimension
    expect(s).toBeLessThan(1);
  });
  test("degenerate frame → 1", () => {
    expect(phoneRenderScale(0, 0)).toBe(1);
  });
});

describe("phone checks", () => {
  test("small text at a 0.6 card scale is flagged", () => {
    // 14px base × 0.6 scale = 8.4px on-frame → well under 14 rendered
    const flags = phoneChecks({ frameW: 800, frameH: 450, elements: [el({ textPx: 14 * 0.6 })] });
    expect(flags.some((f) => f.code === "text-too-small")).toBe(true);
  });

  test("comfortably large text passes", () => {
    const flags = phoneChecks({ frameW: 800, frameH: 450, elements: [el({ kind: "heading", textPx: 30 })] });
    expect(flags.some((f) => f.code === "text-too-small")).toBe(false);
  });

  test("element past the frame bound → off-frame warning", () => {
    const flags = phoneChecks({ frameW: 800, frameH: 450, elements: [el({ x: 720, w: 200, textPx: 30 })] });
    expect(flags.some((f) => f.code === "off-frame")).toBe(true);
  });

  test("element in the unsafe margin → near-edge warning", () => {
    const flags = phoneChecks({ frameW: 800, frameH: 450, elements: [el({ x: 10, y: 10, w: 100, h: 60, textPx: 30 })] });
    expect(flags.some((f) => f.code === "near-edge")).toBe(true);
  });

  test("overlapping elements → info flag", () => {
    const flags = phoneChecks({
      frameW: 800, frameH: 450,
      elements: [el({ id: "a", x: 100, y: 100, w: 200, h: 120, textPx: 30 }), el({ id: "b", x: 150, y: 120, w: 200, h: 120, textPx: 30 })],
    });
    expect(flags.some((f) => f.code === "overlap" && f.level === "info")).toBe(true);
  });

  test("low contrast pair is flagged; warnings sort before info", () => {
    const flags = phoneChecks({
      frameW: 800, frameH: 450,
      elements: [el({ textPx: 30, fg: [120, 120, 120], bg: [90, 90, 90] })],
    });
    expect(flags.some((f) => f.code === "low-contrast")).toBe(true);
    // any info flags come after warns
    const firstInfo = flags.findIndex((f) => f.level === "info");
    const lastWarn = flags.map((f) => f.level).lastIndexOf("warn");
    if (firstInfo >= 0) expect(lastWarn).toBeLessThan(firstInfo);
  });

  test("nothing wrong → no flags", () => {
    const flags = phoneChecks({ frameW: 800, frameH: 450, elements: [el({ x: 120, y: 80, w: 300, h: 200, textPx: 30 })] });
    expect(flags.length).toBe(0);
  });
});

describe("helpers", () => {
  test("contrastRatio: black on white is ~21, near-equal is ~1", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrastRatio([100, 100, 100], [105, 105, 105])).toBeLessThan(1.3);
  });
  test("baseTextPxForKind: heading big, note small", () => {
    expect(baseTextPxForKind("heading")).toBeGreaterThan(baseTextPxForKind("note"));
  });
});
