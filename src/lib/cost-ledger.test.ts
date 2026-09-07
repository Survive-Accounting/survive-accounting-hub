import { describe, expect, test } from "bun:test";

import { summarizeCosts } from "./cost-ledger.functions";

describe("summarizeCosts", () => {
  test("totals per set with a kind breakdown, biggest first; unknown kinds fold into other", () => {
    const sets = summarizeCosts([
      { set_id: "a", kind: "ai", usd: "0.10" },
      { set_id: "a", kind: "recraft", usd: 0.05 },
      { set_id: "b", kind: "ai", usd: 0.4 },
      { set_id: "b", kind: "mystery", usd: 0.01 },
      { set_id: null, kind: "mux", usd: 0.02 },
    ]);
    expect(sets.map((s) => s.setId)).toEqual(["b", "a", "(no set)"]);
    expect(sets[1].total).toBeCloseTo(0.15, 6);
    expect(sets[1].byKind).toEqual({ ai: 0.1, recraft: 0.05 });
    expect(sets[0].byKind.other).toBeCloseTo(0.01, 6);
    expect(sets[1].events).toBe(2);
  });
  test("a non-numeric usd is skipped, not summed as NaN", () => {
    const sets = summarizeCosts([{ set_id: "a", kind: "ai", usd: "x" }, { set_id: "a", kind: "ai", usd: 1 }]);
    expect(sets[0].total).toBe(1);
    expect(sets[0].events).toBe(1);
  });
});
