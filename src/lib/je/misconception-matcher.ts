// Misconception matcher — PURE. When a student's Build-mode amount is wrong, test it
// against the characteristic value of each known misconception so we can show the SPECIFIC
// feedback ("that's the cash coupon, not the expense") instead of a generic "incorrect".
//
// Reuses Prompt 2's resolveSlot for every candidate value — there is NO second resolver.
// Candidate expressions are built as slot-expression strings and evaluated against the
// scenario's AmortSchedule (the ctx), so they stay consistent with the schedule the entry
// was checked against.
import type { AmortSchedule } from "@/lib/je/amortization";
import type { MisconceptionId } from "@/lib/je/misconceptions";
import { resolveSlot } from "@/lib/je/slot-resolver";

export interface MisconceptionCandidate {
  id: MisconceptionId;
  value: number;
  /** The slot expression whose value characterizes this misconception (for debugging/tests). */
  expr: string;
}

const TOLERANCE = 1; // ±1 rounding tolerance (matches the amount check)

/**
 * Candidate wrong-answer values for a target line, keyed by the misconception each represents.
 * Only schedule-cell targets (`schedule:P:field`) are analyzed — arithmetic/literal targets
 * (accruals, retirement diffs authored as exprs) return [] and fall through to generic
 * feedback. Interest-expense targets get the four rate/period confusions.
 */
export function resolveMisconceptionCandidates(
  schedule: AmortSchedule,
  targetSlotKey: string | undefined,
): MisconceptionCandidate[] {
  if (!targetSlotKey) return [];
  const m = targetSlotKey.match(/^schedule:(\d+):(\w+)$/);
  if (!m) return [];
  const period = parseInt(m[1], 10);
  const field = m[2];
  const ppy = schedule.params.paymentsPerYear; // divisor = fraction of a year per period
  const priorCV = period === 1 ? "issuePrice" : `schedule:${period - 1}:carryingValueAfter`;

  const out: MisconceptionCandidate[] = [];
  const add = (id: MisconceptionId, expr: string) => {
    try {
      out.push({ id, value: resolveSlot(expr, schedule).value, expr });
    } catch {
      /* candidate not computable in this ctx — skip */
    }
  };

  if (field === "interestExpense") {
    // Cash coupon mistaken for expense: face × stated × time (= the cash payment).
    add("cash_vs_expense", `schedule:${period}:cashPayment`);
    // Market rate applied to FACE instead of carrying value.
    add("market_rate_on_face", `param:face * param:marketRateAnnual / ${ppy}`);
    // Stated rate applied to carrying value instead of the market rate.
    add("stated_rate_on_cv", `${priorCV} * param:statedRateAnnual / ${ppy}`);
    // Used the PRIOR period's expense (effective-interest: CV moved, so expense moved).
    if (period > 1) add("prior_period_expense", `schedule:${period - 1}:interestExpense`);
  }

  return out;
}

/**
 * If `studentAmount` matches (±1) the characteristic value of a misconception for this
 * target, return that misconception id — else null (→ generic "wrong amount").
 */
export function matchMisconception(
  schedule: AmortSchedule,
  targetSlotKey: string | undefined,
  studentAmount: number,
): MisconceptionId | null {
  for (const c of resolveMisconceptionCandidates(schedule, targetSlotKey)) {
    if (Math.abs(studentAmount - c.value) <= TOLERANCE) return c.id;
  }
  return null;
}
