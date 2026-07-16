import { describe, expect, test } from "bun:test";

import { coaLookup, deriveArrows, deriveEquationArrows, equationBucketOf, lineEquationEffect, rubricOf, sideOfLine } from "./equation-derive";
import type { CoaAccount } from "./je-logic";

const A = (name: string, type: string, normal: "debit" | "credit"): CoaAccount => ({ name, type, normal });
const COA: CoaAccount[] = [
  A("Cash", "asset", "debit"),
  A("Equipment", "asset", "debit"),
  A("Accounts Receivable", "asset", "debit"),
  A("Accumulated Depreciation", "contra_asset", "credit"),
  A("Accounts Payable", "liability", "credit"),
  A("Notes Payable", "liability", "credit"),
  A("Premium on Bonds Payable", "liability_adjunct", "credit"),
  A("Owner's Capital", "equity", "credit"),
  A("Owner's Drawings", "contra_equity", "debit"),
  A("Service Revenue", "revenue", "credit"),
  A("Rent Expense", "expense", "debit"),
  A("Depreciation Expense", "expense", "debit"),
];
const dr = (account: string) => ({ account, side: "dr" as const });
const cr = (account: string) => ({ account, side: "cr" as const });

describe("equationBucketOf — types incl. contra fold correctly", () => {
  test("assets bucket", () => {
    expect(equationBucketOf("asset")).toBe("assets");
    expect(equationBucketOf("contra_asset")).toBe("assets");
  });
  test("liabilities bucket incl adjunct", () => {
    expect(equationBucketOf("liability")).toBe("liabilities");
    expect(equationBucketOf("contra_liability")).toBe("liabilities");
    expect(equationBucketOf("liability_adjunct")).toBe("liabilities");
  });
  test("equity bucket folds revenue/expense (R/E lens)", () => {
    expect(equationBucketOf("equity")).toBe("equity");
    expect(equationBucketOf("contra_equity")).toBe("equity");
    expect(equationBucketOf("revenue")).toBe("equity");
    expect(equationBucketOf("contra_revenue")).toBe("equity");
    expect(equationBucketOf("expense")).toBe("equity");
  });
  test("unknown → null", () => expect(equationBucketOf("mystery")).toBeNull());
});

describe("sideOfLine", () => {
  test("explicit side wins", () => expect(sideOfLine({ side: "cr", dr: 5 })).toBe("cr"));
  test("infers from amount", () => {
    expect(sideOfLine({ dr: 100 })).toBe("dr");
    expect(sideOfLine({ cr: 100 })).toBe("cr");
    expect(sideOfLine({})).toBeNull();
  });
});

describe("deriveEquationArrows — canonical scenarios", () => {
  const coa = COA;
  test("Owner invests cash → A↑ E↑, L none", () => {
    const r = deriveEquationArrows([dr("Cash"), cr("Owner's Capital")], coa);
    expect(r).toEqual({ assets: "up", liabilities: "none", equity: "up" });
  });
  test("Buy equipment with cash → A↑↓ (both), L/E none", () => {
    const r = deriveEquationArrows([dr("Equipment"), cr("Cash")], coa);
    expect(r).toEqual({ assets: "both", liabilities: "none", equity: "none" });
  });
  test("Buy supplies on account → A↑ L↑", () => {
    const r = deriveEquationArrows([dr("Equipment"), cr("Accounts Payable")], coa);
    expect(r).toEqual({ assets: "up", liabilities: "up", equity: "none" });
  });
  test("Pay a payable with cash → A↓ L↓", () => {
    const r = deriveEquationArrows([dr("Accounts Payable"), cr("Cash")], coa);
    expect(r).toEqual({ assets: "down", liabilities: "down", equity: "none" });
  });
  test("Service revenue for cash → A↑ E↑ (revenue folds to equity)", () => {
    const r = deriveEquationArrows([dr("Cash"), cr("Service Revenue")], coa);
    expect(r).toEqual({ assets: "up", liabilities: "none", equity: "up" });
  });
  test("Pay rent expense → A↓ E↓ (expense folds to equity)", () => {
    const r = deriveEquationArrows([dr("Rent Expense"), cr("Cash")], coa);
    expect(r).toEqual({ assets: "down", liabilities: "none", equity: "down" });
  });
  test("Record depreciation (contra_asset) → A↓ E↓", () => {
    const r = deriveEquationArrows([dr("Depreciation Expense"), cr("Accumulated Depreciation")], coa);
    expect(r).toEqual({ assets: "down", liabilities: "none", equity: "down" });
  });
  test("Owner withdrawal (contra_equity) → A↓ E↓", () => {
    const r = deriveEquationArrows([dr("Owner's Drawings"), cr("Cash")], coa);
    expect(r).toEqual({ assets: "down", liabilities: "none", equity: "down" });
  });
  test("liability_adjunct credited moves liabilities up", () => {
    const r = deriveEquationArrows([dr("Cash"), cr("Notes Payable"), cr("Premium on Bonds Payable")], coa);
    expect(r).toEqual({ assets: "up", liabilities: "up", equity: "none" });
  });
  test("unknown accounts / blank lines are skipped", () => {
    const r = deriveEquationArrows([dr("Mystery Account"), { account: "" }, dr("Cash")], coa);
    expect(r).toEqual({ assets: "up", liabilities: "none", equity: "none" });
  });
});

