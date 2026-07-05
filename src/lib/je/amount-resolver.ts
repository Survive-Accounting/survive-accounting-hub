// Amount resolver — PURE. Wires the ScenarioDoc v2 `params` spec + the amountSlotKey
// seam to the math core: given a doc and the student's selected conditions, build the
// amortization schedule and resolve every slot ref to a concrete number (with its
// Derivation, so the UI can render click-through provenance).
//
// Convention: the PRICING and METHOD condition axes steer the math —
//   pricing axis values:  "at_par" | "premium" | "discount"
//   method axis values:   "straight_line" | "effective_interest"
// The pricing axis ADJUSTS the doc's default rates (par: market = stated; premium:
// market = stated − 2pts; discount: market = stated + 2pts) so one params block serves
// all variants; a seed (defaultSeed or an override) instead generates fresh clean
// numbers with the same pricing constraint.

import {
  buildAmortSchedule,
  computeIssuePrice,
  generateParams,
  type AmortMethod,
  type AmortSchedule,
  type BondParams,
  type BondPricing,
  type Derivation,
} from "@/lib/je/amortization";
import type { EntryTemplate, ScenarioDoc, Variant } from "@/lib/je-engine";

export interface ResolvedAmounts {
  schedule: AmortSchedule;
  /** Every slot ref that appears in the variant/doc, resolved to its number. */
  bindings: Record<string, number>;
  /** Provenance per slot ref, when the ref maps to a computed cell. */
  derivations: Record<string, Derivation>;
  /** The params the schedule was actually built from (post pricing-axis adjustment). */
  effectiveParams: BondParams;
}

const PRICING_VALUES: Record<string, BondPricing> = {
  at_par: "par",
  premium: "premium",
  discount: "discount",
};

const METHOD_VALUES: Record<string, AmortMethod> = {
  straight_line: "straight",
  effective_interest: "effective",
};

/** Find the pricing/method the selected conditions imply (first matching axis value wins). */
function pricingFromConditions(conditions: Record<string, string>): BondPricing | null {
  for (const v of Object.values(conditions)) if (PRICING_VALUES[v]) return PRICING_VALUES[v];
  return null;
}

function methodFromConditions(conditions: Record<string, string>): AmortMethod {
  for (const v of Object.values(conditions)) if (METHOD_VALUES[v]) return METHOD_VALUES[v];
  return "effective";
}

/** Apply the pricing axis to the doc's default rates (2-point spread convention). */
export function adjustParamsForPricing(defaults: BondParams, pricing: BondPricing): BondParams {
  const stated = defaults.statedRateAnnual;
  const market =
    pricing === "par" ? stated : pricing === "premium" ? stated - 0.02 : stated + 0.02;
  return { ...defaults, marketRateAnnual: Math.round(market * 1000) / 1000 };
}

/**
 * Resolve all amounts for a scenario under the selected conditions.
 * Returns null when the doc has no v2 params block (a pure Phase-1 doc).
 * `seed` (or params.defaultSeed) switches from the authored defaults to generated numbers.
 */
export function resolveAmounts(
  doc: ScenarioDoc,
  variant: Variant | null,
  conditions: Record<string, string>,
  seed?: number,
): ResolvedAmounts | null {
  const spec = doc.params;
  if (!spec || spec.kind !== "bond") return null;

  const pricing = pricingFromConditions(conditions) ?? "discount";
  const method = methodFromConditions(conditions);

  const effectiveSeed = seed ?? undefined; // defaultSeed is a UI affordance, not auto-applied
  const base: BondParams =
    effectiveSeed !== undefined
      ? generateParams(effectiveSeed, {
          pricing,
          paymentsPerYear: spec.defaults.paymentsPerYear,
          issueDate: spec.defaults.issueDate,
          fiscalYearEnd: spec.defaults.fiscalYearEnd,
        })
      : adjustParamsForPricing(spec.defaults, pricing);

  const schedule = buildAmortSchedule(base, method);

  // Collect every slot ref used by the variant's lines + the doc's questions/traces/memorize.
  const refs = new Set<string>();
  for (const e of variant?.entries ?? []) for (const l of e.lines) if (l.amountSlotKey) refs.add(l.amountSlotKey);
  for (const t of doc.traces ?? []) for (const r of t.refs) refs.add(r);
  for (const m of doc.memorize ?? []) for (const r of m.traceRefs ?? []) refs.add(r);
  for (const q of doc.questions ?? []) {
    refs.add(q.answerExpr);
    for (const d of q.distractors) refs.add(d.expr);
  }

  const bindings: Record<string, number> = {};
  const derivations: Record<string, Derivation> = {};
  for (const ref of refs) {
    const hit = resolveRef(schedule, ref);
    if (hit === null) continue; // arithmetic exprs (e.g. "a * b / 2") resolve in Prompt 2's evaluator
    bindings[ref] = hit.value;
    if (hit.derivation) derivations[ref] = hit.derivation;
  }

  return { schedule, bindings, derivations, effectiveParams: base };
}

/** Fill each line's `amount` from its amountSlotKey (lines without a key stay ??? / null). */
export function bindVariantAmounts(
  entries: EntryTemplate[],
  bindings: Record<string, number>,
): EntryTemplate[] {
  return entries.map((e) => ({
    ...e,
    lines: e.lines.map((l) =>
      l.amountSlotKey && bindings[l.amountSlotKey] !== undefined
        ? { ...l, amount: bindings[l.amountSlotKey] }
        : l,
    ),
  }));
}

/** Resolve one PLAIN slot ref (not an arithmetic expression) against a schedule. */
export function resolveRef(
  schedule: AmortSchedule,
  ref: string,
): { value: number; derivation?: Derivation } | null {
  if (ref === "issuePrice") {
    return { value: schedule.issuePrice, derivation: schedule.issuePriceDerivation };
  }
  const param = ref.match(/^param:(\w+)$/);
  if (param) {
    const v = (schedule.params as unknown as Record<string, unknown>)[param[1]];
    return typeof v === "number" ? { value: v } : null;
  }
  const cell = ref.match(/^schedule:(\d+):(\w+)$/);
  if (cell) {
    const row = schedule.rows[parseInt(cell[1], 10) - 1];
    if (!row) return null;
    const field = cell[2] as keyof typeof row.derivations;
    if (field in row.derivations) {
      const d = row.derivations[field];
      return { value: d.value, derivation: d };
    }
    return null;
  }
  return null; // unknown / arithmetic expression
}

/** Sanity helper: does the doc's params block produce the pricing each variant claims? */
export function checkParamsPricingCoverage(doc: ScenarioDoc): string[] {
  const problems: string[] = [];
  if (!doc.params) return problems;
  for (const variant of doc.variants) {
    const pricing = pricingFromConditions(variant.conditions);
    if (!pricing) continue;
    const adjusted = adjustParamsForPricing(doc.params.defaults, pricing);
    const price = computeIssuePrice(adjusted);
    const face = adjusted.face;
    if (pricing === "par" && price !== face)
      problems.push(`variant ${variant.id}: at_par params price at ${price}, not face ${face}`);
    if (pricing === "premium" && price <= face)
      problems.push(`variant ${variant.id}: premium params do not price above face`);
    if (pricing === "discount" && price >= face)
      problems.push(`variant ${variant.id}: discount params do not price below face`);
  }
  return problems;
}
