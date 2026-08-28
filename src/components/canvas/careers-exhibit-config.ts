// "WHO DO YOU WORK FOR?" (accounting careers) EXHIBIT CONFIG — the careers map
// taught as a BRANCH MAP (first outing of that interaction family). ALL content
// lives here (Bible law 8: config, not code): trunks, anchors, leaves, the
// one-line descriptions, the crosslight, the doors strip, the CPA badge, the
// importance cues, and the reveal grouping. Accuracy fixes = edits to this file.
//
// THE EXHIBIT ANSWERS EXACTLY TWO QUESTIONS: who do you work for, and what kind
// of work do you do. Nothing else earns space here.
//
// ACCURACY (audited against 04_Accounting_Careers_Source.pdf and the standards
// exhibit, which must not contradict this one):
//   · The CPA LICENSE is issued by a STATE board of accountancy; the AICPA
//     writes the CPA Exam. Same ruling as standards-exhibit-config.ts — one
//     line total, tagged A+ DETAIL, never a credential wall.
//   · EXTERNAL auditor works at a firm and must be INDEPENDENT of the client;
//     INTERNAL auditor is an employee of the company being examined. That
//     contrast is the most-tested trap in this exhibit, so it is a crosslight,
//     not a footnote.
//   · The Big Four are Deloitte · PwC · EY · KPMG (global audit/tax/advisory
//     firms). Named, never ranked.
//   · Consulting / corporate finance / entrepreneurship / investing (VC, PE)
//     are DOORS accounting opens — adjacency, NOT branches of accounting
//     practice. They render in a segregated strip; a test pins them out of the
//     trunks.
//   · No salary data, no rankings, no "best career" claims anywhere.
//
// 【…】 marks THE HIGHLIGHTED EXAM-ANSWER PHRASE (Bible law 2); the card renders
// it with the house highlight treatment via splitHighlights().
//
// Pure data + pure helpers; tested in careers-exhibit.test.ts.
import type { CueLevel } from "./users-exhibit-config";

export type CareersTrunkId = "public" | "private" | "govnp";

export interface CareerLeafDef {
  id: string;
  label: string;
  /** The one-line real-world description, revealed on click. 【…】 = the phrase. */
  desc: string;
  cue?: CueLevel;
  /** Node ids to softly co-light with this leaf (the relationship crosslight). */
  colight?: readonly string[];
  /** The contrast line rendered with a crosslight. One line, both sides named. */
  contrast?: string;
}

export interface CareersTrunkDef {
  id: CareersTrunkId;
  label: string;
  /** The one-line anchor under the trunk name — WHO you work for. */
  anchor: string;
  cue?: CueLevel;
  leaves: readonly CareerLeafDef[];
  /** Muted caption row under the trunk (the Big Four row under PUBLIC). */
  caption?: { id: string; text: string; cue?: CueLevel };
}

/** THE THREE TRUNKS, left to right. Order is the layout order. */
export const CAREERS_TRUNKS: readonly CareersTrunkDef[] = [
  {
    id: "public",
    label: "PUBLIC",
    anchor: "You work for an accounting 【FIRM】 — many clients.",
    cue: "must",
    leaves: [
      {
        id: "audit",
        label: "Audit",
        desc: "You're the 【EXTERNAL AUDITOR】: you check CLIENTS' books so investors can trust them.",
        cue: "must",
      },
      { id: "tax", label: "Tax", desc: "You prepare returns and plan around the 【tax law】." },
      { id: "advisory", label: "Advisory / Consulting", desc: "You help clients 【fix and improve】 their business." },
    ],
    caption: { id: "bigfour", text: "The “Big Four”: Deloitte · PwC · EY · KPMG", cue: "easy" },
  },
  {
    id: "private",
    label: "PRIVATE / CORPORATE",
    anchor: "You work 【INSIDE】 one company.",
    cue: "must",
    leaves: [
      { id: "fin-acct", label: "Financial Accounting", desc: "You keep the company's books and build its 【statements】." },
      { id: "managerial", label: "Managerial / Cost Accounting", desc: "You build the numbers 【managers decide with】." },
      {
        id: "internal-audit",
        label: "Internal Audit",
        desc: "You check your 【OWN】 company from the inside.",
        cue: "easy",
        colight: ["audit"],
        contrast: "External auditor = works at a firm, must be independent. Internal auditor = employee.",
      },
      { id: "fpa", label: "FP&A", desc: "Budgets and forecasts — the company's 【financial GPS】." },
      { id: "controller-cfo", label: "Controller → CFO", desc: "The path up: 【run accounting → run finance】." },
    ],
  },
  {
    id: "govnp",
    label: "GOVERNMENT & NONPROFIT",
    anchor: "You work for 【the public】.",
    leaves: [
      { id: "irs", label: "IRS / state auditor", desc: "You audit 【for the taxpayer】." },
      { id: "nonprofit", label: "Nonprofit accounting", desc: "Mission organizations need books too." },
    ],
  },
] as const;

