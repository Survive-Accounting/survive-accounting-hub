// bun test — math-core tests. Lives OUTSIDE src/ so `bunx tsc --noEmit` (which has no
// bun:test types) stays green; `bun test` discovers it here.
import { describe, expect, test } from "bun:test";

import {
  addMonthsISO,
  buildAmortSchedule,
  carryingValueAt,
  classifyPricing,
  computeIssuePrice,
  entryAt,
  fmtUSD,
  generateParams,
  monthsBetweenISO,
  type BondParams,
} from "../src/lib/je/amortization";

// THE canonical textbook example: $500,000 face, 8% stated, 10% market, 5 years,
// semiannual → issued at a discount for 461,391.
const CANONICAL: BondParams = {
  face: 500_000,
  statedRateAnnual: 0.08,
  marketRateAnnual: 0.1,
  termYears: 5,
  paymentsPerYear: 2,
  issueDate: "2026-01-01",
};

describe("computeIssuePrice", () => {
  test("canonical discount example prices at 461,391", () => {
    expect(computeIssuePrice(CANONICAL)).toBe(461_391);
  });

  test("at par the issue price is face", () => {
    expect(
      computeIssuePrice({ ...CANONICAL, marketRateAnnual: 0.08 }),
    ).toBe(500_000);
  });

  test("premium prices above face", () => {
    expect(
      computeIssuePrice({ ...CANONICAL, statedRateAnnual: 0.1, marketRateAnnual: 0.08 }),
    ).toBeGreaterThan(500_000);
  });
});

describe("buildAmortSchedule — effective interest (canonical discount)", () => {
  const s = buildAmortSchedule(CANONICAL, "effective");

  test("classified as discount; 10 rows", () => {
    expect(s.pricing).toBe("discount");
    expect(s.rows.length).toBe(10);
    expect(s.totalAmortizable).toBe(38_609);
  });

  test("period 1: cash 20,000, expense 23,070, CV 464,461", () => {
    const r = s.rows[0];
    expect(r.cashPayment).toBe(20_000);
    expect(r.interestExpense).toBe(23_070);
    expect(r.amortization).toBe(3_070);
    expect(r.carryingValueAfter).toBe(464_461);
  });

  test("period 2: expense 23,223, CV 467,684", () => {
    const r = s.rows[1];
    expect(r.interestExpense).toBe(23_223);
    expect(r.carryingValueAfter).toBe(467_684);
  });

  test("final period plugs so CV lands exactly at face", () => {
    const last = s.rows[9];
    expect(last.carryingValueAfter).toBe(500_000);
    // total amortization across the schedule consumes the discount exactly
    const totalAmort = s.rows.reduce((t, r) => t + r.amortization, 0);
    expect(totalAmort).toBe(38_609);
    // and the plug is documented in the derivation
    expect(last.derivations.amortization.formulaText).toContain("plug");
  });

  test("carrying value climbs monotonically toward face", () => {
    let prev = s.issuePrice;
    for (const r of s.rows) {
      expect(r.carryingValueAfter).toBeGreaterThanOrEqual(prev);
      prev = r.carryingValueAfter;
    }
  });

  test("derivations carry the provenance the UI will render", () => {
    const r2 = s.rows[1];
    expect(r2.derivations.interestExpense.formulaText).toBe("= 464,461 × 10% × 6/12");
    const refs = r2.derivations.interestExpense.inputs.map((i) => i.ref);
    expect(refs).toContain("schedule:1:carryingValueAfter");
    expect(refs).toContain("param:marketRateAnnual");
    // period 1's prior-CV ref is the issue price itself
    expect(s.rows[0].derivations.interestExpense.inputs.map((i) => i.ref)).toContain("issuePrice");
  });
});

describe("buildAmortSchedule — straight line (canonical discount)", () => {
  const s = buildAmortSchedule(CANONICAL, "straight");

  test("total discount 38,609 → 3,861/period with a 3,860 final plug", () => {
    expect(s.totalAmortizable).toBe(38_609);
    for (let i = 0; i < 9; i++) expect(s.rows[i].amortization).toBe(3_861);
    expect(s.rows[9].amortization).toBe(3_860);
    expect(s.rows[0].interestExpense).toBe(23_861);
    expect(s.rows[9].carryingValueAfter).toBe(500_000);
  });
});

describe("buildAmortSchedule — at par", () => {
  const s = buildAmortSchedule({ ...CANONICAL, marketRateAnnual: 0.08 }, "effective");

  test("zero amortization; CV stays at face", () => {
    expect(s.pricing).toBe("par");
    expect(s.totalAmortizable).toBe(0);
    for (const r of s.rows) {
      expect(r.amortization).toBe(0);
      expect(r.interestExpense).toBe(20_000);
      expect(r.carryingValueAfter).toBe(500_000);
    }
  });
});

describe("buildAmortSchedule — premium", () => {
  const premium: BondParams = { ...CANONICAL, statedRateAnnual: 0.1, marketRateAnnual: 0.08 };
  const s = buildAmortSchedule(premium, "effective");

  test("CV decreases monotonically toward face and lands exactly there", () => {
    expect(s.pricing).toBe("premium");
    expect(s.issuePrice).toBeGreaterThan(500_000);
    let prev = s.issuePrice;
    for (const r of s.rows) {
      expect(r.carryingValueAfter).toBeLessThanOrEqual(prev);
      prev = r.carryingValueAfter;
    }
    expect(s.rows[s.rows.length - 1].carryingValueAfter).toBe(500_000);
    // premium: cash exceeds expense each period
    expect(s.rows[0].interestExpense).toBeLessThan(s.rows[0].cashPayment);
  });
});

