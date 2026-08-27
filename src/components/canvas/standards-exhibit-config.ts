// "THE RULEBOOK & THE COPS" EXHIBIT CONFIG — standards & regulation as a
// relationship CHEAT SHEET: who writes the rules, what the rules are, who
// enforces them. ALL content lives here (Bible law 8) and the copy is
// ACCURACY-AUDITED — implement exactly, do not paraphrase:
//
//   · The 1934 law is the Securities EXCHANGE Act of 1934 (the "Securities
//     Act" is 1933, new issues). · FASB/GAAP covers nongovernmental entities,
//     never governments — that's GASB. · The old deck's invented "-G" suffix
//     term for government GAAP is not real; never render it (a test pins its
//     absence). · AICPA writes the CPA Exam + ethics; the LICENSE comes from
//     state boards.
//
// 【…】 marks THE HIGHLIGHTED EXAM-ANSWER PHRASE (Bible law 2) — the card
// renders it with the house highlight treatment. The FASB-is-private vs
// SEC-is-government contrast is the most-tested trap here; those two
// highlights are the point.
import type { CueLevel } from "./users-exhibit-config";

export interface StandardsTileDef {
  id: string;
  label: string;
  /** Small-caps permanent role caption (cram tiles) or subtitle (A+ tiles). */
  caption?: string;
  cue?: CueLevel;
  /** The two micro-lines, revealed on spotlight. 【…】 = exam-answer phrase. */
  what: string;
  does: string;
  /** Extra node ids to co-light when this tile is selected (relationships). */
  colight?: string[];
}

/** THE CRAM CHAIN — all a cram viewer sees. Order is the layout order. */
export const STANDARDS_CHAIN: readonly StandardsTileDef[] = [
  {
    id: "fasb",
    label: "FASB",
    caption: "THE WRITERS",
    cue: "must",
    what: "Independent, 【private-sector】 board — not a government agency.",
    does: "Writes and updates U.S. GAAP.",
  },
  {
    id: "gaap",
    label: "GAAP",
    caption: "THE RULEBOOK",
    cue: "must",
    what: "Generally Accepted Accounting Principles — 【the rules】 U.S. financial statements follow.",
    does: "Keeps every company's statements consistent and comparable.",
  },
  {
    id: "sec",
    label: "SEC",
    caption: "THE COPS",
    cue: "must",
    what: "【U.S. government agency】 created after the 1929 crash.",
    does: "Enforces the rules for public companies — and lets FASB write them.",
  },
] as const;

/** The two labeled arrows of the chain. `lightsWith`: selecting either end
 *  lights the arrow (GAAP lights both — it is the object of both verbs). */
export interface StandardsArrowDef { id: string; label: string; from: string; to: string }
export const STANDARDS_ARROWS: readonly StandardsArrowDef[] = [
  { id: "writes", label: "writes", from: "fasb", to: "gaap" },
  { id: "enforces", label: "enforces", from: "sec", to: "gaap" },
] as const;

/** THE A+ LAYER — collapsed by default, manual toggle (D on camera), never in
 *  the reveal sequence. Same click-to-spotlight behavior, smaller tiles. */
export const STANDARDS_APLUS: readonly StandardsTileDef[] = [
  {
    id: "gasb",
    label: "GASB",
    cue: "easy",
    what: "FASB's sibling for 【state & local governments】.",
    does: "Writes the GAAP governments follow.",
  },
  {
    id: "iasb",
    label: "IASB · IFRS",
    what: "The international writers — IASB writes 【IFRS】.",
    does: "Used in 140+ jurisdictions. The U.S. uses GAAP instead.",
  },
  {
    id: "pcaob",
    label: "PCAOB",
    cue: "easy",
    what: "Created by 【SOX (2002)】.",
    does: "Audits the auditors of public companies.",
  },
  {
    id: "aicpa",
    label: "AICPA",
    cue: "aplus",
    what: "The CPA profession's organization — writes the 【CPA Exam】 and its ethics code.",
    does: "A+ nuance: your CPA license comes from your STATE board of accountancy, not the AICPA.",
  },
  {
    id: "faf",
    label: "FAF",
    cue: "aplus",
    what: "The nonprofit parent that oversees and funds 【FASB and GASB】.",
    does: "Appoints both boards' members and shields their funding.",
    colight: ["fasb", "gasb"],
  },
  // OMITTED BY DESIGN — not intro-accounting content. Restore only if a
  // professor's syllabus demands it (uncomment = a config edit, not a build):
  // { id: "doddfrank", label: "Dodd-Frank (2010)", what: "Post-2008 financial reform act.", does: "Consumer protection + derivatives oversight." },
  // { id: "cfpb", label: "CFPB", what: "Consumer Financial Protection Bureau (Dodd-Frank).", does: "Consumer finance rules — not financial reporting." },
  // { id: "cftc", label: "CFTC", what: "Commodity Futures Trading Commission.", does: "Derivatives markets — not financial reporting." },
] as const;

/** SEC → FASB delegation — a line item, not a tile. */
export const STANDARDS_DELEGATION = {
  id: "delegation",
  cue: "aplus" as CueLevel,
  text: "The SEC has authority to set standards for public companies — it delegates that job to FASB.",
  colight: ["sec", "fasb"],
};

/** WHY THIS EXISTS — two cause→effect beats, NOT a timeline. One line each. */
export const STANDARDS_WHY: readonly { id: string; cue: CueLevel; text: string }[] = [
  { id: "why-1929", cue: "aplus", text: "1929 crash → Securities Act (1933) + Securities 【EXCHANGE】 Act (1934) → created the SEC." },
  { id: "why-sox", cue: "aplus", text: "Enron & WorldCom (2001–02) → 【SOX (2002)】 → internal controls + created the PCAOB." },
] as const;

/** REVEAL SEQUENCE (film): blank → GAAP alone → +FASB & its arrow → +SEC &
 *  its arrow → +role captions. The A+ layer is never part of it. */
export const STANDARDS_REVEAL_STEPS = ["blank", "gaap", "fasb", "sec", "captions"] as const;
export const STANDARDS_REVEAL_MAX = STANDARDS_REVEAL_STEPS.length - 1;
export type StandardsBand = (typeof STANDARDS_REVEAL_STEPS)[number];
export const standardsBandVisible = (band: StandardsBand, tick: number): boolean =>
  STANDARDS_REVEAL_STEPS.indexOf(band) <= tick;

export const standardsTile = (id: string): StandardsTileDef | undefined =>
  [...STANDARDS_CHAIN, ...STANDARDS_APLUS].find((t) => t.id === id);

export const standardsNodeIds = (): string[] => [
  ...STANDARDS_CHAIN.map((t) => t.id),
  ...STANDARDS_APLUS.map((t) => t.id),
  STANDARDS_DELEGATION.id,
];

/** Split a config string on 【…】 into plain/highlight segments for render. */
export function splitHighlights(text: string): { text: string; hl: boolean }[] {
  const out: { text: string; hl: boolean }[] = [];
  const re = /【([^】]*)】/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hl: false });
    out.push({ text: m[1], hl: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hl: false });
  return out;
}
