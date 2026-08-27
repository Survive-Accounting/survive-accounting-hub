// "WHEN IT COUNTS" (cash vs. accrual) tests. The whole exhibit turns on WHICH
// MONTH each basis stamps, so those answers are the contract — above all the
// audited correction that accrual stamps the month the cost was INCURRED, not
// the month the bill is paid. The source deck got that wrong; these tests exist
// so it can never come back.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  BASES, BASIS_EXAMPLES, BASIS_REVEAL_MAX, BASIS_REVEAL_STEPS, GAPS_FOOTER, PUNCHLINE, TIMING_GAPS,
  basisBandVisible, basisDef, basisExample, basisNodeIds, principleFor, stampsDiffer,
} from "./cash-accrual-config";
import { nextModeId } from "./exhibit-modes";

const cardSrc = readFileSync(join(import.meta.dir, "cards", "BasisNode.tsx"), "utf8").split("\r\n").join("\n");
const configSrc = readFileSync(join(import.meta.dir, "cash-accrual-config.ts"), "utf8").split("\r\n").join("\n");

describe("the answers — which month each basis stamps", () => {
  test("EXPENSE: accrual stamps DECEMBER (incurred), cash stamps JANUARY (paid)", () => {
    const ex = basisExample("expense")!;
    expect(ex.stamps.accrual).toBe("DECEMBER");
    expect(ex.stamps.cash).toBe("JANUARY");
  });

  test("REGRESSION GUARD: accrual never stamps the month the bill is PAID", () => {
    // The source deck's error. If someone "fixes" the config to January, this
    // fails loudly rather than shipping a wrong answer to camera.
    const ex = basisExample("expense")!;
    expect(ex.stamps.accrual).not.toBe(ex.cash.month);
    expect(ex.stamps.accrual).toBe(ex.action.month);
  });

  test("REVENUE: accrual stamps MAY (earned), cash stamps JUNE (collected)", () => {
    const ex = basisExample("revenue")!;
    expect(ex.stamps.accrual).toBe("MAY");
    expect(ex.stamps.cash).toBe("JUNE");
  });

  test("in EVERY example accrual follows the action and cash follows the money", () => {
    for (const ex of BASIS_EXAMPLES) {
      expect(ex.stamps.accrual).toBe(ex.action.month);
      expect(ex.stamps.cash).toBe(ex.cash.month);
    }
  });

  test("THE LESSON: the two stamps always land in different months", () => {
    for (const ex of BASIS_EXAMPLES) expect(stampsDiffer(ex)).toBe(true);
  });

  test("both stamped months are real columns of that example's strip", () => {
    for (const ex of BASIS_EXAMPLES) {
      expect(ex.months).toContain(ex.stamps.accrual);
      expect(ex.months).toContain(ex.stamps.cash);
      expect(ex.months).toHaveLength(2);
    }
  });
});

describe("the recognition principles — reused, not redefined", () => {
  test("accrual speaks EARNED for revenue and INCURRED for expenses", () => {
    expect(principleFor("accrual", basisExample("revenue")!)).toContain("EARNED");
    expect(principleFor("accrual", basisExample("expense")!)).toContain("INCURRED");
  });
  test("it names the Matching alias, the way professors say it", () => {
    expect(basisDef("accrual").principle.expense).toContain("AKA Matching");
  });
  test("a TODO marks the Principles-exhibit unification so it is not forgotten", () => {
    expect(configSrc).toContain("TODO(principles-exhibit)");
  });
  test("the five-word rules stay on their diet", () => {
    for (const b of BASES) expect(b.rule.split(/\s+/).length).toBeLessThanOrEqual(6);
  });
});

describe("punchline + the bridge to adjusting entries", () => {
  test("the thesis is the exhibit's last beat and says cash movement is not recognition", () => {
    expect(PUNCHLINE).toBe("WHEN CASH MOVES ≠ WHEN IT COUNTS");
    expect(BASIS_REVEAL_STEPS[BASIS_REVEAL_MAX]).toBe("punchline");
  });
  test("four timing gaps, each naming what it becomes", () => {
    expect(TIMING_GAPS).toHaveLength(4);
    expect(TIMING_GAPS.map((g) => g.becomes)).toEqual([
      "Prepaid (asset)", "Accrued expense", "Unearned revenue (liability)", "Accrued revenue (A/R)",
    ]);
  });
  test("the footer states why this exhibit heads Adjusting Entries", () => {
    expect(GAPS_FOOTER).toBe("Every adjusting entry exists to close one of these gaps.");
  });
});

describe("reveal + wiring", () => {
  test("four beats: pins → accrual → cash → punchline", () => {
    expect([...BASIS_REVEAL_STEPS]).toEqual(["pins", "accrual", "cash", "punchline"]);
    expect(basisBandVisible("accrual", 0)).toBe(false);
    expect(basisBandVisible("accrual", 1)).toBe(true);
    expect(basisBandVisible("punchline", 2)).toBe(false);
    expect(basisBandVisible("punchline", 3)).toBe(true);
  });
  test("the gap strip is a manual toggle, never a reveal beat", () => {
    expect([...BASIS_REVEAL_STEPS] as string[]).not.toContain("gaps");
  });
  test("film renders the sequence; authoring and student surfaces render full", () => {
    expect(cardSrc).toContain("!film || basisBandVisible(band, revealTick)");
  });
  test("node ids are unique", () => {
    const ids = basisNodeIds();
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("months are shared COLUMNS — the misalignment survives every width", () => {
    // The invariant is SHARED-ness, not the gutter's pixel width: exactly one
    // column template exists, every row renders through it, and both widths
    // keep two equal month columns. Tuning the gutter must not break this test;
    // splitting the strip and the rows onto separate grids must.
    expect(cardSrc.split("const cols =").length).toBe(2);
    expect(cardSrc).toContain("gridTemplateColumns: cols");
    expect(cardSrc.split("gridTemplateColumns:").length).toBe(3); // the shared one + the gap strip's own
    const cols = /const cols = narrow \? "([^"]+)" : "([^"]+)"/.exec(cardSrc);
    expect(cols).not.toBeNull();
    for (const tpl of [cols![1], cols![2]]) expect(tpl.endsWith("1fr 1fr")).toBe(true);
  });
  test("it survives another moded exhibit owning the shared mode store", () => {
    expect(cardSrc).toContain("basisExample(mode) ?? BASIS_EXAMPLES[0]");
  });
  test("M is never a dead key: from a foreign mode it advances to the SECOND example", () => {
    // The store's initial mode belongs to the cycle exhibit. This card renders
    // BASIS_EXAMPLES[0] as its fallback, so advancing to [0] would move the
    // store and nothing on screen — a dead press mid-take.
    const ids = BASIS_EXAMPLES.map((e) => e.id);
    expect(nextModeId(ids, "source")).toBe(ids[1]);
    expect(nextModeId(ids, ids[0])).toBe(ids[1]);
    expect(nextModeId(ids, ids[1])).toBe(ids[0]);
  });
});