describe("lineEquationEffect — per-line click-through", () => {
  const map = coaLookup([{ accounts: COA }]);
  test("Cash DR → assets up", () => expect(lineEquationEffect(dr("Cash"), map)).toEqual({ bucket: "assets", dir: "up" }));
  test("Accumulated Depreciation CR → assets down", () =>
    expect(lineEquationEffect(cr("Accumulated Depreciation"), map)).toEqual({ bucket: "assets", dir: "down" }));
  test("Accounts Payable CR → liabilities up", () =>
    expect(lineEquationEffect(cr("Accounts Payable"), map)).toEqual({ bucket: "liabilities", dir: "up" }));
  test("blank account → null", () => expect(lineEquationEffect({ account: "" }, map)).toBeNull());
});

describe("Effect Rubric package — presets + rubric", () => {
  // ER2: the canonical diagnosis case — "Performing services on credit"
  const servicesOnCredit = [
    { account: "Accounts Receivable", side: "dr" as const, dr: 500, cr: null },
    { account: "Service Revenue", side: "cr" as const, dr: null, cr: 500 },
  ];

  test("ER2: A=L+E derives A↑ L— E↑ (revenue folds into equity)", () => {
    const arr = deriveArrows(servicesOnCredit, COA, "ale");
    expect(arr.assets).toBe("up");
    expect(arr.liabilities).toBe("none");
    expect(arr.equity).toBe("up");
  });

  test("ER4: the SAME scenario on the R/E preset derives Revenues↑ (not equity)", () => {
    const arr = deriveArrows(servicesOnCredit, COA, "re");
    expect(arr.revenues).toBe("up");
    expect(arr.expenses).toBe("none");
    // balance-sheet buckets don't participate on the income lens
    expect(arr.assets).toBe("none");
  });

  test("ER4: paying an expense in cash — ale E↓ ; re Expenses↑", () => {
    const lines = [
      { account: "Rent Expense", side: "dr" as const, dr: 300, cr: null },
      { account: "Cash", side: "cr" as const, dr: null, cr: 300 },
    ];
    expect(deriveArrows(lines, COA, "ale").equity).toBe("down"); // expense debit lowers equity
    expect(deriveArrows(lines, COA, "re").expenses).toBe("up");   // expense itself goes up
    expect(deriveArrows(lines, COA, "ale").assets).toBe("down");  // cash out
  });

  test("equationBucketOf is preset-aware", () => {
    expect(equationBucketOf("revenue", "ale")).toBe("equity");
    expect(equationBucketOf("revenue", "re")).toBe("revenues");
    expect(equationBucketOf("expense", "re")).toBe("expenses");
    expect(equationBucketOf("asset", "re")).toBeNull(); // not on the income lens
  });

  test("ER5: rubric signs are static per account type", () => {
    expect(rubricOf("assets")).toEqual({ dr: "+", cr: "-" });
    expect(rubricOf("liabilities")).toEqual({ dr: "-", cr: "+" });
    expect(rubricOf("equity")).toEqual({ dr: "-", cr: "+" });
    expect(rubricOf("revenues")).toEqual({ dr: "-", cr: "+" });
    expect(rubricOf("expenses")).toEqual({ dr: "+", cr: "-" });
  });

  test("back-compat deriveEquationArrows still returns A=L+E", () => {
    const arr = deriveEquationArrows(servicesOnCredit, COA);
    expect(arr).toMatchObject({ assets: "up", liabilities: "none", equity: "up" });
  });
});
