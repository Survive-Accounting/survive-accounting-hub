import { describe, expect, test } from "bun:test";

import { buildAmortSchedule, type BondParams } from "../src/lib/je/amortization";
import { labelForRef, resolveSlot } from "../src/lib/je/slot-resolver";

// Canonical discount schedule — the same numbers the doc exprs were authored against.
const P: BondParams = {
  face: 500_000,
  statedRateAnnual: 0.08,
  marketRateAnnual: 0.1,
  termYears: 5,
  paymentsPerYear: 2,
  issueDate: "2026-01-01",
};
const sched = buildAmortSchedule(P, "effective");
// Known cells: issuePrice 461,391; p1 cash 20,000 / interest 23,070 / amort 3,070 / CV 464,461;
// p2 interest 23,223 / amort 3,223 / CV 467,684; p4 CV computed below.
const cv4 = sched.rows[3].carryingValueAfter;

const val = (expr: string) => resolveSlot(expr, sched).value;

describe("resolveSlot — plain refs (rich, chainable derivations)", () => {
  test("params (rates stay unrounded INSIDE arithmetic; only final value rounds)", () => {
    expect(val("param:face")).toBe(500_000);
    // 0.08 must not be pre-rounded during evaluation, or this would be 0:
    expect(val("param:face * param:statedRateAnnual")).toBe(40_000);
  });
  test("issuePrice returns the math-core derivation", () => {
    const r = resolveSlot("issuePrice", sched);
    expect(r.value).toBe(461_391);
    expect(r.derivation.formulaText).toContain("PV of coupons");
  });
  test("schedule cells", () => {
    expect(val("schedule:1:cashPayment")).toBe(20_000);
    expect(val("schedule:1:interestExpense")).toBe(23_070);
    expect(val("schedule:1:carryingValueAfter")).toBe(464_461);
    expect(val("schedule:2:interestExpense")).toBe(23_223);
  });
  test("plain schedule ref carries the chainable derivation from amortization.ts", () => {
    const r = resolveSlot("schedule:2:interestExpense", sched);
    expect(r.derivation.inputs.map((i) => i.ref)).toContain("schedule:1:carryingValueAfter");
  });
});

describe("resolveSlot — every arithmetic expr the imported docs use", () => {
  const cases: [string, number][] = [
    ["20000 * 10", 200_000],
    ["20000 * 10 + (param:face - issuePrice)", 200_000 + (500_000 - 461_391)],
    ["480000 - param:face", -20_000],
    ["480000 - schedule:4:carryingValueAfter", 480_000 - cv4],
    ["505000 - param:face", 5_000],
    ["505000 - schedule:4:carryingValueAfter", 505_000 - cv4],
    ["issuePrice - param:face", 461_391 - 500_000],
    ["param:face * param:marketRateAnnual", 50_000], // 500,000 × 0.10
    ["param:face * param:marketRateAnnual / 2", 25_000],
    ["param:face * param:statedRateAnnual * 2 / 12", Math.round(500_000 * 0.08 * 2 / 12)],
    ["param:face * param:statedRateAnnual * 4 / 12", Math.round(500_000 * 0.08 * 4 / 12)],
    ["param:face * param:statedRateAnnual * 6 / 12", 20_000],
    ["param:face * param:statedRateAnnual / 2", 20_000],
    ["param:face + param:face * param:statedRateAnnual * 2 / 12", Math.round(500_000 + 500_000 * 0.08 * 2 / 12)],
    ["param:face - issuePrice", 500_000 - 461_391],
    ["param:face - param:face", 0],
    ["param:face - schedule:4:carryingValueAfter", 500_000 - cv4],
    ["schedule:2:amortization * 3 / 6", Math.round(3_223 * 3 / 6)],
    ["schedule:2:cashPayment * 3 / 6", 10_000],
    ["schedule:2:cashPayment * 3 / 6 + schedule:2:amortization * 3 / 6", Math.round(20_000 * 3 / 6 + 3_223 * 3 / 6)],
    ["schedule:2:cashPayment * 3 / 6 - schedule:2:amortization * 3 / 6", Math.round(20_000 * 3 / 6 - 3_223 * 3 / 6)],
    ["schedule:2:cashPayment + schedule:2:amortization", 20_000 + 3_223],
    ["issuePrice * param:statedRateAnnual / 2", Math.round(461_391 * 0.08 / 2)],
    // Pure-literal arithmetic keeps its decimals (ratio/EPS answers are authored exact);
    // only ref-based exprs round to the schedule's whole-dollar convention.
    ["38803 * 0.08", 3_104.24],
  ];
  for (const [expr, expected] of cases) {
    test(expr, () => expect(val(expr)).toBe(expected));
  }
});

