import { describe, expect, test } from "bun:test";

import { DC_SIDE, dcPickOf, dcRuleSteps, dcWalkView, formatTLines, parseTLines, tAccountShown, tAccountSteps, tPickOf } from "./ledger";

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

describe("the rubric-shaped rule (2026-09-16)", () => {
  test("the walk: bare, five boxes, then the two families", () => {
    expect(dcRuleSteps({ dcMode: "walk" })).toBe(8);
    expect(dcWalkView(0)).toEqual({ shown: [], lit: null });
    expect(dcWalkView(3).shown).toEqual(["A", "L", "E"]);
    expect(dcWalkView(6)).toEqual({ shown: ["A", "L", "E", "Rev", "Exp"], lit: ["A", "Exp"] });
    expect(dcWalkView(7).lit).toEqual(["L", "E", "Rev"]);
    expect(dcWalkView(null).shown).toHaveLength(5);
  });
  test("contra zooms and the blank L have their own steps; a still slide has none", () => {
    expect(dcRuleSteps({ dcMode: "contraA" })).toBe(2);
    expect(dcRuleSteps({ dcMode: "contraE" })).toBe(3);
    expect(dcRuleSteps({ dcMode: "blank" })).toBe(2);
    expect(dcRuleSteps({})).toBe(0);
  });
  test("a 'How do you increase ____?' card reads as a rubric pick", () => {
    expect(dcPickOf("How do you increase Equipment?", [{ text: "Debit", correct: true }, { text: "Credit", correct: false }])).toEqual({ account: "Equipment", direction: "increase", side: "L" });
    expect(dcPickOf("How do you decrease an Asset?", [{ text: "Debit", correct: false }, { text: "Credit", correct: true }])).toEqual({ account: "Asset", direction: "decrease", side: "R" });
    expect(dcPickOf("Which side increases Revenue?", [{ text: "Credit", correct: true }])).toEqual({ account: "Revenue", direction: "increase", side: "R" });
    expect(dcPickOf("When would we debit Supplies?", [{ text: "We buy supplies", correct: true }])).toBeNull();
  });
});
