// Vertical config seam. A "vertical" is a kind of organisation the scraper can
// target: accounting faculty today; Greek orgs, athletics, admin staff, law
// firms, etc. next. The engine ships accounting-tuned. To add a vertical you
// add a config here and tune it — you do NOT fork the pipeline.
//
// `status` drives the batch quote's delivery promise:
//   "live"           → instant delivery (config is tuned & tested)
//   "in_development" → needs human tuning first (your "~2 week" path)
//
// This is the substrate for selling access (pick a vertical → quote → run) and
// for handing King a self-contained area to evolve (the Greek config below).

export type VerticalStatus = "live" | "in_development";

export type Vertical = {
  id: string;
  label: string;
  status: VerticalStatus;
  /** One-line description shown in the batch target picker. */
  description: string;
  /** SerpAPI/Google query template; {name} and {domain} are filled per campus. */
  searchQueryTemplate: string;
  /** Terms used to keep only relevant people for this vertical. */
  deptFilterTerms: string[];
  /** Default lead_type written to campus_lead_suggestions for this vertical. */
  leadType: string;
  /** Default auto-tag for likely high-demand targets (accounting intro courses). */
  introTargetTag?: string;
  /** Rough delivery promise surfaced in the quote. */
  deliveryNote: string;
};

export const VERTICALS: Record<string, Vertical> = {
  accounting: {
    id: "accounting",
    label: "Accounting Faculty",
    status: "live",
    description:
      "Tenure-track + teaching accounting professors, with emails, RMP ratings, and CPA/PhD flags.",
    searchQueryTemplate: "site:{domain} accounting faculty",
    deptFilterTerms: ["accounting", "accountancy"],
    leadType: "professor",
    introTargetTag: "Intro Target", // mirrors INTRO_TARGET_TAG in role-keywords.ts
    deliveryNote: "Instant — accounting is fully tuned.",
  },
  greek: {
    id: "greek",
    label: "Greek Organizations",
    status: "in_development",
    description:
      "Fraternity & sorority chapter contacts and advisors. King's project — config not yet tuned.",
    searchQueryTemplate: "site:{domain} fraternity sorority greek life chapters",
    deptFilterTerms: [
      "fraternity",
      "sorority",
      "greek",
      "panhellenic",
      "interfraternity",
      "chapter",
    ],
    leadType: "greek_contact",
    deliveryNote: "In development — needs tuning before delivery (~2 weeks).",
  },
};

export const DEFAULT_VERTICAL_ID = "accounting";

export function getVertical(id: string | null | undefined): Vertical {
  return (id && VERTICALS[id]) || VERTICALS[DEFAULT_VERTICAL_ID];
}

export function listVerticals(): Vertical[] {
  return Object.values(VERTICALS);
}
