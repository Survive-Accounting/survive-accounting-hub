// THE STAIRCASE — the geometric claim the chapter page makes with its cards (2026-08-29).
//
// Two big doors (study / spread), then three smaller ones (how to spread). "Smaller" is not a
// vibe: a tier must measure less than a door in every dimension a reader can see, or the page is
// telling them there is a hierarchy while showing them there isn't. These numbers drifted apart
// once already — the tiers rendered TALLER than the doors — so they are pinned here.
import { describe, expect, test } from "bun:test";

import { DOOR_BTN, DOOR_CARD, DOOR_CTA_VARS, TIER_ACTION, TIER_CARD } from "./DoorCard";

// A door's vertical values became `var(--door-min-h, 332px)` on 2026-08-31, so the PHONE can
// shrink them without a second component. The desktop number is still there — it is the var's
// fallback — so the parser learns to read one rather than the assertions being loosened. A value
// that is neither a number nor a resolvable px fallback still yields NaN and still fails.
const px = (v: unknown): number => {
  if (typeof v === "number") return v;
  const s = String(v);
  const fallback = /var\([^,]+,\s*(-?[\d.]+)px\s*\)/.exec(s);
  if (fallback) return Number(fallback[1]);
  return /^-?[\d.]+px$/.test(s.trim()) ? Number(s.replace("px", "")) : Number.NaN;
};
const topPad = (padding: unknown): number => px(String(padding).trim().split(/\s+(?![^(]*\))/)[0]);
const radius = (v: unknown): number => px(v);

describe("tier cards are a step DOWN from door cards", () => {
  test("shorter", () => {
    expect(px(TIER_CARD.minHeight)).toBeLessThan(px(DOOR_CARD.minHeight));
  });
  test("tighter padding and a smaller radius", () => {
    expect(topPad(TIER_CARD.padding)).toBeLessThan(topPad(DOOR_CARD.padding));
    expect(radius(TIER_CARD.borderRadius)).toBeLessThan(radius(DOOR_CARD.borderRadius));
  });
  test("smaller action buttons", () => {
    expect(px(TIER_ACTION.minHeight)).toBeLessThan(px(DOOR_BTN.minHeight));
    expect(Number(TIER_ACTION.fontSize)).toBeLessThan(Number(DOOR_BTN.fontSize));
  });
  test("but the SAME frame language — a tier is a door, not a different object", () => {
    for (const k of ["display", "flexDirection", "alignItems", "textAlign", "background", "border"] as const) {
      expect(TIER_CARD[k]).toBe(DOOR_CARD[k]);
    }
  });
});

describe("CTA tokens", () => {
  const vars = DOOR_CTA_VARS as unknown as Record<string, string>;
  test("the solo button wears the COURSE CODE'S colour, by token and not by copy", () => {
    // The headline paints the course code with var(--accent), which campus themes override
    // per school. A hex here would be one shade off on every campus that sets its own.
    expect(vars["--cta-solo-bg"]).toContain("var(--accent");
  });
  test("the solo token still resolves on a surface with no campus theme", () => {
    expect(vars["--cta-solo-bg"]).toMatch(/#[0-9A-Fa-f]{6}\s*\)$/);
  });
  test("the chapter button is the COOL half of the pair — not a second warm fill", () => {
    // Two warm buttons side by side read as one button and one broken button.
    const chapter = vars["--cta-chapter-bg"];
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(chapter.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});
