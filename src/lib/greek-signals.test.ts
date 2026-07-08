// Unit tests for the GreekIntel signal engine. Run with `bun test`.
import { test, expect } from "bun:test";
import { computeOrgSignals, termKey, type SignalFiling } from "./greek-signals";

const F = (o: Partial<SignalFiling> & { tax_year: number }): SignalFiling => ({
  contributions: null,
  grants_paid: null,
  accum_depreciation: null,
  land_buildings_gross: null,
  fundraiser_firm: null,
  employees_count: null,
  ...o,
});

test("termKey orders spring < summer < fall and across years", () => {
  expect(termKey("spring_2025")).toBeLessThan(termKey("fall_2025"));
  expect(termKey("fall_2024")).toBeLessThan(termKey("spring_2025"));
  expect(termKey("bogus")).toBe(-1);
});

test("academic_spender fires on any grants_paid", () => {
  expect(computeOrgSignals([F({ tax_year: 2022, grants_paid: 500 })], [])).toContain(
    "academic_spender",
  );
  expect(computeOrgSignals([F({ tax_year: 2022, grants_paid: 0 })], [])).not.toContain(
    "academic_spender",
  );
});

test("campaign_likely needs >3× a positive prior year", () => {
  const jump = [F({ tax_year: 2021, contributions: 100 }), F({ tax_year: 2022, contributions: 400 })];
  expect(computeOrgSignals(jump, [])).toContain("campaign_likely");
  const small = [F({ tax_year: 2021, contributions: 100 }), F({ tax_year: 2022, contributions: 200 })];
  expect(computeOrgSignals(small, [])).not.toContain("campaign_likely");
  const fromZero = [F({ tax_year: 2021, contributions: 0 }), F({ tax_year: 2022, contributions: 999 })];
  expect(computeOrgSignals(fromZero, [])).not.toContain("campaign_likely");
});

test("aging_house on latest house filing ratio > 0.6", () => {
  const aging = [F({ tax_year: 2022, land_buildings_gross: 1000, accum_depreciation: 700 })];
  expect(computeOrgSignals(aging, [])).toContain("aging_house");
  const fresh = [F({ tax_year: 2022, land_buildings_gross: 1000, accum_depreciation: 500 })];
  expect(computeOrgSignals(fresh, [])).not.toContain("aging_house");
});

test("hires_fundraisers + big_payroll", () => {
  expect(computeOrgSignals([F({ tax_year: 2022, fundraiser_firm: "ABC Fundraising" })], [])).toContain(
    "hires_fundraisers",
  );
  expect(computeOrgSignals([F({ tax_year: 2022, employees_count: 25 })], [])).toContain("big_payroll");
  expect(computeOrgSignals([F({ tax_year: 2022, employees_count: 5 })], [])).not.toContain(
    "big_payroll",
  );
});

test("gpa_falling needs ≥0.1 drop latest vs prior", () => {
  const falling = [
    { term: "fall_2024", gpa: 3.2 },
    { term: "spring_2025", gpa: 3.05 },
  ];
  expect(computeOrgSignals([], falling)).toContain("gpa_falling");
  const flat = [
    { term: "fall_2024", gpa: 3.2 },
    { term: "spring_2025", gpa: 3.15 },
  ];
  expect(computeOrgSignals([], flat)).not.toContain("gpa_falling");
});

test("empty inputs → no signals", () => {
  expect(computeOrgSignals([], [])).toEqual([]);
});
