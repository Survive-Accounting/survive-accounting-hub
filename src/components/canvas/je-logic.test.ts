import { describe, expect, test } from "bun:test";

import {
  balanceState,
  blankFrom,
  effectiveMode,
  effectiveSettings,
  ensureMinLines,
  groupCoa,
  groupLines,
  hasAttempt,
  hopLine,
  hopTo,
  moveLine,
  normalizePreset,
  sideOf,
  swapLines,
  JE_PRESETS,
} from "./je-logic";
import type { JeLine } from "./types";

const L = (id: string, side: "dr" | "cr", amt: number | null = 100, extra: Partial<JeLine> = {}): JeLine => ({
  id,
  account: `acct ${id}`,
  dr: side === "dr" ? amt : null,
  cr: side === "cr" ? amt : null,
  side,
  ...extra,
});

describe("sideOf", () => {
  test("explicit side wins; legacy lines derive from amounts", () => {
    expect(sideOf({ id: "x", account: "", dr: null, cr: 50 })).toBe("cr"); // legacy credit
    expect(sideOf({ id: "x", account: "", dr: 50, cr: null })).toBe("dr");
    expect(sideOf({ id: "x", account: "", dr: null, cr: null })).toBe("dr"); // blank defaults debit
    expect(sideOf({ id: "x", account: "", dr: null, cr: 50, side: "dr" })).toBe("dr"); // explicit wins
  });
});

describe("moveLine", () => {
  test("dr → cr at index keeps amount in the credit column", () => {
    const lines = [L("a", "dr"), L("b", "dr", 40), L("c", "cr", 140)];
    const out = moveLine(lines, "b", "cr", 0);
    const g = groupLines(out);
    expect(g.dr.map((l) => l.id)).toEqual(["a"]);
    expect(g.cr.map((l) => l.id)).toEqual(["b", "c"]);
    const b = out.find((l) => l.id === "b")!;
    expect(b.cr).toBe(40);
    expect(b.dr).toBeNull();
  });

  test("reorder within a side", () => {
    const lines = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
    const out = moveLine(lines, "a", "dr", 1);
    expect(groupLines(out).dr.map((l) => l.id)).toEqual(["b", "a"]);
  });

  test("index clamps to the end", () => {
    const lines = [L("a", "dr"), L("c", "cr")];
    const out = moveLine(lines, "a", "cr", 99);
    expect(groupLines(out).cr.map((l) => l.id)).toEqual(["c", "a"]);
  });
});

describe("swapLines", () => {
  test("dropping one account on another swaps their sides, amounts travel", () => {
    const lines = [L("a", "dr", 100), L("b", "cr", 100)];
    const out = swapLines(lines, "a", "b");
    const a = out.find((l) => l.id === "a")!;
    const b = out.find((l) => l.id === "b")!;
    expect(sideOf(a)).toBe("cr");
    expect(a.cr).toBe(100);
    expect(a.dr).toBeNull();
    expect(sideOf(b)).toBe("dr");
    expect(b.dr).toBe(100);
  });

  test("same-side swap is a no-op on sides", () => {
    const lines = [L("a", "dr"), L("b", "dr")];
    const out = swapLines(lines, "a", "b");
    expect(out.every((l) => sideOf(l) === "dr")).toBe(true);
  });
});

describe("hopLine", () => {
  test("← / → moves a line to the other side's end", () => {
    const lines = [L("a", "dr"), L("b", "cr")];
    const out = hopLine(lines, "a");
    expect(groupLines(out).cr.map((l) => l.id)).toEqual(["b", "a"]);
    const back = hopLine(out, "a");
    expect(groupLines(back).dr.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("hopTo (A6 regression: arrows act on the SELECTED block)", () => {
  const lines = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
  test("moves exactly the selected id — never a neighbor", () => {
    const out = hopTo(lines, "a", "cr")!;
    const g = groupLines(out);
    expect(g.dr.map((l) => l.id)).toEqual(["b"]); // b (the block below a) did NOT move
    expect(g.cr.map((l) => l.id)).toEqual(["c", "a"]);
  });
  test("no selection / unknown id / already on that side → null (no undo step)", () => {
    expect(hopTo(lines, undefined, "cr")).toBeNull();
    expect(hopTo(lines, "zzz", "cr")).toBeNull();
    expect(hopTo(lines, "a", "dr")).toBeNull();
  });
});

describe("balanceState (the ??? contract)", () => {
  test("any visible null amount → unknown, even if the rest balances", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100), L("c", "cr", null)]).state).toBe("unknown");
  });
  test("hidden lines don't count", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100), L("c", "cr", null, { hidden: true })]).state).toBe("balanced");
  });
  test("all-real amounts do the math", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 60)]).state).toBe("off");
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100)]).state).toBe("balanced");
  });
  test("empty card is unknown, not balanced", () => {
    expect(balanceState([L("a", "dr", null), L("b", "cr", null)]).state).toBe("unknown");
  });
});

