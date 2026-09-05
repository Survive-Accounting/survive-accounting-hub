// Guards the colour-selection RULE — the part of the bolt that has to be right for 66 schools at
// once, where "looks fine on the three I checked" is how the last two attempts went wrong.
//
// The two things that must both hold: every school WHITE/cream/silver is rejected, and every
// school GOLD is kept. Those two sets sit close together in luminance, which is why the rule uses
// lightness AND chroma rather than a contrast ratio.
import { describe, expect, test } from "bun:test";

import { GENERATED_SCHOOLS } from "@/lib/schools.generated";

import {
  allBoltCampuses,
  boltCampusFor,
  curatedBoltCampuses,
  orderCampuses,
} from "./bolt-campuses";
import { CHARGE_EASE, CURATED_CAMPUS_ORDER, PANEL_SPAN, RIBBON_ANGLE } from "./bolt-config";
import {
  maxLeanOverhang,
  panelGradientAxis,
  panelPoints,
  panelSlack,
  ribbonStops,
  slotTop,
  panelHeight,
  PANEL_SLOTS,
} from "./bolt-geometry";
import {
  chroma,
  deriveAccent,
  getBoltPalette,
  hexToRgb,
  lightness,
  shade,
  whyTooLight,
  type BoltCampus,
} from "./bolt-palette";
import { cubicBezierEase } from "./useBoltRotation";

const campus = (over: Partial<BoltCampus> = {}): BoltCampus => ({
  id: "x",
  primary: "#14213D",
  secondary: "#CE1126",
  ...over,
});

describe("light-colour rule", () => {
  test("rejects white, near-white, cream and silver", () => {
    for (const hex of ["#FFFFFF", "#F1F2F3", "#F5F1E7", "#FDF9D8", "#C8C8C8", "#A7B1B7"]) {
      expect(whyTooLight(hex)).not.toBeNull();
    }
  });

  test("keeps every school gold, and every dark colour", () => {
    // The colours that a naive luminance-vs-white test throws away by mistake.
    for (const hex of [
      "#FDD023",
      "#FFC627",
      "#CEB888",
      "#CFB87C",
      "#C8C372",
      "#B7A57A",
      "#F1BE48",
      "#CBB677",
    ]) {
      expect(whyTooLight(hex)).toBeNull();
    }
    for (const hex of ["#000000", "#0C2340", "#461D7C", "#E87722", "#CE1126"]) {
      expect(whyTooLight(hex)).toBeNull();
    }
  });

  test("a colour it cannot measure is never replaced", () => {
    expect(whyTooLight("var(--sa-bolt-2)")).toBeNull();
    expect(getBoltPalette(campus({ secondary: "var(--sa-bolt-2)" })).usedFallback).toBe(false);
  });
});

