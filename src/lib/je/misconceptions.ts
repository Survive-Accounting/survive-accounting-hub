// Misconception library — PURE data. Question distractors (and later Build mode) tag
// wrong answers with one of these ids so feedback teaches the SPECIFIC error the student
// made, not a generic "incorrect." Ch. 13 (bonds / long-term liabilities) set.
//
// `feedbackTemplate` is the reusable default; a distractor may override it with its own
// `feedback` when the generic wording doesn't fit the exact numbers on screen.

export const MISCONCEPTIONS = {
  cash_vs_expense: {
    label: "Cash payment mistaken for interest expense",
    feedbackTemplate:
      "That's the CASH coupon (face × stated rate × time). Interest EXPENSE follows the market: carrying value × market rate × time. They differ by exactly the amortization.",
  },
  market_rate_on_face: {
    label: "Market rate applied to face value",
    feedbackTemplate:
      "The market rate applies to the CARRYING VALUE (what the borrower really owes), not face. Face × market mixes the two rate bases.",
  },
  stated_rate_on_cv: {
    label: "Stated rate applied to carrying value",
    feedbackTemplate:
      "The stated rate only sets the CASH coupon on FACE. Expense uses the market rate on carrying value — you've crossed the two.",
  },
  prior_period_expense: {
    label: "Used the prior period's numbers",
    feedbackTemplate:
      "That's last period's figure. Under effective interest the carrying value moved, so this period's expense is computed on the UPDATED carrying value.",
  },
  face_vs_cv_on_retirement: {
    label: "Face used instead of carrying value at retirement",
    feedbackTemplate:
      "Gain or loss on retirement compares the reacquisition price with the CARRYING VALUE (face ± unamortized premium/discount), not with face alone.",
  },
  accrual_fraction_missed: {
    label: "Year-end accrual fraction skipped",
    feedbackTemplate:
      "The fiscal year ends PART-WAY through an interest period, so accrue only the elapsed fraction (e.g. × 3/6) of the period's expense, payable, and amortization.",
  },
  premium_discount_direction_flip: {
    label: "Premium/discount amortization direction flipped",
    feedbackTemplate:
      "Direction check: a DISCOUNT amortizes the carrying value UP toward face (expense > cash); a PREMIUM amortizes it DOWN toward face (expense < cash). You've flipped it.",
  },
} as const;

export type MisconceptionId = keyof typeof MISCONCEPTIONS;

export const KNOWN_MISCONCEPTION_IDS = Object.keys(MISCONCEPTIONS) as MisconceptionId[];

export function misconceptionFeedback(id: MisconceptionId, override?: string): string {
  return override?.trim() || MISCONCEPTIONS[id].feedbackTemplate;
}