describe("resolveSlot — null schedule (paramless docs: literal arithmetic only)", () => {
  test("bare decimal literal keeps its decimals (ratio answers)", () => {
    expect(resolveSlot("1.5", null).value).toBe(1.5);
    expect(resolveSlot("0.93", null).value).toBe(0.93);
    expect(resolveSlot("2.45", null).value).toBe(2.45);
  });
  test("literal arithmetic evaluates without a schedule", () => {
    expect(resolveSlot("90000 / 60000", null).value).toBe(1.5);
    expect(resolveSlot("120000 / 20", null).value).toBe(6_000);
  });
  test("distinct near-1 ratios stay distinct (no whole-dollar collapse)", () => {
    const vals = ["0.67", "0.93", "1.07"].map((e) => resolveSlot(e, null).value);
    expect(new Set(vals).size).toBe(3);
  });
  test("any ref without a schedule throws (fail-loud → caller skips the question)", () => {
    expect(() => resolveSlot("schedule:1:interestExpense", null)).toThrow();
    expect(() => resolveSlot("param:face * 2", null)).toThrow();
    expect(() => resolveSlot("issuePrice", null)).toThrow();
  });
});

describe("resolveSlot — literals, precedence, parens, unary", () => {
  test("bare integer literal → itself, 'given' derivation", () => {
    const r = resolveSlot("5536", sched);
    expect(r.value).toBe(5_536);
    expect(r.derivation.formulaText).toContain("given");
  });
  test("bare zero", () => expect(val("0")).toBe(0));
  test("multiplication binds tighter than addition", () => {
    expect(val("2 + 3 * 4")).toBe(14);
    expect(val("(2 + 3) * 4")).toBe(20);
  });
  test("left-assoc subtraction/division", () => {
    expect(val("100 - 30 - 20")).toBe(50);
    expect(val("100 / 5 / 2")).toBe(10);
  });
  test("unary minus", () => expect(val("param:face - -100")).toBe(500_100));
  test("division fraction rounds to whole dollars", () => {
    // 3,223 × 3 / 6 = 1,611.5 → 1,612
    expect(val("schedule:2:amortization * 3 / 6")).toBe(1_612);
  });
});

describe("resolveSlot — synthesized derivation shape (click-through inputs)", () => {
  test("substitutes refs with fmtUSD, keeps literals, lists distinct ref inputs", () => {
    const r = resolveSlot("505000 - schedule:4:carryingValueAfter", sched);
    expect(r.derivation.formulaText).toBe(`= 505000 − ${fmt(cv4)}`);
    expect(r.derivation.inputs).toHaveLength(1);
    expect(r.derivation.inputs[0].ref).toBe("schedule:4:carryingValueAfter");
    expect(r.derivation.inputs[0].label).toBe("Period 4 carrying value");
  });
  test("distinct refs only, in first-appearance order", () => {
    const r = resolveSlot("param:face - param:face + issuePrice", sched);
    expect(r.derivation.inputs.map((i) => i.ref)).toEqual(["param:face", "issuePrice"]);
  });
  test("labelForRef", () => {
    expect(labelForRef("issuePrice")).toBe("Issue price");
    expect(labelForRef("param:marketRateAnnual")).toBe("Market annual rate");
    expect(labelForRef("schedule:3:interestExpense")).toBe("Period 3 interest expense");
  });
});

describe("resolveSlot — fail-loud", () => {
  test("unknown ref throws", () => expect(() => resolveSlot("schedule:99:cashPayment", sched)).toThrow());
  test("malformed expr throws", () => {
    expect(() => resolveSlot("param:face +", sched)).toThrow();
    expect(() => resolveSlot("(param:face", sched)).toThrow();
    expect(() => resolveSlot("param:face param:face", sched)).toThrow();
  });
});

// tiny local fmtUSD mirror for the expectation above
function fmt(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return (n < 0 ? "-" : "") + out;
}
