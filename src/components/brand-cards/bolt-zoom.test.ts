// The bolt zoom's geometry and ticker — what makes the loop seamless and the
// ticker true.
import { describe, expect, test } from "bun:test";

import { GENERATED_SCHOOLS } from "@/lib/schools.generated";
import { ZOOM, driftDegrees, powerFourTicker, zoomKeyframes, zoomLayers, zoomScales } from "./bolt-zoom";

describe("zoomLayers — evenly staggered through one period, brand colours cycling", () => {
  test("delays cover the period with no two layers at the same point", () => {
    const layers = zoomLayers(0.1);
    expect(layers).toHaveLength(ZOOM.layers);
    const delays = layers.map((l) => l.delaySec);
    expect(new Set(delays).size).toBe(ZOOM.layers);
    expect(Math.min(...delays)).toBeGreaterThan(-ZOOM.period);
    expect(Math.max(...delays)).toBe(0);
  });
  test("colours are red, blue, cream, repeating; psych 0 means no tilt", () => {
    const l = zoomLayers(0);
    expect(l[0].colour).toBe(l[3].colour);
    expect(l[1].colour).not.toBe(l[0].colour);
    expect(l.every((x) => x.tiltDeg === 0)).toBe(true);
    expect(zoomLayers(0.1).some((x) => x.tiltDeg !== 0)).toBe(true);
  });
});

describe("zoomScales / zoomKeyframes — exponential so the zoom reads at constant speed", () => {
  test("each step is the ratio times the last, starting phone-sized", () => {
    const s = zoomScales();
    expect(s[0]).toBe(ZOOM.start);
    for (let j = 1; j < s.length; j++) expect(s[j] / s[j - 1]).toBeCloseTo(ZOOM.ratio, 2);
    expect(s[s.length - 1]).toBeGreaterThan(1); // the largest layer is bigger than the frame — "being zoomed in"
  });
  test("keyframes fade in at the smallest and out at the largest, visible between", () => {
    const k = zoomKeyframes();
    expect(k.startsWith("0% { transform: scale(0.09); opacity: 0; }")).toBe(true);
    expect(k).toContain("100% {");
    expect(k.split("\n").filter((l) => l.includes("opacity: 1")).length).toBe(ZOOM.layers - 1);
  });
});

describe("powerFourTicker — the whole Power Four, SEC first", () => {
  test("SEC leads, then Big Ten, Big 12, ACC; nothing else; course codes ride along", () => {
    const t = powerFourTicker();
    const sec = GENERATED_SCHOOLS.filter((s) => s.conference === "SEC").length;
    expect(t.length).toBe(GENERATED_SCHOOLS.filter((s) => s.conference !== "Other").length);
    expect(t.length).toBeGreaterThanOrEqual(50);
    const oleMiss = GENERATED_SCHOOLS.find((s) => /ole miss|mississippi$/i.test(s.name) && s.conference === "SEC");
    if (oleMiss) expect(t.slice(0, sec).some((x) => x.startsWith(oleMiss.name))).toBe(true);
    const withCode = GENERATED_SCHOOLS.find((s) => s.conference !== "Other" && s.courseCode);
    if (withCode) expect(t).toContain(`${withCode.name} · ${withCode.courseCode}`);
  });
  test("works on a hand-made list", () => {
    expect(powerFourTicker([
      { id: "a", campusId: "a", slug: "a", name: "A", isSec: false, conference: "ACC", courseCode: null, c1: null, c2: null } as never,
      { id: "b", campusId: "b", slug: "b", name: "B", isSec: true, conference: "SEC", courseCode: "ACCT 200", c1: null, c2: null } as never,
      { id: "c", campusId: "c", slug: "c", name: "C", isSec: false, conference: "Other", courseCode: null, c1: null, c2: null } as never,
    ])).toEqual(["B · ACCT 200", "A"]);
  });
});

describe("driftDegrees", () => {
  test("10% psych is a gentle ±12°, clamped 0..1", () => {
    expect(driftDegrees(0.1)).toBe(12);
    expect(driftDegrees(0)).toBe(0);
    expect(driftDegrees(2)).toBe(120);
  });
});
