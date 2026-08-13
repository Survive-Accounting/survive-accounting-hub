// TEMPLATE vs INSTANCE resolution. The load-bearing guarantee here is the FIRST
// test: a question with no instance renders exactly where the template puts it, so
// the split needed no data migration and nothing authored moved.
import { describe, expect, it } from "bun:test";

import { resolveCardSpot, resolveMemoSpot, stampFromTemplate, withInstanceSpot } from "./ceq-geom";
import { activeSlots, dealCentre, rackOf } from "./CeqPreviewer";
import type { DeckLayout } from "./types";

const FW = 1600, FH = 900;
const TEMPLATE: DeckLayout = {
  card: { x: 100, y: 200, scale: 1.2 },
  memoSlots: [{ x: 900, y: 20 }, { x: 900, y: 200, off: true }, { x: 900, y: 380 }],
};

describe("no instance ⇒ the template governs (zero drift after the split)", () => {
  it("uses the template card", () => {
    expect(resolveCardSpot(undefined, TEMPLATE, FW, FH)).toEqual({ x: 100, y: 200, scale: 1.2 });
  });

  it("walks ACTIVE template slots, skipping switched-off ones", () => {
    expect(resolveMemoSpot(undefined, TEMPLATE, 0, FW, FH)).toEqual({ x: 900, y: 20, scale: 1 });
    expect(resolveMemoSpot(undefined, TEMPLATE, 1, FW, FH)).toEqual({ x: 900, y: 380, scale: 1 }); // slot 2 is off
  });

  it("falls back to the deal centre with no template at all", () => {
    expect(resolveCardSpot(undefined, undefined, FW, FH)).toEqual({ ...dealCentre(FW, FH), scale: 1 });
  });

  it("stacks below the last active slot once they run out — never a repeat spot", () => {
    const live = activeSlots(rackOf(TEMPLATE.memoSlots, FW, FH));
    const seen = new Set<string>();
    for (let i = 0; i < live.length + 4; i++) { const s = resolveMemoSpot(undefined, TEMPLATE, i, FW, FH); seen.add(`${s.x},${s.y}`); }
    expect(seen.size).toBe(live.length + 4);
  });
});

describe("instance wins, per question and per slot", () => {
  const inst = { card: { x: 10, y: 20, scale: 2 }, memoSlots: [undefined as never, { x: 55, y: 66, scale: 0.8 }] };

  it("uses the question's own card spot", () => {
    expect(resolveCardSpot(inst, TEMPLATE, FW, FH)).toEqual({ x: 10, y: 20, scale: 2 });
  });

  it("overrides ONLY the slots it has — the rest still follow the template", () => {
    expect(resolveMemoSpot(inst, TEMPLATE, 1, FW, FH)).toEqual({ x: 55, y: 66, scale: 0.8 });
    expect(resolveMemoSpot(inst, TEMPLATE, 0, FW, FH)).toEqual({ x: 900, y: 20, scale: 1 }); // untouched
  });
});

describe("withInstanceSpot — moving one thing never disturbs another", () => {
  it("writes the card without inventing memo slots", () => {
    const g = withInstanceSpot(undefined, undefined, { x: 5.4, y: 9.6, scale: 1 });
    expect(g.card).toEqual({ x: 5, y: 10, scale: 1 }); // rounded
    expect(g.memoSlots).toBeUndefined();
  });

  it("writes one memo slot and leaves the card + sibling slots alone", () => {
    const before = { card: { x: 1, y: 2, scale: 1 }, memoSlots: [{ x: 3, y: 4, scale: 1 }, { x: 5, y: 6, scale: 1 }] };
    const after = withInstanceSpot(before, 1, { x: 70, y: 80, scale: 1.5 });
    expect(after.card).toEqual(before.card);
    expect(after.memoSlots?.[0]).toEqual(before.memoSlots[0]);
    expect(after.memoSlots?.[1]).toEqual({ x: 70, y: 80, scale: 1.5 });
  });

  it("does not mutate the instance it was handed", () => {
    const before = { card: { x: 1, y: 2 }, memoSlots: [{ x: 3, y: 4 }] };
    const snapshot = JSON.stringify(before);
    withInstanceSpot(before, 0, { x: 99, y: 99, scale: 1 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("stampFromTemplate — apply-to-all", () => {
  it("writes exactly the slots the question uses, at the template's active spots", () => {
    const g = stampFromTemplate(TEMPLATE, 2, FW, FH);
    expect(g.card).toEqual({ x: 100, y: 200, scale: 1.2 });
    expect(g.memoSlots).toEqual([{ x: 900, y: 20, scale: 1 }, { x: 900, y: 380, scale: 1 }]);
  });

  it("is what a no-instance question already renders — stamping changes nothing visually", () => {
    const g = stampFromTemplate(TEMPLATE, 3, FW, FH);
    for (let i = 0; i < 3; i++) {
      const before = resolveMemoSpot(undefined, TEMPLATE, i, FW, FH);
      const after = resolveMemoSpot(g, TEMPLATE, i, FW, FH);
      expect(after).toEqual(before);
    }
    expect(resolveCardSpot(g, TEMPLATE, FW, FH)).toEqual(resolveCardSpot(undefined, TEMPLATE, FW, FH));
  });

  it("carries no chain items ⇒ no slots written", () => {
    expect(stampFromTemplate(TEMPLATE, 0, FW, FH).memoSlots).toEqual([]);
  });
});
