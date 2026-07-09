// GreekIntel signal engine — pure + unit-tested. Computes per-CHAPTER "signal
// chips" from that chapter's itemized 990 filings + physical-plant/founding fields
// + the org's GPA terms. Rendered on each registry row and used to rank the Leads
// tab (org-level = the union of its chapters' signals).

export type SignalKey =
  | "academic_spender"
  | "campaign_likely"
  | "aging_house"
  | "recent_renovation"
  | "fresh_mortgage"
  | "historic_chapter"
  | "hires_fundraisers"
  | "gpa_falling"
  | "big_payroll";

export const SIGNALS: { key: SignalKey; label: string; hint: string }[] = [
  {
    key: "academic_spender",
    label: "Academic spender",
    hint: "Paid grants/scholarships in some year",
  },
  {
    key: "campaign_likely",
    label: "Campaign likely",
    hint: "Contributions jumped >3× a prior year",
  },
  {
    key: "aging_house",
    label: "Aging house",
    hint: "Accumulated depreciation > 60% of building cost",
  },
  {
    key: "recent_renovation",
    label: "Recent renovation",
    hint: "Building cost basis rose >20% YoY in the last 3 filings",
  },
  {
    key: "fresh_mortgage",
    label: "Fresh mortgage",
    hint: "Mortgages payable up >30% year-over-year",
  },
  {
    key: "historic_chapter",
    label: "Historic chapter",
    hint: "Chartered before 1900, or the org's founding chapter",
  },
  { key: "hires_fundraisers", label: "Hires fundraisers", hint: "Named a professional fundraiser" },
  { key: "gpa_falling", label: "GPA falling", hint: "Latest term GPA down ≥0.1 vs prior" },
  { key: "big_payroll", label: "Big payroll", hint: "20+ employees in some year" },
];
export const signalLabel = (k: SignalKey) => SIGNALS.find((s) => s.key === k)?.label ?? k;

export interface SignalFiling {
  tax_year: number | null;
  contributions: number | null;
  grants_paid: number | null;
  accum_depreciation: number | null;
  land_buildings_gross: number | null;
  buildings_gross: number | null;
  mortgages_payable: number | null;
  fundraiser_firm: string | null;
  employees_count: number | null;
}
export interface SignalGpa {
  term: string | null;
  gpa: number | null;
}
/** Chapter-level founding facts (per-campus). */
export interface SignalPhysical {
  chartered_year: number | null;
  is_founding_chapter: boolean;
}

/** Chronological sort key for a term like "fall_2025" / "spring 2025".
 *  Academic order within a year: spring < summer < fall. */
export function termKey(term: string | null): number {
  if (!term) return -1;
  const m = term.match(/(fall|spring|summer)[_\s]*'?(\d{2,4})/i);
  if (!m) return -1;
  const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  const season = m[1].toLowerCase();
  const s = season === "spring" ? 0 : season === "summer" ? 1 : 2;
  return year * 3 + s;
}

/** The building cost basis to use for aging/renovation — Schedule D "buildings"
 *  when entered, else the combined land+buildings line. */
const buildingBasis = (f: SignalFiling): number | null =>
  f.buildings_gross != null && f.buildings_gross > 0
    ? f.buildings_gross
    : f.land_buildings_gross != null && f.land_buildings_gross > 0
      ? f.land_buildings_gross
      : null;

/** Compute the set of signals firing for one CHAPTER. `physical` is optional
 *  (org-level callers that only have filings pass none). */
export function computeChapterSignals(
  filings: SignalFiling[],
  gpa: SignalGpa[],
  physical?: SignalPhysical,
): SignalKey[] {
  const out: SignalKey[] = [];
  const byYear = [...filings]
    .filter((f) => f.tax_year != null)
    .sort((a, b) => (a.tax_year ?? 0) - (b.tax_year ?? 0));

  // academic_spender — grants paid in any year.
  if (filings.some((f) => (f.grants_paid ?? 0) > 0)) out.push("academic_spender");

  // campaign_likely — some year's contributions > 3× the immediately prior year's
  // (prior must be > 0 so a jump from nothing doesn't count).
  for (let i = 1; i < byYear.length; i++) {
    const prev = byYear[i - 1].contributions;
    const cur = byYear[i].contributions;
    if (prev != null && prev > 0 && cur != null && cur > 3 * prev) {
      out.push("campaign_likely");
      break;
    }
  }

  // aging_house — latest filing with a building cost basis: accum dep / basis > 0.6.
  const withHouse = byYear.filter((f) => buildingBasis(f) != null && f.accum_depreciation != null);
  const lastHouse = withHouse[withHouse.length - 1];
  if (lastHouse && lastHouse.accum_depreciation! / buildingBasis(lastHouse)! > 0.6) {
    out.push("aging_house");
  }

  // recent_renovation — building basis rose >20% YoY across the last 3 filings.
  const last3 = byYear.slice(-3);
  for (let i = 1; i < last3.length; i++) {
    const prev = buildingBasis(last3[i - 1]);
    const cur = buildingBasis(last3[i]);
    if (prev != null && prev > 0 && cur != null && cur > prev * 1.2) {
      out.push("recent_renovation");
      break;
    }
  }

  // fresh_mortgage — mortgages payable up >30% in the latest year-over-year pair.
  const withMort = byYear.filter((f) => f.mortgages_payable != null);
  if (withMort.length >= 2) {
    const cur = withMort[withMort.length - 1].mortgages_payable!;
    const prev = withMort[withMort.length - 2].mortgages_payable!;
    if (prev > 0 && cur > prev * 1.3) out.push("fresh_mortgage");
  }

  // historic_chapter — chartered before 1900, or flagged the founding chapter.
  if (
    physical &&
    ((physical.chartered_year != null && physical.chartered_year < 1900) ||
      physical.is_founding_chapter)
  ) {
    out.push("historic_chapter");
  }

  // hires_fundraisers — any filing names a fundraiser firm.
  if (filings.some((f) => (f.fundraiser_firm ?? "").trim() !== "")) out.push("hires_fundraisers");

  // gpa_falling — latest term GPA down ≥0.1 vs the prior term.
  const terms = [...gpa]
    .filter((g) => g.gpa != null && termKey(g.term) >= 0)
    .sort((a, b) => termKey(a.term) - termKey(b.term));
  if (terms.length >= 2) {
    const latest = terms[terms.length - 1].gpa!;
    const prior = terms[terms.length - 2].gpa!;
    if (latest <= prior - 0.1) out.push("gpa_falling");
  }

  // big_payroll — 20+ employees in any year.
  if (filings.some((f) => (f.employees_count ?? 0) >= 20)) out.push("big_payroll");

  // Emit in SIGNALS display order for stable chip layout.
  const order = SIGNALS.map((s) => s.key);
  return [...new Set(out)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
