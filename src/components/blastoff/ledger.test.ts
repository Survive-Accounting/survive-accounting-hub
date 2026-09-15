import { describe, expect, test } from "bun:test";

import { DC_SIDE, formatTLines, parseTLines, tAccountShown, tAccountSteps, tPickOf } from "./ledger";

describe("the ledger slides", () => {
  test("ADE on the debit side, LER on the credit side", () => {
    expect(["A", "Div", "Exp"].map((k) => DC_SIDE[k as "A"])).toEqual(["debit", "debit", "debit"]);
    expect(["L", "E", "Rev"].map((k) => DC_SIDE[k as "L"])).toEqual(["credit", "credit", "credit"]);
  });
  test("a T-account walks bare → each line → the ending", () => {
    const t = { name: "Cash", normal: "debit" as const, lines: [{ side: "L" as const, amount: "1,000", label: "Beg." }, { side: "R" as const, amount: "200" }], ending: { side: "L" as const, amount: "800" } };
    expect(tAccountSteps(t)).toBe(4);
    expect(tAccountShown(t, 0)).toEqual({ lines: 0, ending: false });
    expect(tAccountShown(t, 2)).toEqual({ lines: 2, ending: false });
    expect(tAccountShown(t, 3)).toEqual({ lines: 2, ending: true });
    expect(tAccountShown(t, null)).toEqual({ lines: 2, ending: true });
  });
  test("the typed form round-trips", () => {
    const parsed = parseTLines("L 1,000 Beg.\nR 200 Pay rent\nDr 500\n= L 1,300\nnonsense");
    expect(parsed.lines).toEqual([{ side: "L", amount: "1,000", label: "Beg." }, { side: "R", amount: "200", label: "Pay rent" }, { side: "L", amount: "500" }]);
    expect(parsed.ending).toEqual({ side: "L", amount: "1,300" });
    expect(parseTLines(formatTLines(parsed))).toEqual(parsed);
  });
  test("a normal-balance card reads as a T pick", () => {
    expect(tPickOf("What is the normal balance of Accounts Payable?", [{ text: "Debit", correct: false }, { text: "Credit", correct: true }])).toEqual({ account: "Accounts Payable", side: "R" });
    expect(tPickOf("Which side increases Cash?", [])).toBeNull();
  });
});
