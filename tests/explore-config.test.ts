import { describe, expect, test } from "bun:test";

import { formatEvent, givenLineText } from "../src/lib/je/explore";
import { DEFAULT_PANELS, resolveVisiblePanels } from "../src/lib/je/panel-settings";
import type { BondParams } from "../src/lib/je/amortization";

const P: BondParams = {
  face: 500_000,
  statedRateAnnual: 0.08,
  marketRateAnnual: 0.1,
  termYears: 5,
  paymentsPerYear: 2,
  issueDate: "2026-01-01",
};

describe("panel visibility", () => {
  test("global defaults: schedule + presentation on; ledger/statements/equation off", () => {
    const v = resolveVisiblePanels(undefined, DEFAULT_PANELS);
    expect(v).toEqual({ schedule: true, presentation: true, ledger: false, statements: false, equation: false });
  });

  test("a doc's ui.panels overrides globals (the list IS the visible set)", () => {
    const v = resolveVisiblePanels(["ledger", "equation"], DEFAULT_PANELS);
    expect(v.ledger).toBe(true);
    expect(v.equation).toBe(true);
    expect(v.schedule).toBe(false);
    expect(v.presentation).toBe(false);
    expect(v.statements).toBe(false);
  });

  test("empty ui.panels hides everything", () => {
    const v = resolveVisiblePanels([], DEFAULT_PANELS);
    expect(Object.values(v).every((x) => x === false)).toBe(true);
  });
});

describe("problem-statement params", () => {
  test("formatEvent resolves {param} placeholders with formatting", () => {
    const e = "Issued {face} bonds, {statedRateAnnual} stated / {marketRateAnnual} market, {termYears} yr, {paymentsPerYear}, on {issueDate}.";
    expect(formatEvent(e, P)).toBe("Issued $500,000 bonds, 8% stated / 10% market, 5 yr, semiannual, on 2026-01-01.");
  });

  test("event without placeholders is unchanged", () => {
    expect(formatEvent("A plain event with no braces.", P)).toBe("A plain event with no braces.");
  });

  test("no params → event returned as-is (even if it had placeholders)", () => {
    expect(formatEvent("Face is {face}.", undefined)).toBe("Face is {face}.");
  });

  test("unknown placeholder left intact", () => {
    expect(formatEvent("Coupon rate {couponRate}.", P)).toBe("Coupon rate {couponRate}.");
  });

  test("givenLineText is the compact summary", () => {
    expect(givenLineText(P)).toBe("$500,000 face · 8% stated · 10% market · 5 yr · semiannual");
  });
});
