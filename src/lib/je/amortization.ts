// Bond issue-price + amortization math — PURE (no React, no fetch, no Supabase).
//
// This is the "math core" under the JE Scenario Engine's Phase-2 numbers work. Every
// computed cell carries a `Derivation` (value + formulaText + labeled inputs with refs)
// so the UI can render click-through provenance: tap a number, see exactly where it
// came from. Ref scheme (shared with ScenarioDoc v2 slot keys / traces):
//   "param:<name>"                       a BondParams field
//   "issuePrice"                         the computed issue price (period-0 carrying value)
//   "schedule:<period>:<field>"          a cell of the amortization schedule (1-based)
//
// ROUNDING CONVENTION (standard textbook): round each period's interest expense (and
// the per-period straight-line amortization) to WHOLE DOLLARS as you go; then the FINAL
// period does not compute — it PLUGS amortization with whatever remains so the carrying
// value lands exactly at face, and interest expense is restated from that plug
// (cash + plug for a discount, cash − plug for a premium). Accumulated rounding drift
// therefore always surfaces in the last row, never mid-schedule.

// ============================================================================
// Types
// ============================================================================

export interface BondParams {
  face: number;
  /** Annual coupon (stated/contract) rate as a decimal, e.g. 0.08 for 8%. */
  statedRateAnnual: number;
  /** Annual market (effective) rate as a decimal, e.g. 0.10 for 10%. */
  marketRateAnnual: number;
  termYears: number;
  /** Coupon payments per year. Default 2 (semiannual). */
  paymentsPerYear?: number;
  /** ISO date "YYYY-MM-DD" the bonds are issued (also the schedule's period-0 date). */
  issueDate: string;
  /** Fiscal year-end as "MM-DD". Default "12-31". Used by accrual entries. */
  fiscalYearEnd?: string;
}

export type AmortMethod = "effective" | "straight";
export type BondPricing = "par" | "premium" | "discount";

export interface DerivationInput {
  label: string;
  value: number;
  /** Where this input lives, in the shared ref scheme (see header). */
  ref?: string;
}

/** Provenance for one computed number — what the UI's click-through tracing renders. */
export interface Derivation {
  value: number;
  /** Human-readable formula with the actual numbers, e.g. "= 464,461 × 10% × 6/12". */
  formulaText: string;
  inputs: DerivationInput[];
}

export interface AmortRow {
  /** 1-based payment period. */
  period: number;
  /** ISO date of this payment. */
  date: string;
  cashPayment: number;
  interestExpense: number;
  /** Positive magnitude of discount/premium amortized this period (0 at par). */
  amortization: number;
  carryingValueAfter: number;
  derivations: {
    cashPayment: Derivation;
    interestExpense: Derivation;
    amortization: Derivation;
    carryingValueAfter: Derivation;
  };
}

export interface AmortSchedule {
  params: Required<BondParams>;
  method: AmortMethod;
  pricing: BondPricing;
  issuePrice: number;
  issuePriceDerivation: Derivation;
  /** |face − issuePrice| — the total discount or premium to amortize (0 at par). */
  totalAmortizable: number;
  rows: AmortRow[];
}

export interface EntryLineAmount {
  account: string;
  side: "debit" | "credit";
  amount: number;
  derivation: Derivation;
}

export interface DerivedEntry {
  date: string;
  kind: "payment" | "accrual";
  lines: EntryLineAmount[];
}

// ============================================================================
// Small pure utilities (deterministic — no locale, no Date-object timezone traps)
// ============================================================================

/** 1234567.8 → "1,234,568" (whole dollars, comma-grouped, deterministic). */
export function fmtUSD(n: number): string {
  const sign = n < 0 ? "-" : "";
  const s = Math.round(Math.abs(n)).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return sign + out;
}

