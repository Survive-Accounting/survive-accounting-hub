import { describe, expect, test } from "bun:test";

import { migrateZTiers, nextZ, Z_BASE, zBaseOf, zTierOf } from "./zorder";

describe("zTierOf / zBaseOf (layer tiers)", () => {
  test("container < frame < element < card < memo", () => {
    expect(zTierOf("zone", undefined)).toBe("container");
    expect(zTierOf("lesson", undefined)).toBe("container");
    expect(zTierOf("frame", undefined)).toBe("frame");
    expect(zTierOf("heading", "heading")).toBe("element");
    expect(zTierOf("text", "text")).toBe("element");
    expect(zTierOf("je", "je")).toBe("card");
    expect(zTierOf("list", "list")).toBe("card");
    expect(zTierOf("memo", "memo")).toBe("memo");
    // the ordering the whole fix rests on
    expect(Z_BASE.container).toBeLessThan(Z_BASE.frame);
    expect(Z_BASE.frame).toBeLessThan(Z_BASE.element);
    expect(Z_BASE.element).toBeLessThan(Z_BASE.card);
    expect(Z_BASE.card).toBeLessThan(Z_BASE.memo);
  });
});

describe("nextZ (new-on-top, monotonic within tier)", () => {
  test("each call returns a higher z within the same tier", () => {
    const a = nextZ("je", "je");
    const b = nextZ("je", "je");
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThanOrEqual(Z_BASE.card);
    expect(b).toBeLessThan(Z_BASE.memo); // stays in the card tier
  });
  test("a memo always outranks a card, an element always under a card", () => {
    expect(nextZ("memo", "memo")).toBeGreaterThan(nextZ("je", "je"));
    expect(zBaseOf("heading", "heading")).toBeLessThan(zBaseOf("je", "je"));
  });
});

describe("migrateZTiers (load re-tier, preserves within-tier order)", () => {
  test("re-bases each node into its tier and keeps relative order by old z", () => {
    const nodes = [
      { id: "L", type: "lesson", zIndex: -1, data: { kind: "note" } },
      { id: "F", type: "frame", data: {} },
      { id: "cardOld", type: "je", zIndex: 12, data: { kind: "je" } },   // touched earlier
      { id: "cardNew", type: "je", zIndex: 40, data: { kind: "je" } },   // touched later → stays on top
      { id: "memo", type: "memo", zIndex: 5, data: { kind: "memo" } },
      { id: "heading", type: "heading", data: { kind: "heading" } },
    ];
    const out = migrateZTiers(nodes);
    const z = (id: string) => out.find((n) => n.id === id)!.zIndex!;
    // tiers hold: lesson < frame < heading < cards < memo
    expect(z("L")).toBeLessThan(z("F"));
    expect(z("F")).toBeLessThan(z("heading"));
    expect(z("heading")).toBeLessThan(z("cardOld"));
    expect(z("cardOld")).toBeLessThan(z("memo"));
    // within the card tier, the later-touched card stays above the earlier one
    expect(z("cardNew")).toBeGreaterThan(z("cardOld"));
    // memo outranks every card
    expect(z("memo")).toBeGreaterThan(z("cardNew"));
  });
});
