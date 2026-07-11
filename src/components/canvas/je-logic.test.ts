import { describe, expect, test } from "bun:test";

import { balanceState, effectiveSettings, groupCoa, groupLines, hopLine, moveLine, sideOf, swapLines, JE_PRESETS } from "./je-logic";
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

describe("effectiveSettings", () => {
  test("presets apply; per-card overrides win", () => {
    expect(effectiveSettings(undefined, "guided").showPicker).toBe(true);
    expect(effectiveSettings(undefined, "blind").showGhosts).toBe(false);
    expect(effectiveSettings({ showPicker: true }, "blind").showPicker).toBe(true);
  });
  test("legacy showAmounts flag maps in when card has no explicit setting", () => {
    expect(effectiveSettings(undefined, "guided", false).showAmounts).toBe(false);
    expect(effectiveSettings({ showAmounts: true }, "guided", false).showAmounts).toBe(true);
  });
  test("blind preset really strips everything", () => {
    const b = JE_PRESETS.blind;
    expect(b.showPicker || b.allowSearch || b.showNormalChips || b.showGhosts || b.lightbulbs).toBe(false);
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