/** 0.085 → "8.5%", 0.1 → "10%". */
export function fmtPct(rate: number): string {
  const pct = rate * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded}%`;
}

function round0(n: number): number {
  return Math.round(n);
}

/** Add whole months to an ISO date, clamping the day to the target month's length. */
export function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  const zero = y * 12 + (m - 1) + months;
  const ny = Math.floor(zero / 12);
  const nm = (zero % 12) + 1;
  const daysInMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); // day 0 of next month
  const nd = Math.min(d, daysInMonth);
  return `${ny.toString().padStart(4, "0")}-${nm.toString().padStart(2, "0")}-${nd
    .toString()
    .padStart(2, "0")}`;
}

/** Whole months from a to b (day-of-month ignored — schedule dates are month-aligned). */
export function monthsBetweenISO(aISO: string, bISO: string): number {
  const [ay, am] = aISO.split("-").map((x) => parseInt(x, 10));
  const [by, bm] = bISO.split("-").map((x) => parseInt(x, 10));
  return by * 12 + bm - (ay * 12 + am);
}

function resolveParams(params: BondParams): Required<BondParams> {
  return {
    ...params,
    paymentsPerYear: params.paymentsPerYear ?? 2,
    fiscalYearEnd: params.fiscalYearEnd ?? "12-31",
  };
}

export function classifyPricing(params: BondParams): BondPricing {
  if (params.statedRateAnnual === params.marketRateAnnual) return "par";
  return params.statedRateAnnual > params.marketRateAnnual ? "premium" : "discount";
}

// ============================================================================
// Issue price — PV of the coupons + PV of the face, at the market periodic rate
// ============================================================================

export function computeIssuePrice(params: BondParams): number {
  return issuePriceWithDerivation(resolveParams(params)).value;
}

function issuePriceWithDerivation(p: Required<BondParams>): Derivation {
  const n = p.termYears * p.paymentsPerYear;
  const i = p.marketRateAnnual / p.paymentsPerYear;
  const coupon = round0((p.face * p.statedRateAnnual) / p.paymentsPerYear);

  let pvCoupons: number;
  let pvFace: number;
  if (i === 0) {
    pvCoupons = coupon * n;
    pvFace = p.face;
  } else {
    const discountFactor = Math.pow(1 + i, -n);
    pvCoupons = coupon * ((1 - discountFactor) / i);
    pvFace = p.face * discountFactor;
  }
  const value = round0(pvCoupons + pvFace);

  return {
    value,
    formulaText: `= PV of coupons (${fmtUSD(coupon)} × ${n} pmts @ ${fmtPct(i)}/period = ${fmtUSD(
      pvCoupons,
    )}) + PV of face (${fmtUSD(p.face)} @ ${fmtPct(i)}/period = ${fmtUSD(pvFace)})`,
    inputs: [
      { label: "Face value", value: p.face, ref: "param:face" },
      { label: "Stated annual rate", value: p.statedRateAnnual, ref: "param:statedRateAnnual" },
      { label: "Market annual rate", value: p.marketRateAnnual, ref: "param:marketRateAnnual" },
      { label: "Periods", value: n },
    ],
  };
}

// ============================================================================
// Amortization schedule
// ============================================================================

export function buildAmortSchedule(params: BondParams, method: AmortMethod): AmortSchedule {
  const p = resolveParams(params);
  const pricing = classifyPricing(p);
  const n = p.termYears * p.paymentsPerYear;
  const monthsPerPeriod = 12 / p.paymentsPerYear;
  const periodicMarket = p.marketRateAnnual / p.paymentsPerYear;
  const issue = issuePriceWithDerivation(p);
  const issuePrice = issue.value;
  const totalAmortizable = Math.abs(p.face - issuePrice);
  const cash = round0((p.face * p.statedRateAnnual) / p.paymentsPerYear);
  // Toward face: +1 when CV climbs (discount), −1 when it falls (premium), 0 at par.
  const dir = pricing === "discount" ? 1 : pricing === "premium" ? -1 : 0;

  // Straight-line: same rounded slice each period, remainder plugged in the last one.
  const slPerPeriod = n > 0 ? round0(totalAmortizable / n) : 0;

  const cashFormula = `= ${fmtUSD(p.face)} × ${fmtPct(p.statedRateAnnual)} × ${monthsPerPeriod}/12`;
  const cashInputs: DerivationInput[] = [
    { label: "Face value", value: p.face, ref: "param:face" },
    { label: "Stated annual rate", value: p.statedRateAnnual, ref: "param:statedRateAnnual" },
  ];

  const rows: AmortRow[] = [];
  let cv = issuePrice;

  for (let period = 1; period <= n; period++) {
    const date = addMonthsISO(p.issueDate, period * monthsPerPeriod);
    const prevCv = cv;
    const prevCvRef = period === 1 ? "issuePrice" : `schedule:${period - 1}:carryingValueAfter`;
    const prevCvLabel = period === 1 ? "Issue price (carrying value at issue)" : `Carrying value after period ${period - 1}`;
    const isFinal = period === n;

    let interest: number;
    let amort: number;
    let interestD: Derivation;
    let amortD: Derivation;

    if (isFinal && dir !== 0) {
      // FINAL-PERIOD PLUG (see header): amortization = whatever remains to reach face;
      // interest expense is restated from the plug so the row stays internally consistent.
      amort = Math.abs(p.face - prevCv);
      interest = cash + dir * amort;
      amortD = {
        value: amort,
        formulaText: `= ${fmtUSD(p.face)} − ${fmtUSD(prevCv)} (final-period plug to land exactly at face)`,
        inputs: [
          { label: "Face value", value: p.face, ref: "param:face" },
          { label: prevCvLabel, value: prevCv, ref: prevCvRef },
        ],
      };
      interestD = {
        value: interest,
        formulaText: `= ${fmtUSD(cash)} ${dir > 0 ? "+" : "−"} ${fmtUSD(amort)} (cash ${
          dir > 0 ? "plus" : "minus"
        } the plugged amortization)`,
        inputs: [
          { label: "Cash payment", value: cash, ref: `schedule:${period}:cashPayment` },
          { label: "Amortization (plug)", value: amort, ref: `schedule:${period}:amortization` },
        ],
      };
    } else if (method === "effective") {
      interest = round0(prevCv * periodicMarket);
      amort = dir === 0 ? 0 : Math.abs(interest - cash);
      interestD = {
        value: interest,
        formulaText: `= ${fmtUSD(prevCv)} × ${fmtPct(p.marketRateAnnual)} × ${monthsPerPeriod}/12`,
        inputs: [
          { label: prevCvLabel, value: prevCv, ref: prevCvRef },
          { label: "Market annual rate", value: p.marketRateAnnual, ref: "param:marketRateAnnual" },
        ],
      };
      amortD = {
        value: amort,
        formulaText:
          dir === 0
            ? `= ${fmtUSD(interest)} − ${fmtUSD(cash)} (at par: nothing to amortize)`
            : `= ${dir > 0 ? `${fmtUSD(interest)} − ${fmtUSD(cash)}` : `${fmtUSD(cash)} − ${fmtUSD(interest)}`}`,
        inputs: [
          { label: "Interest expense", value: interest, ref: `schedule:${period}:interestExpense` },
          { label: "Cash payment", value: cash, ref: `schedule:${period}:cashPayment` },
        ],
      };
    } else {
      // straight-line
      amort = dir === 0 ? 0 : slPerPeriod;
      interest = cash + dir * amort;
      amortD = {
        value: amort,
        formulaText:
          dir === 0
            ? `= 0 (at par: nothing to amortize)`
            : `= ${fmtUSD(totalAmortizable)} ÷ ${n} periods`,
        inputs: [
          { label: `Total ${pricing}`, value: totalAmortizable, ref: "issuePrice" },
          { label: "Periods", value: n },
        ],
      };
      interestD = {
        value: interest,
        formulaText:
          dir === 0
            ? `= ${fmtUSD(cash)} (cash payment; at par)`
            : `= ${fmtUSD(cash)} ${dir > 0 ? "+" : "−"} ${fmtUSD(amort)}`,
        inputs: [
          { label: "Cash payment", value: cash, ref: `schedule:${period}:cashPayment` },
          { label: "Amortization", value: amort, ref: `schedule:${period}:amortization` },
        ],
      };
    }

    cv = dir === 0 ? prevCv : isFinal ? p.face : prevCv + dir * amort;
    const cvD: Derivation = {
      value: cv,
      formulaText:
        dir === 0
          ? `= ${fmtUSD(prevCv)} (unchanged at par)`
          : `= ${fmtUSD(prevCv)} ${dir > 0 ? "+" : "−"} ${fmtUSD(amort)}`,
      inputs: [
        { label: prevCvLabel, value: prevCv, ref: prevCvRef },
        { label: "Amortization", value: amort, ref: `schedule:${period}:amortization` },
      ],
    };

    rows.push({
      period,
      date,
      cashPayment: cash,
      interestExpense: interest,
      amortization: amort,
      carryingValueAfter: cv,
      derivations: {
        cashPayment: { value: cash, formulaText: cashFormula, inputs: cashInputs },
        interestExpense: interestD,
        amortization: amortD,
        carryingValueAfter: cvD,
      },
    });
  }

  return {
    params: p,
    method,
    pricing,
    issuePrice,
    issuePriceDerivation: issue,
    totalAmortizable,
    rows,
  };
}

// ============================================================================
// Point-in-time helpers
// ============================================================================

/** Carrying value as of a date: issue price until the first payment, then the last row ≤ date. */
export function carryingValueAt(schedule: AmortSchedule, dateISO: string): number {
  let cv = schedule.issuePrice;
  for (const row of schedule.rows) {
    if (row.date <= dateISO) cv = row.carryingValueAfter;
    else break;
  }
  return cv;
}

const ACCOUNTS = {
  interestExpense: "Interest Expense",
  cash: "Cash",
  discount: "Discount on Bonds Payable",
  premium: "Premium on Bonds Payable",
  interestPayable: "Interest Payable",
} as const;

/**
 * The journal entry at a date.
 * - kind "payment": the coupon-date entry (date must equal a schedule row's date).
 * - kind "accrual": a fiscal-year-end style accrual PART-WAY through the next period —
 *   each amount is the fraction (elapsed months / period months) of that period's figure.
 *   The entry stays balanced by construction: interest expense = payable + amortization part.
 */
export function entryAt(
  schedule: AmortSchedule,
  dateISO: string,
  kind: "payment" | "accrual",
): DerivedEntry {
  const { pricing } = schedule;

  if (kind === "payment") {
    const row = schedule.rows.find((r) => r.date === dateISO);
    if (!row) {
      throw new Error(
        `No payment falls on ${dateISO}; payment dates: ${schedule.rows.map((r) => r.date).join(", ")}`,
      );
    }
    const lines: EntryLineAmount[] = [
      {
        account: ACCOUNTS.interestExpense,
        side: "debit",
        amount: row.interestExpense,
        derivation: row.derivations.interestExpense,
      },
    ];
    if (pricing === "premium") {
      lines.push({
        account: ACCOUNTS.premium,
        side: "debit",
        amount: row.amortization,
        derivation: row.derivations.amortization,
      });
    }
    if (pricing === "discount") {
      lines.push({
        account: ACCOUNTS.discount,
        side: "credit",
        amount: row.amortization,
        derivation: row.derivations.amortization,
      });
    }
    lines.push({
      account: ACCOUNTS.cash,
      side: "credit",
      amount: row.cashPayment,
      derivation: row.derivations.cashPayment,
    });
    return { date: dateISO, kind, lines };
  }

  // ---- accrual: fraction of the NEXT period ----
  const next = schedule.rows.find((r) => r.date > dateISO);
  if (!next) throw new Error(`${dateISO} is after the final payment (${schedule.rows[schedule.rows.length - 1]?.date}).`);
  const prevDate = next.period === 1 ? schedule.params.issueDate : schedule.rows[next.period - 2].date;
  const periodMonths = 12 / schedule.params.paymentsPerYear;
  const elapsed = monthsBetweenISO(prevDate, dateISO);
  if (elapsed <= 0 || elapsed >= periodMonths) {
    throw new Error(
      `Accrual date ${dateISO} is not strictly inside the period ${prevDate} → ${next.date}.`,
    );
  }
  const frac = `${elapsed}/${periodMonths}`;

  const payable = round0(next.cashPayment * (elapsed / periodMonths));
  const amortPart = round0(next.amortization * (elapsed / periodMonths));
  // Expense derived as the SUM so the accrual entry always balances despite rounding.
  const dir = pricing === "discount" ? 1 : pricing === "premium" ? -1 : 0;
  const expense = payable + dir * amortPart;

  const payableD: Derivation = {
    value: payable,
    formulaText: `= ${fmtUSD(next.cashPayment)} × ${frac}`,
    inputs: [
      { label: `Period ${next.period} cash payment`, value: next.cashPayment, ref: `schedule:${next.period}:cashPayment` },
      { label: "Months accrued / period months", value: elapsed / periodMonths },
    ],
  };
  const amortD: Derivation = {
    value: amortPart,
    formulaText: `= ${fmtUSD(next.amortization)} × ${frac}`,
    inputs: [
      { label: `Period ${next.period} amortization`, value: next.amortization, ref: `schedule:${next.period}:amortization` },
      { label: "Months accrued / period months", value: elapsed / periodMonths },
    ],
  };
  const expenseD: Derivation = {
    value: expense,
    formulaText:
      dir === 0
        ? `= ${fmtUSD(payable)} (interest payable; at par)`
        : `= ${fmtUSD(payable)} ${dir > 0 ? "+" : "−"} ${fmtUSD(amortPart)}`,
    inputs: [
      { label: "Interest payable accrued", value: payable },
      { label: "Amortization accrued", value: amortPart },
    ],
  };

  const lines: EntryLineAmount[] = [
    { account: ACCOUNTS.interestExpense, side: "debit", amount: expense, derivation: expenseD },
  ];
  if (pricing === "premium") {
    lines.push({ account: ACCOUNTS.premium, side: "debit", amount: amortPart, derivation: amortD });
  }
  if (pricing === "discount") {
    lines.push({ account: ACCOUNTS.discount, side: "credit", amount: amortPart, derivation: amortD });
  }
  lines.push({ account: ACCOUNTS.interestPayable, side: "credit", amount: payable, derivation: payableD });
  return { date: dateISO, kind, lines };
}

// ============================================================================
// Seeded parameter generation — clean textbook numbers, reproducible per seed
// ============================================================================

export interface GenerateConstraints {
  pricing: BondPricing;
  termYears?: number;
  paymentsPerYear?: number;
  issueDate?: string;
  fiscalYearEnd?: string;
}

/** mulberry32 — tiny deterministic PRNG; same seed → same params. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Clean numbers by construction: face in $50k steps ($100k–$1M); stated rate a whole or
 * half point; market rate exactly 2 points from stated in the direction the pricing axis
 * demands (par: equal, premium: stated > market, discount: stated < market); 5–10 year
 * terms; semiannual unless overridden.
 */
export function generateParams(seed: number, constraints: GenerateConstraints): BondParams {
  const rnd = mulberry32(seed);
  const randInt = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  const face = 50_000 * randInt(2, 20); // 100,000 .. 1,000,000
  // stated: 5.0%–10.0% in half-point steps → market = stated ± 2pts stays in 3%–12%
  const statedRateAnnual = randInt(10, 20) / 200; // 0.05 .. 0.10 step 0.005
  const marketRateAnnual =
    constraints.pricing === "par"
      ? statedRateAnnual
      : constraints.pricing === "premium"
        ? statedRateAnnual - 0.02
        : statedRateAnnual + 0.02;

  return {
    face,
    statedRateAnnual,
    marketRateAnnual: Math.round(marketRateAnnual * 1000) / 1000,
    termYears: constraints.termYears ?? randInt(5, 10),
    paymentsPerYear: constraints.paymentsPerYear ?? 2,
    issueDate: constraints.issueDate ?? "2026-01-01",
    fiscalYearEnd: constraints.fiscalYearEnd ?? "12-31",
  };
}
