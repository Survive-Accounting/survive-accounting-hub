// bun test — referral commission math. Pure helpers only (no server/db), so `bunx tsc --noEmit`
// stays green and `bun test` runs it here.
import { describe, expect, test } from "bun:test";

import {
  commissionCents,
  effectiveRule,
  ruleLabel,
  type CommissionRule,
} from "../src/lib/referral-shared";

describe("commissionCents", () => {
  test("percent: 10% of $50.00 = $5.00", () => {
    expect(commissionCents(5000, { type: "percent", rate: 10 })).toBe(500);
  });
  test("percent: rounds to nearest cent", () => {
    // 12.5% of $9.99 = 124.875¢ → 125¢
    expect(commissionCents(999, { type: "percent", rate: 12.5 })).toBe(125);
  });
  test("flat: rate is a flat cent amount, independent of basis", () => {
    expect(commissionCents(9999, { type: "flat", rate: 500 })).toBe(500);
    expect(commissionCents(0, { type: "flat", rate: 500 })).toBe(500);
  });
  test("none: always zero", () => {
    expect(commissionCents(100000, { type: "none", rate: 99 })).toBe(0);
  });
  test("never negative", () => {
    expect(commissionCents(-100, { type: "percent", rate: 10 })).toBeGreaterThanOrEqual(0);
  });
});

describe("effectiveRule — link override wins, else partner default", () => {
  const partner = { default_commission_type: "percent" as const, default_commission_rate: 10 };
  test("inherits partner default when link override is null", () => {
    const r = effectiveRule({ commission_type: null, commission_rate: null }, partner);
    expect(r).toEqual({ type: "percent", rate: 10 });
  });
  test("uses link override when present", () => {
    const r = effectiveRule({ commission_type: "flat", commission_rate: 750 }, partner);
    expect(r).toEqual({ type: "flat", rate: 750 });
  });
  test("link 'none' override suppresses commission", () => {
    const r = effectiveRule({ commission_type: "none", commission_rate: 0 }, partner);
    expect(r.type).toBe("none");
    expect(commissionCents(10000, r)).toBe(0);
  });
});

describe("ruleLabel", () => {
  test("formats each rule kind", () => {
    expect(ruleLabel({ type: "percent", rate: 10 } as CommissionRule)).toBe("10%");
    expect(ruleLabel({ type: "flat", rate: 500 } as CommissionRule)).toBe("$5.00 flat");
    expect(ruleLabel({ type: "none", rate: 0 } as CommissionRule)).toBe("No commission");
  });
});