describe("getBoltPalette", () => {
  test("left is always the primary, untouched", () => {
    for (const s of allBoltCampuses()) expect(getBoltPalette(s).leftColor).toBe(s.primary);
  });

  test("a usable secondary is passed through at full saturation", () => {
    const p = getBoltPalette(campus());
    expect(p.rightColor).toBe("#CE1126");
    expect(p.usedFallback).toBe(false);
    expect(p.reason).toBe("secondary");
  });

  test("a white secondary falls back to the curated accent when there is one", () => {
    const p = getBoltPalette(
      campus({ id: "smu", primary: "#CC0035", secondary: "#FFFFFF", accent: "#354CA1" }),
    );
    expect(p.rightColor).toBe("#354CA1");
    expect(p.usedFallback).toBe(true);
    expect(p.accentSource).toBe("curated");
    expect(p.originalRight).toBe("#FFFFFF");
  });

  test("a white secondary falls back to a derived accent when there is not", () => {
    const p = getBoltPalette(campus({ id: "tennessee", primary: "#FF8200", secondary: "#FFFFFF" }));
    expect(p.usedFallback).toBe(true);
    expect(p.accentSource).toBe("derived");
    // The derived accent must itself survive the rule it exists to answer.
    expect(whyTooLight(p.rightColor)).toBeNull();
  });

  test("the fallback can be switched off", () => {
    const p = getBoltPalette(campus({ secondary: "#FFFFFF" }), { useLightFallback: false });
    expect(p.rightColor).toBe("#FFFFFF");
    expect(p.usedFallback).toBe(false);
  });

  test("the dark rule is opt-in", () => {
    expect(getBoltPalette(campus({ secondary: "#000000" })).usedFallback).toBe(false);
    const on = getBoltPalette(campus({ secondary: "#000000" }), { useDarkFallback: true });
    expect(on.usedFallback).toBe(true);
    expect(on.reason).toBe("near-black");
  });

  test("EVERY school ends up with two distinguishable, non-white halves", () => {
    for (const c of allBoltCampuses()) {
      const p = getBoltPalette(c);
      expect(whyTooLight(p.rightColor)).toBeNull();
      expect(p.rightColor.toUpperCase()).not.toBe(p.leftColor.toUpperCase());
    }
  });

  test("the fallback fires for the schools with light secondaries and nobody else", () => {
    const flagged = allBoltCampuses()
      .filter((c) => getBoltPalette(c).usedFallback)
      .map((c) => c.id);
    expect(flagged).toContain("tennessee");
    expect(flagged).toContain("alabama");
    expect(flagged).toContain("mississippi-state");
    expect(flagged).toContain("oklahoma");
    expect(flagged).not.toContain("lsu");
    expect(flagged).not.toContain("ole-miss");
    expect(flagged).not.toContain("florida-state");
    expect(flagged).not.toContain("georgia");
  });

  test("Alabama and Ohio State stay CRIMSON, never a neutral grey", () => {
    // The right-hand region is the larger one, so whatever the accent is, the bolt reads as that
    // colour. Both schools list a grey next to their red; a grey accent therefore produced an
    // Alabama bolt that was not crimson. Chroma is the guard: their published greys sit at 0.05
    // and 0.06, a red sits far above it.
    for (const id of ["alabama", "ohio-state"]) {
      const c = allBoltCampuses().find((x) => x.id === id)!;
      const p = getBoltPalette(c);
      expect(p.usedFallback).toBe(true);
      expect(chroma(p.rightColor)!).toBeGreaterThan(0.3);
      // …and it must still be a RED, not merely colourful: red is the dominant channel.
      const [r, g, b] = hexToRgb(p.rightColor)!;
      expect(r).toBeGreaterThan(g * 2);
      expect(r).toBeGreaterThan(b * 2);
    }
  });
});

describe("derived accent", () => {
  test("dark primaries get a tint, light primaries a shade, and both clear the primary", () => {
    for (const dark of ["#500000", "#001E44", "#4D1979"]) {
      expect(lightness(deriveAccent(dark))!).toBeGreaterThan(lightness(dark)! + 0.15);
    }
    for (const light of ["#FF8200", "#F1B82D", "#CFB991"]) {
      expect(lightness(deriveAccent(light))!).toBeLessThan(lightness(light)!);
    }
  });

  test("it keeps a maroon a maroon — the six red schools do NOT collapse onto one colour", () => {
    // The bug this replaced: a fixed target lightness sent #500000, #660000, #990000, #AD0000,
    // #BE0000 and #CC0000 all to the identical red.
    const reds = ["#500000", "#660000", "#990000", "#AD0000", "#BE0000", "#CC0000"];
    expect(new Set(reds.map(deriveAccent)).size).toBe(reds.length);
  });

  test("the whole table produces distinct accents, campus by campus", () => {
    const accents = allBoltCampuses().map((c) => deriveAccent(c.primary));
    expect(new Set(accents).size).toBeGreaterThan(accents.length * 0.8);
  });

  test("it is always a colour, never a grey", () => {
    for (const c of allBoltCampuses())
      expect(chroma(deriveAccent(c.primary))!).toBeGreaterThan(0.1);
  });

  test("an achromatic primary falls back to the neutral accent rather than a grey of itself", () => {
    expect(chroma(deriveAccent("#161616"))!).toBeGreaterThan(0);
  });
});

describe("shade", () => {
  test("mixes toward white and black without leaving the hue", () => {
    expect(shade("#808080", 0)).toBe("#808080");
    expect(shade("#000000", 1)).toBe("#FFFFFF");
    expect(shade("#FFFFFF", -1)).toBe("#000000");
    expect(shade("var(--x)", 0.5)).toBe("var(--x)");
  });
});

