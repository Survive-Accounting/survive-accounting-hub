// Unit tests for the GreekIntel signal engine. Run with `bun test`.
import { test, expect } from "bun:test";
import { computeChapterSignals, termKey, type SignalFiling } from "./greek-signals";

const F = (o: Partial<SignalFiling> & { tax_year: number }): SignalFiling => ({
  contributions: null,
  grants_paid: null,
  accum_depreciation: null,
  land_buildings_gross: null,
  buildings_gross: null,
  mortgages_payable: null,
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
  expect(computeChapterSignals([F({ tax_year: 2022, grants_paid: 500 })], [])).toContain(
    "academic_spender",
  );
  expect(computeChapterSignals([F({ tax_year: 2022, grants_paid: 0 })], [])).not.toContain(
    "academic_spender",
  );
});

test("campaign_likely needs >3× a positive prior year", () => {
  const jump = [
    F({ tax_year: 2021, contributions: 100 }),
    F({ tax_year: 2022, contributions: 400 }),
  ];
  expect(computeChapterSignals(jump, [])).toContain("campaign_likely");
  const small = [
    F({ tax_year: 2021, contributions: 100 }),
    F({ tax_year: 2022, contributions: 200 }),
  ];
  expect(computeChapterSignals(small, [])).not.toContain("campaign_likely");
  const fromZero = [
    F({ tax_year: 2021, contributions: 0 }),
    F({ tax_year: 2022, contributions: 999 }),
  ];
  expect(computeChapterSignals(fromZero, [])).not.toContain("campaign_likely");
});

test("aging_house on latest house filing ratio > 0.6 (buildings_gross preferred)", () => {
  const aging = [F({ tax_year: 2022, land_buildings_gross: 1000, accum_depreciation: 700 })];
  expect(computeChapterSignals(aging, [])).toContain("aging_house");
  const fresh = [F({ tax_year: 2022, land_buildings_gross: 1000, accum_depreciation: 500 })];
  expect(computeChapterSignals(fresh, [])).not.toContain("aging_house");
  // buildings_gross wins over land_buildings_gross when both present.
  const bg = [
    F({
      tax_year: 2022,
      buildings_gross: 1000,
      land_buildings_gross: 5000,
      accum_depreciation: 700,
    }),
  ];
  expect(computeChapterSignals(bg, [])).toContain("aging_house");
});

test("recent_renovation on >20% building-basis jump within last 3 filings", () => {
  const reno = [
    F({ tax_year: 2021, buildings_gross: 1000 }),
    F({ tax_year: 2022, buildings_gross: 1000 }),
    F({ tax_year: 2023, buildings_gross: 1300 }),
  ];
  expect(computeChapterSignals(reno, [])).toContain("recent_renovation");
  const flat = [
    F({ tax_year: 2022, buildings_gross: 1000 }),
    F({ tax_year: 2023, buildings_gross: 1100 }),
  ];
  expect(computeChapterSignals(flat, [])).not.toContain("recent_renovation");
  // A jump older than the last 3 filings should NOT fire.
  const old = [
    F({ tax_year: 2019, buildings_gross: 1000 }),
    F({ tax_year: 2020, buildings_gross: 2000 }),
    F({ tax_year: 2021, buildings_gross: 2000 }),
    F({ tax_year: 2022, buildings_gross: 2000 }),
    F({ tax_year: 2023, buildings_gross: 2000 }),
  ];
  expect(computeChapterSignals(old, [])).not.toContain("recent_renovation");
});

test("fresh_mortgage on >30% YoY mortgage growth", () => {
  const fresh = [
    F({ tax_year: 2022, mortgages_payable: 100000 }),
    F({ tax_year: 2023, mortgages_payable: 140000 }),
  ];
  expect(computeChapterSignals(fresh, [])).toContain("fresh_mortgage");
  const paying = [
    F({ tax_year: 2022, mortgages_payable: 100000 }),
    F({ tax_year: 2023, mortgages_payable: 95000 }),
  ];
  expect(computeChapterSignals(paying, [])).not.toContain("fresh_mortgage");
});

test("historic_chapter on charter <1900 or founding flag", () => {
  expect(
    computeChapterSignals([], [], { chartered_year: 1874, is_founding_chapter: false }),
  ).toContain("historic_chapter");
  expect(
    computeChapterSignals([], [], { chartered_year: 1980, is_founding_chapter: true }),
  ).toContain("historic_chapter");
  expect(
    computeChapterSignals([], [], { chartered_year: 1980, is_founding_chapter: false }),
  ).not.toContain("historic_chapter");
  // No physical info → never fires.
  expect(computeChapterSignals([], [])).not.toContain("historic_chapter");
});

test("hires_fundraisers + big_payroll", () => {
  expect(
    computeChapterSignals([F({ tax_year: 2022, fundraiser_firm: "ABC Fundraising" })], []),
  ).toContain("hires_fundraisers");
  expect(computeChapterSignals([F({ tax_year: 2022, employees_count: 25 })], [])).toContain(
    "big_payroll",
  );
  expect(computeChapterSignals([F({ tax_year: 2022, employees_count: 5 })], [])).not.toContain(
    "big_payroll",
  );
});

test("gpa_falling needs ≥0.1 drop latest vs prior", () => {
  const falling = [
    { term: "fall_2024", gpa: 3.2 },
    { term: "spring_2025", gpa: 3.05 },
  ];
  expect(computeChapterSignals([], falling)).toContain("gpa_falling");
  const flat = [
    { term: "fall_2024", gpa: 3.2 },
    { term: "spring_2025", gpa: 3.15 },
  ];
  expect(computeChapterSignals([], flat)).not.toContain("gpa_falling");
});

test("empty inputs → no signals", () => {
  expect(computeChapterSignals([], [])).toEqual([]);
});
