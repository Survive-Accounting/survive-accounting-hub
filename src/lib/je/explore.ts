// Explore-mode glue — PURE. Turns a ScenarioDoc's params spec + the selected conditions
// (+ a session seed) into the concrete AmortSchedule and a slot resolver bound to it. The
// /je route consumes this; keeping it here keeps the route free of math.
import {
  buildAmortSchedule,
  classifyPricing,
  fmtPct,
  fmtUSD,
  generateParams,
  type AmortMethod,
  type AmortSchedule,
  type BondParams,
  type BondPricing,
} from "@/lib/je/amortization";
import { resolveSlot, type SlotResolution } from "@/lib/je/slot-resolver";
import type { EngineLine, ScenarioDoc } from "@/lib/je-engine";

const PRICING_VALUES: Record<string, BondPricing> = {
  at_par: "par",
  premium: "premium",
  discount: "discount",
};
const METHOD_VALUES: Record<string, AmortMethod> = {
  straight_line: "straight",
  effective_interest: "effective",
};

export interface ExploreCtx {
  schedule: AmortSchedule;
  effectiveParams: BondParams;
  pricing: BondPricing;
  method: AmortMethod;
  /** Resolve any slot expression against this schedule (fail-loud → caller catches). */
  resolve(expr: string): SlotResolution;
  /** A line's concrete amount from its amountSlotKey / literal amount, or null (→ ???). */
  resolveLine(line: EngineLine): (SlotResolution & { slotRef?: string }) | null;
}

function pricingFromConditions(conditions: Record<string, string>): BondPricing | null {
  for (const v of Object.values(conditions)) if (PRICING_VALUES[v]) return PRICING_VALUES[v];
  return null;
}
function methodFromConditions(conditions: Record<string, string>): AmortMethod {
  for (const v of Object.values(conditions)) if (METHOD_VALUES[v]) return METHOD_VALUES[v];
  return "effective";
}
function hasPricingAxis(doc: ScenarioDoc): boolean {
  return doc.axes.some((a) => a.options.some((o) => PRICING_VALUES[o.value]));
}

/**
 * Effective params per STEP 1: use params.defaults, EXCEPT regenerate via
 * generateParams(seed,{pricing}) when the doc has a pricing axis and the selected pricing
 * differs from what the defaults produce — OR when the user has pressed "New numbers"
 * (regenerated=true), which shuffles numbers for whatever pricing is current.
 */
export function buildExplore(
  doc: ScenarioDoc,
  conditions: Record<string, string>,
  seed: number,
  regenerated: boolean,
): ExploreCtx | null {
  const spec = doc.params;
  if (!spec || spec.kind !== "bond") return null;

  const defaults = spec.defaults;
  const defaultsPricing = classifyPricing(defaults);
  const pricing = pricingFromConditions(conditions) ?? defaultsPricing;
  const method = methodFromConditions(conditions);

  const shouldRegen = regenerated || (hasPricingAxis(doc) && pricing !== defaultsPricing);
  const effectiveParams: BondParams = shouldRegen
    ? generateParams(seed, {
        pricing,
        paymentsPerYear: defaults.paymentsPerYear,
        issueDate: defaults.issueDate,
        fiscalYearEnd: defaults.fiscalYearEnd,
      })
    : defaults;

  const schedule = buildAmortSchedule(effectiveParams, method);
  const resolve = (expr: string) => resolveSlot(expr, schedule);
  const resolveLine = (line: EngineLine) => {
    if (line.amountSlotKey) {
      try {
        return { ...resolveSlot(line.amountSlotKey, schedule), slotRef: line.amountSlotKey };
      } catch {
        /* an expr the schedule can't satisfy → fall through to a literal amount if any */
      }
    }
    return resolveLiteralAmount(line);
  };

  return { schedule, effectiveParams, pricing, method, resolve, resolveLine };
}

function freqWord(n: number): string {
  return n === 2 ? "semiannual" : n === 4 ? "quarterly" : n === 1 ? "annual" : `${n}×/yr`;
}

/**
 * Resolve {param} placeholders in a doc's `event` prose against the effective params —
 * {face} → "$500,000", {statedRateAnnual}/{marketRateAnnual} → "8%"/"10%", {termYears} →
 * "5", {paymentsPerYear} → "semiannual", {issueDate} → the date. Docs with no placeholders
 * (all current docs) and paramless docs render their event text unchanged.
 */
export function formatEvent(event: string, params?: BondParams): string {
  if (!params) return event;
  const map: Record<string, string> = {
    face: `$${fmtUSD(params.face)}`,
    statedRateAnnual: fmtPct(params.statedRateAnnual),
    marketRateAnnual: fmtPct(params.marketRateAnnual),
    termYears: `${params.termYears}`,
    paymentsPerYear: freqWord(params.paymentsPerYear ?? 2),
    issueDate: params.issueDate,
  };
  return event.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

/** The compact "Given:" summary of the effective params (no pills). */
export function givenLineText(params: BondParams): string {
  return `$${fmtUSD(params.face)} face · ${fmtPct(params.statedRateAnnual)} stated · ${fmtPct(
    params.marketRateAnnual,
  )} market · ${params.termYears} yr · ${freqWord(params.paymentsPerYear ?? 2)}`;
}

/**
 * A line's literal `amount` as a resolved value + minimal "given in the scenario" derivation.
 * Works with NO params block, so literal-only docs (e.g. Ch. 14 equity) render full dollars.
 * Returns null when the line has no numeric amount (→ the line stays "???", true v1 behavior).
 */
export function resolveLiteralAmount(line: EngineLine): (SlotResolution & { slotRef?: string }) | null {
  if (typeof line.amount === "number" && !Number.isNaN(line.amount)) {
    return {
      value: line.amount,
      derivation: {
        value: line.amount,
        formulaText: `${fmtUSD(line.amount)} (given in the scenario)`,
        inputs: [],
      },
    };
  }
  return null;
}
