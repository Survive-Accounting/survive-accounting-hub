// Q0 SLOT PALETTE — the geometry every memo in a set snaps to. These are pure
// functions on purpose: the rack must be generated (never hand-placed) so two slots
// can't be born at the same coordinate, and only ACTIVE slots may take a placement.
import { describe, expect, it } from "bun:test";

import { activeSlots, PALETTE_N, paletteSlots, rackOf } from "./CeqPreviewer";
import type { DeckSlotLayout } from "./types";

const FW = 1600, FH = 900;

describe("paletteSlots", () => {
  it("generates the full palette", () => {
    expect(paletteSlots(FW, FH)).toHaveLength(PALETTE_N);
  });

  it("never puts two slots at the same coordinate", () => {
    const seen = new Set(paletteSlots(FW, FH).map((s) => `${s.x},${s.y}`));
    expect(seen.size).toBe(PALETTE_N);
  });

  it("spreads them vertically down one column, in order, with a clear gap", () => {
    const slots = paletteSlots(FW, FH);
    expect(new Set(slots.map((s) => s.x)).size).toBe(1); // one column, right side
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].y).toBeGreaterThan(slots[i - 1].y);
      expect(slots[i].y - slots[i - 1].y).toBeGreaterThanOrEqual(150); // no overlap
    }
  });

  it("stays inside the frame even when it is short", () => {
    for (const fh of [400, 600, 900, 1200]) {
      const slots = paletteSlots(FW, fh);
      expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(PALETTE_N);
      expect(slots[0].y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("rackOf", () => {
  it("pads a short saved layout up to the full palette, padding INACTIVE", () => {
    const saved: DeckSlotLayout[] = [{ x: 10, y: 20, scale: 1 }, { x: 10, y: 200, scale: 1 }];
    const rack = rackOf(saved, FW, FH);
    expect(rack).toHaveLength(PALETTE_N);
    expect(rack.slice(0, 2)).toEqual(saved);            // saved slots untouched
    expect(rack.slice(2).every((s) => s.off)).toBe(true); // generated ones are off
  });

  it("keeps every slot of a pre-palette layout ACTIVE (no off flag = on)", () => {
    const saved: DeckSlotLayout[] = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(activeSlots(rackOf(saved, FW, FH))).toHaveLength(3);
  });

  it("generates the whole rack when nothing is saved", () => {
    const rack = rackOf(undefined, FW, FH);
    expect(rack).toHaveLength(PALETTE_N);
    expect(activeSlots(rack)).toHaveLength(0); // nothing switched on yet
  });

  it("keeps extra slots beyond the palette rather than dropping them", () => {
    const saved: DeckSlotLayout[] = Array.from({ length: 7 }, (_, i) => ({ x: 0, y: i * 10 }));
    expect(rackOf(saved, FW, FH)).toHaveLength(7);
  });
});

describe("activeSlots", () => {
  it("skips the switched-off slots, preserving order", () => {
    const rack: DeckSlotLayout[] = [
      { x: 0, y: 0 }, { x: 0, y: 10, off: true }, { x: 0, y: 20 }, { x: 0, y: 30, off: true }, { x: 0, y: 40 },
    ];
    expect(activeSlots(rack).map((s) => s.y)).toEqual([0, 20, 40]);
  });

  it("is empty when every slot is off — placement then falls back, never overlaps", () => {
    expect(activeSlots([{ x: 0, y: 0, off: true }, { x: 0, y: 9, off: true }])).toHaveLength(0);
  });
});