describe("effectiveSettings (two modes)", () => {
  test("presets apply; per-card overrides win", () => {
    expect(effectiveSettings(undefined, "guided").showPicker).toBe(true);
    expect(effectiveSettings(undefined, "practice").showPicker).toBe(false);
    expect(effectiveSettings({ showPicker: true }, "practice").showPicker).toBe(true);
  });
  test("NEVER zero-grid: ghost sockets ship on in both presets", () => {
    expect(JE_PRESETS.guided.showGhosts).toBe(true);
    expect(JE_PRESETS.practice.showGhosts).toBe(true);
  });
  test("retired keys in old per-card overrides are ignored, not spread in", () => {
    const s = effectiveSettings({ allowSearch: false, showAmounts: false } as never, "guided");
    expect("allowSearch" in s).toBe(false);
    expect("showAmounts" in s).toBe(false);
    expect(s.showPicker).toBe(true);
  });
});

describe("mode normalization (blind retired)", () => {
  test("legacy blind reads as practice; unknown falls back to guided", () => {
    expect(normalizePreset("blind")).toBe("practice");
    expect(normalizePreset("practice")).toBe("practice");
    expect(normalizePreset("guided")).toBe("guided");
    expect(normalizePreset(undefined)).toBe("guided");
    expect(normalizePreset("nonsense")).toBe("guided");
  });
  test("per-card mode wins over the canvas default", () => {
    expect(effectiveMode("practice", "guided")).toBe("practice");
    expect(effectiveMode(undefined, "practice")).toBe("practice");
    expect(effectiveMode("blind" as never, "guided")).toBe("guided"); // invalid card mode → canvas default
  });
});

describe("ensureMinLines (the never-zero invariant)", () => {
  let seq = 0;
  const mkId = () => `n${++seq}`;
  test("deleting a whole side re-spawns one blank socket there", () => {
    const out = ensureMinLines([L("a", "dr")], mkId);
    const g = groupLines(out);
    expect(g.dr.map((l) => l.id)).toEqual(["a"]);
    expect(g.cr.length).toBe(1);
    expect(g.cr[0].account).toBe("");
  });
  test("empty card gets 1 debit + 1 credit", () => {
    const g = groupLines(ensureMinLines([], mkId));
    expect(g.dr.length).toBe(1);
    expect(g.cr.length).toBe(1);
  });
  test("a full card is untouched", () => {
    const lines = [L("a", "dr"), L("b", "cr")];
    expect(ensureMinLines(lines, mkId)).toBe(lines);
  });
});

describe("hasAttempt (practice reveal gate)", () => {
  test("blank sockets = no attempt; any typed account or amount counts", () => {
    const blank = { id: "x", account: "", dr: null, cr: null, side: "dr" as const };
    expect(hasAttempt([blank, { ...blank, id: "y", side: "cr" as const }])).toBe(false);
    expect(hasAttempt([{ ...blank, account: "Cash" }])).toBe(true);
    expect(hasAttempt([{ ...blank, dr: 100 }])).toBe(true);
  });
  test("hidden lines don't count as an attempt", () => {
    expect(hasAttempt([{ id: "x", account: "Cash", dr: 100, cr: null, hidden: true }])).toBe(false);
  });
});

describe("blankFrom (practice copy silhouette)", () => {
  test("same shape, fresh ids, no content", () => {
    let seq = 0;
    const out = blankFrom([L("a", "dr", 100), L("b", "dr", 40), L("c", "cr", 140)], () => `p${++seq}`);
    const g = groupLines(out);
    expect(g.dr.length).toBe(2);
    expect(g.cr.length).toBe(1);
    expect(out.every((l) => l.account === "" && l.dr === null && l.cr === null)).toBe(true);
    expect(out.map((l) => l.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("groupCoa", () => {
  test("5 groups in teaching order; contra rides with its parent", () => {
    const rows = [
      { canonical_name: "Cash", account_type: "asset", normal_balance: "debit" },
      { canonical_name: "Accumulated Depreciation", account_type: "contra_asset", normal_balance: "credit" },
      { canonical_name: "Accounts Payable", account_type: "liability", normal_balance: "credit" },
      { canonical_name: "Premium on Bonds Payable", account_type: "liability_adjunct", normal_balance: "credit" },
      { canonical_name: "Common Stock", account_type: "equity", normal_balance: "credit" },
      { canonical_name: "Sales Revenue", account_type: "revenue", normal_balance: "credit" },
      { canonical_name: "Rent Expense", account_type: "expense", normal_balance: "debit" },
    ];
    const g = groupCoa(rows);
    expect(g.map((x) => x.label)).toEqual(["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]);
    expect(g[0].accounts.map((a) => a.name)).toEqual(["Accumulated Depreciation", "Cash"]);
    expect(g[1].accounts.map((a) => a.name)).toEqual(["Accounts Payable", "Premium on Bonds Payable"]);
    expect(g[0].normal).toBe("debit");
  });
});