/** THE DOORS STRIP — visually segregated, dashed, muted. These are NOT
 *  accounting jobs and never render as branches of the tree (the accuracy
 *  rule of this exhibit). Adjacency, not membership. */
export const CAREERS_DOORS_LABEL = "DOORS IT OPENS";
export const CAREERS_DOORS_NOTE = "paths accountants often move into (not accounting jobs)";
export const CAREERS_DOORS: readonly { id: string; label: string }[] = [
  { id: "door-consulting", label: "Consulting" },
  { id: "door-corpfin", label: "Corporate Finance" },
  { id: "door-entrepreneurship", label: "Entrepreneurship" },
  { id: "door-investing", label: "Investing / VC / PE" },
] as const;

/** THE CPA BADGE — contextual, pinned to the PUBLIC trunk, one line, and it
 *  does not hijack the exhibit. License = STATE board; the AICPA writes the
 *  exam (see standards-exhibit-config.ts, which must agree). */
export const CAREERS_CPA = {
  id: "cpa",
  cue: "aplus" as CueLevel,
  text: "CPA — a 【STATE-issued license】 (pass the CPA Exam). Supercharges the public path; respected everywhere.",
};

/** THE DEPTH LAYER — public vs. private day-to-day, straight from the source
 *  pack. Manual toggle (D on camera), never part of the reveal sequence.
 *  Cells stay ≤5 words: this is a contrast, not a paragraph. */
export interface CareersContrastPair { id: string; pub: string; priv: string }
export const CAREERS_CONTRAST: readonly CareersContrastPair[] = [
  { id: "clients", pub: "Many clients, many industries", priv: "One company, in depth" },
  { id: "hours", pub: "Longer hours in busy season", priv: "More regular hours" },
  { id: "travel", pub: "More travel", priv: "Less travel" },
  { id: "path", pub: "Broad, varied experience", priv: "Clearer path inside" },
] as const;

/** REVEAL SEQUENCE (film): trunks → PUBLIC leaves → PRIVATE leaves → GOV/NP →
 *  doors strip → CPA badge + Big Four caption. Tick 0 = the banner and the
 *  three trunks with their anchors: the WHO question, answered, before any
 *  WHAT arrives. The depth layer is NOT a band — manual toggle only. */
export const CAREERS_REVEAL_STEPS = ["trunks", "public", "private", "govnp", "doors", "extras"] as const;
export const CAREERS_REVEAL_MAX = CAREERS_REVEAL_STEPS.length - 1;
export type CareersBand = (typeof CAREERS_REVEAL_STEPS)[number];
export const careersBandVisible = (band: CareersBand, tick: number): boolean =>
  CAREERS_REVEAL_STEPS.indexOf(band) <= tick;

/** The reveal band a trunk's leaves belong to — the trunk id doubles as the
 *  band id, kept as a function so the mapping stays explicit. */
export const careersLeafBand = (trunkId: CareersTrunkId): CareersBand => trunkId;

// ---- pure helpers --------------------------------------------------------

const NODE_TRUNK: ReadonlyMap<string, CareersTrunkId> = new Map(
  CAREERS_TRUNKS.flatMap((t) => [
    [t.id, t.id] as const,
    ...t.leaves.map((l) => [l.id, t.id] as const),
    ...(t.caption ? [[t.caption.id, t.id] as const] : []),
  ]),
);

/** Which trunk a node belongs to. The CPA badge is pinned to PUBLIC so it stays
 *  lit with that branch; the DOORS are deliberately outside every trunk. */
export const careersTrunkOf = (nodeId: string): CareersTrunkId | undefined =>
  nodeId === CAREERS_CPA.id ? "public" : NODE_TRUNK.get(nodeId);

export const careersLeaf = (id: string): CareerLeafDef | undefined =>
  CAREERS_TRUNKS.flatMap((t) => t.leaves).find((l) => l.id === id);

export const careersTrunk = (id: string): CareersTrunkDef | undefined =>
  CAREERS_TRUNKS.find((t) => t.id === id);

/** Every declared node id, in display order. */
export const careersNodeIds = (): string[] => [
  ...CAREERS_TRUNKS.flatMap((t) => [t.id, ...t.leaves.map((l) => l.id), ...(t.caption ? [t.caption.id] : [])]),
  CAREERS_CPA.id,
  ...CAREERS_DOORS.map((d) => d.id),
];

/** Every node that lights when a trunk is spotlighted: the trunk, its leaves,
 *  its caption, and (PUBLIC only) the CPA badge pinned to it. */
export const careersBranchIds = (trunkId: CareersTrunkId): string[] =>
  careersNodeIds().filter((n) => careersTrunkOf(n) === trunkId);
