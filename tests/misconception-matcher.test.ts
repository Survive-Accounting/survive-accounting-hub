import { describe, expect, test } from "bun:test";

import { buildAmortSchedule, type BondParams } from "../src/lib/je/amortization";
import { matchMisconception, resolveMisconceptionCandidates } from "../src/lib/je/misconception-matcher";

// Canonical discount schedule: p1 cash 20,000 / expense 23,070 / CV 464,461;
// p2 expense 23,223. Face 500,000, stated 8%, market 10%, semiannual.
const P: BondParams = {
  face: 500_000,
  statedRateAnnual: 0.08,
  marketRateAnnual: 0.1,
  termYears: 5,
  paymentsPerYear: 2,
  issueDate: "2026-01-01",
};
const sched = buildAmortSchedule(P, "effective");

describe("resolveMisconceptionCandidates — period-2 interest expense", () => {
  const cands = resolveMisconceptionCandidates(sched, "schedule:2:interestExpense");
  const byId = Object.fromEntries(cands.map((c) => [c.id, c.value]));

  test("cash_vs_expense = the cash coupon (20,000)", () => {
    expect(byId.cash_vs_expense).toBe(20_000);
  });
  test("market_rate_on_face = face × market × 6/12 (25,000)", () => {
    expect(byId.market_rate_on_face).toBe(25_000);
  });
  test("stated_rate_on_cv = prior CV × stated × 6/12 (~18,578)", () => {
    expect(byId.stated_rate_on_cv).toBe(Math.round(464_461 * 0.08 / 2));
  });
  test("prior_period_expense = period-1 expense (23,070)", () => {
    expect(byId.prior_period_expense).toBe(23_070);
  });
});

describe("matchMisconception — the required mappings for period-2 expense", () => {
  const match = (amt: number) => matchMisconception(sched, "schedule:2:interestExpense", amt);
  test("23,070 → prior_period_expense", () => expect(match(23_070)).toBe("prior_period_expense"));
  test("20,000 → cash_vs_expense", () => expect(match(20_000)).toBe("cash_vs_expense"));
  test("25,000 → market_rate_on_face", () => expect(match(25_000)).toBe("market_rate_on_face"));

  test("±1 tolerance holds", () => {
    expect(match(20_001)).toBe("cash_vs_expense");
    expect(match(24_999)).toBe("market_rate_on_face");
  });
  test("the correct answer (23,223) matches no misconception", () => {
    expect(match(23_223)).toBeNull();
  });
  test("an unrelated wrong number matches nothing", () => {
    expect(match(12_345)).toBeNull();
  });
});

describe("period 1 has no prior-period candidate", () => {
  test("prior_period_expense absent for period 1", () => {
    const ids = resolveMisconceptionCandidates(sched, "schedule:1:interestExpense").map((c) => c.id);
    expect(ids).not.toContain("prior_period_expense");
    expect(ids).toContain("cash_vs_expense");
  });
});

describe("non-schedule-cell / non-expense targets return no candidates", () => {
  test("arithmetic expr target → []", () => {
    expect(resolveMisconceptionCandidates(sched, "schedule:2:cashPayment * 3 / 6")).toEqual([]);
  });
  test("undefined target → []", () => {
    expect(resolveMisconceptionCandidates(sched, undefined)).toEqual([]);
  });
  test("a cashPayment target has no expense-confusion candidates", () => {
    expect(resolveMisconceptionCandidates(sched, "schedule:2:cashPayment")).toEqual([]);
  });
});
