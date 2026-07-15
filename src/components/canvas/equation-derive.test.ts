import { describe, expect, test } from "bun:test";

import { coaLookup, deriveEquationArrows, equationBucketOf, lineEquationEffect, sideOfLine } from "./equation-derive";
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