describe("curated rotation order", () => {
  test("the SEC opening plays first, in the order the array lists it", () => {
    const ids = curatedBoltCampuses().map((c) => c.id);
    expect(ids.slice(0, 5)).toEqual(["ole-miss", "lsu", "tennessee", "auburn", "alabama"]);
  });

  test("every id in the curated array is a real school", () => {
    const known = new Set(GENERATED_SCHOOLS.map((s) => s.id));
    for (const id of CURATED_CAMPUS_ORDER) expect(known.has(id)).toBe(true);
  });

  test("no campus is dropped, and none is played twice", () => {
    const ids = curatedBoltCampuses().map((c) => c.id);
    expect(ids.length).toBe(GENERATED_SCHOOLS.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("boltCampusFor resolves BOTH namespaces to the same campus", () => {
    // The partner index pages list picker ids ("ole-miss"); the council and Greek pages carry /go/
    // slugs ("university-of-mississippi"). A helper that understood only one of them returned the
    // house red/blue for the other, which is exactly how those pages lost their school colours.
    const byId = boltCampusFor("ole-miss");
    const bySlug = boltCampusFor("university-of-mississippi");
    expect(byId).toEqual(bySlug);
    expect(byId.primary).toBe("#14213D");
    expect(byId.name).toBe("Ole Miss");
    // Every id in the curated order must resolve to real colours, not the house fallback.
    for (const id of CURATED_CAMPUS_ORDER) expect(boltCampusFor(id).name).not.toBe(id);
  });

  test("an unknown id still yields a usable campus rather than throwing", () => {
    const miss = boltCampusFor("not-a-school");
    expect(miss.primary).toBe("#006BA6"); // the house mark, not a campus pair
    expect(miss.id).toBe("not-a-school");
  });

  test("campuses the array does not mention still play, after the ones it does", () => {
    const out = orderCampuses([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "zzz"]);
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("conveyor geometry", () => {
  test("panels tile: slot i's bottom edge is slot i+1's top edge, vertex for vertex", () => {
    for (let i = 0; i < PANEL_SLOTS - 1; i++) {
      const a = panelPoints(i, 2, 7).split(" ");
      const b = panelPoints(i + 1, 2, 7).split(" ");
      expect(a[3]).toBe(b[0]); // bottom-left  === next top-left
      expect(a[2]).toBe(b[1]); // bottom-right === next top-right
    }
  });

  test("slot 0 straddles the bolt with EQUAL slack above and below, whatever the span", () => {
    for (const span of [1, 1.25, 2, 3.5]) {
      const above = -2.26 - slotTop(0, span);
      const below = slotTop(0, span) + panelHeight(span) - (-2.26 + 146.96);
      expect(above).toBeCloseTo(below, 6);
      expect(above).toBeCloseTo(panelSlack(span), 6);
    }
  });

  test("the shipped span clears the lean — no bare wedge at the bolt's top corner", () => {
    // A panel exactly one bolt tall would fail this: its leaning top edge dips below the bolt's
    // top line on one side, and the navy shows through. The slack is what pays for the lean.
    expect(panelSlack(PANEL_SPAN)).toBeGreaterThan(maxLeanOverhang(RIBBON_ANGLE));
    expect(panelSlack(1)).toBeLessThan(maxLeanOverhang(RIBBON_ANGLE)); // the trap this guards
  });

  test("the gradient axis spans exactly one panel, perpendicular to its lean", () => {
    for (const angle of [0, 7, -12]) {
      const a = panelGradientAxis(0, 2, angle);
      const k = Math.tan((angle * Math.PI) / 180);
      const dx = a.x2 - a.x1,
        dy = a.y2 - a.y1;
      expect(dx * 1 + dy * k).toBeCloseTo(0, 1); // ⟂ to the edge direction (1, k)
      expect(Math.hypot(dx, dy)).toBeCloseTo(panelHeight(2) / Math.hypot(1, k), 1);
    }
  });

  test("the tone wave starts and ends on the exact school colour, so panels butt cleanly", () => {
    for (const n of [1, 3, 4, 8]) {
      const s = ribbonStops(n);
      expect(s[0]).toEqual({ offset: 0, tone: 0 });
      expect(s[s.length - 1]).toEqual({ offset: 1, tone: 0 });
      expect(s.every((x, i) => i === 0 || x.offset > s[i - 1].offset)).toBe(true);
    }
  });
});

describe("the charge curve", () => {
  const ease = cubicBezierEase(CHARGE_EASE);

  test("it starts at 0, ends at 1, and never goes backwards", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(2)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = ease(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev); // monotonic — the charge can never reverse
      prev = v;
    }
  });

  test("it is front-loaded: quick out, long resolve", () => {
    // This is the whole brief for the motion — "quick → energetic → resolved". The first quarter
    // of the TIME must cover well over half the DISTANCE, and the last quarter must be a settle.
    expect(ease(0.25)).toBeGreaterThan(0.55);
    expect(ease(0.5)).toBeGreaterThan(0.85);
    expect(1 - ease(0.75)).toBeLessThan(0.08);
  });

  test("a linear curve is still handled exactly, so the ease is a choice and not a floor", () => {
    const linear = cubicBezierEase([0.333, 0.333, 0.667, 0.667]);
    for (const x of [0.1, 0.25, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 3);
  });
});