describe("carryingValueAt / entryAt", () => {
  const s = buildAmortSchedule(CANONICAL, "effective");

  test("carryingValueAt: issue price before first payment, row values after", () => {
    expect(carryingValueAt(s, "2026-03-15")).toBe(461_391);
    expect(carryingValueAt(s, "2026-07-01")).toBe(464_461); // on payment 1
    expect(carryingValueAt(s, "2026-10-01")).toBe(464_461); // between 1 and 2
    expect(carryingValueAt(s, "2031-01-01")).toBe(500_000); // at maturity
  });

  test("payment entry (discount): Dr expense, Cr discount, Cr cash — and balances", () => {
    const e = entryAt(s, "2026-07-01", "payment");
    expect(e.lines.map((l) => `${l.side}:${l.account}:${l.amount}`)).toEqual([
      "debit:Interest Expense:23070",
      "credit:Discount on Bonds Payable:3070",
      "credit:Cash:20000",
    ]);
  });

  test("accrual entry at fiscal year-end is the period fraction and balances", () => {
    // FYE 2026-12-31 sits 5 full months into period 2 (2026-07-01 → 2027-01-01)... but our
    // month-aligned helper needs whole months: use 2026-10-01 = 3 of 6 months elapsed.
    const e = entryAt(s, "2026-10-01", "accrual");
    const dr = e.lines.filter((l) => l.side === "debit").reduce((t, l) => t + l.amount, 0);
    const cr = e.lines.filter((l) => l.side === "credit").reduce((t, l) => t + l.amount, 0);
    expect(dr).toBe(cr);
    const payable = e.lines.find((l) => l.account === "Interest Payable")!;
    expect(payable.amount).toBe(10_000); // 20,000 × 3/6
    const disc = e.lines.find((l) => l.account === "Discount on Bonds Payable")!;
    expect(disc.amount).toBe(1_612); // round(3,223 × 3/6)
    expect(e.lines.find((l) => l.account === "Interest Expense")!.amount).toBe(11_612);
    expect(disc.derivation.formulaText).toContain("× 3/6");
  });

  test("premium payment entry debits the premium", () => {
    const sp = buildAmortSchedule({ ...CANONICAL, statedRateAnnual: 0.1, marketRateAnnual: 0.08 }, "effective");
    const e = entryAt(sp, "2026-07-01", "payment");
    const premiumLine = e.lines.find((l) => l.account === "Premium on Bonds Payable")!;
    expect(premiumLine.side).toBe("debit");
    const dr = e.lines.filter((l) => l.side === "debit").reduce((t, l) => t + l.amount, 0);
    const cr = e.lines.filter((l) => l.side === "credit").reduce((t, l) => t + l.amount, 0);
    expect(dr).toBe(cr);
  });
});

describe("generateParams", () => {
  test("deterministic per seed; clean numbers; pricing direction honored", () => {
    const a = generateParams(42, { pricing: "discount" });
    const b = generateParams(42, { pricing: "discount" });
    expect(a).toEqual(b);

    for (const seed of [1, 2, 3, 99, 12345]) {
      for (const pricing of ["par", "premium", "discount"] as const) {
        const p = generateParams(seed, { pricing });
        expect(p.face % 50_000).toBe(0);
        expect(p.face).toBeGreaterThanOrEqual(100_000);
        expect(p.face).toBeLessThanOrEqual(1_000_000);
        expect(Math.round(p.statedRateAnnual * 200)).toBe(p.statedRateAnnual * 200); // half-point
        expect(p.termYears).toBeGreaterThanOrEqual(5);
        expect(p.termYears).toBeLessThanOrEqual(10);
        if (pricing === "par") expect(p.marketRateAnnual).toBe(p.statedRateAnnual);
        if (pricing === "premium") expect(p.statedRateAnnual - p.marketRateAnnual).toBeCloseTo(0.02, 10);
        if (pricing === "discount") expect(p.marketRateAnnual - p.statedRateAnnual).toBeCloseTo(0.02, 10);
        expect(classifyPricing(p)).toBe(pricing);
        // and the schedule built from generated params still lands exactly at face
        const sched = buildAmortSchedule(p, "effective");
        expect(sched.rows[sched.rows.length - 1].carryingValueAfter).toBe(p.face);
      }
    }
  });
});

describe("date utils", () => {
  test("addMonthsISO handles month-end clamping and year roll", () => {
    expect(addMonthsISO("2026-01-01", 6)).toBe("2026-07-01");
    expect(addMonthsISO("2026-07-01", 6)).toBe("2027-01-01");
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
  });
  test("monthsBetweenISO", () => {
    expect(monthsBetweenISO("2026-07-01", "2026-10-01")).toBe(3);
    expect(monthsBetweenISO("2026-01-01", "2027-01-01")).toBe(12);
  });
  test("fmtUSD", () => {
    expect(fmtUSD(461391.4)).toBe("461,391");
    expect(fmtUSD(1_000_000)).toBe("1,000,000");
    expect(fmtUSD(-3070)).toBe("-3,070");
  });
});
