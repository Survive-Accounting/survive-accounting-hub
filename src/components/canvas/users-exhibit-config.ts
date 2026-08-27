// "WHO'S IT FOR?" EXHIBIT CONFIG — internal/external users + financial/
// managerial accounting, taught as ONE relationship (internal → managerial,
// external → financial). ALL content lives here (Bible law 8: config, not
// code): chips, want-lines, mnemonics, importance cues, the differences
// pairs, and the reveal grouping. Accuracy fixes = edits to this file.
//
// ACCURACY (audited, per the spec): Employees = internal (Lee's historical
// framing; standard intro treatment). Board = internal BY DEFAULT with the
// A+ DETAIL professor-variance tag — tag it, don't silently rule on it.
// IRS / regulators / customers = external.
//
// Pure data + pure helpers; tested in users-exhibit.test.ts.

export type UsersSide = "inside" | "outside";
export type CueLevel = "must" | "easy" | "aplus";

export interface UserChipDef {
  id: string;
  label: string;
  /** The one-line question this user is asking. One line, nothing more. */
  want: string;
  /** Extra reveal line (the A+ variance note). Rendered under `want`. */
  wantExtra?: string;
  cue?: CueLevel;
}

export interface UsersSideDef {
  side: UsersSide;
  header: string;
  sub: string;
  headerCue?: CueLevel;
  chips: UserChipDef[];
  plate: { id: string; name: string; mnemonic: string; cue?: CueLevel };
}

export const USERS_SIDES: readonly UsersSideDef[] = [
  {
    side: "inside",
    header: "INSIDE",
    sub: "the company",
    headerCue: "must",
    chips: [
      { id: "owners", label: "Owners", want: "Is my company healthy?" },
      { id: "managers", label: "Managers & Executives", want: "What should we do next?" },
      { id: "employees", label: "Employees", want: "How are we doing?" },
      {
        id: "board",
        label: "Board of Directors",
        want: "Is management performing?",
        wantExtra: "Some professors/textbooks classify the board as external (they represent shareholders). Check your professor's slides.",
        cue: "aplus",
      },
    ],
    plate: { id: "managerial", name: "MANAGERIAL\nACCOUNTING", mnemonic: "for the ManaGERs", cue: "must" },
  },
  {
    side: "outside",
    header: "OUTSIDE",
    sub: "the company",
    headerCue: "must",
    chips: [
      { id: "investors", label: "Investors & Shareholders", want: "Should I buy or sell?" },
      { id: "banks", label: "Banks & Creditors", want: "Will they repay us?", cue: "easy" },
      { id: "regulators", label: "Regulators & Oversight", want: "Are the rules being followed?" },
      { id: "irs", label: "The IRS", want: "What do they owe in tax?", cue: "easy" },
      { id: "customers", label: "Customers", want: "Will this company be around?" },
    ],
    plate: { id: "financial", name: "FINANCIAL\nACCOUNTING", mnemonic: "for the people FINANCING you", cue: "must" },
  },
] as const;

/** HOW THEY DIFFER — the depth layer. Cells stay ≤4 words + parenthetical. */
export interface DifferencePair { id: string; managerial: string; financial: string }
export const USERS_DIFFERENCES: readonly DifferencePair[] = [
  { id: "gaap", managerial: "Flexible — no GAAP required", financial: "Follows GAAP" },
  { id: "time", managerial: "Future-focused (budgets)", financial: "Past-focused (results)" },
  { id: "scope", managerial: "Detailed, by segment", financial: "Whole company" },
  { id: "when", managerial: "Whenever needed", financial: "Fixed periods · audited" },
] as const;

/** REVEAL SEQUENCE (film): what each tick shows. Tick 0 = wall + headers only;
 *  each later tick ADDS a band. Full = the last tick. The differences strip is
 *  NOT part of the sequence — manual toggle only. */
export const USERS_REVEAL_STEPS = ["wall", "chips", "plates", "mnemonics"] as const;
export const USERS_REVEAL_MAX = USERS_REVEAL_STEPS.length - 1;

// ---- pure helpers --------------------------------------------------------

const CHIP_SIDE: ReadonlyMap<string, UsersSide> = new Map(
  USERS_SIDES.flatMap((s) => [
    ...s.chips.map((c) => [c.id, s.side] as const),
    [s.plate.id, s.side] as const,
    [`hdr-${s.side}`, s.side] as const,
  ]),
);

/** Which side a node id (chip / plate / hdr-<side>) belongs to. */
export const usersSideOf = (nodeId: string): UsersSide | undefined => CHIP_SIDE.get(nodeId);

/** Every declared node id, both sides, in display order. */
export const usersNodeIds = (): string[] =>
  USERS_SIDES.flatMap((s) => [`hdr-${s.side}`, ...s.chips.map((c) => c.id), s.plate.id]);

export const usersChip = (id: string): UserChipDef | undefined =>
  USERS_SIDES.flatMap((s) => s.chips).find((c) => c.id === id);

/** A reveal band is visible at a given tick (band index ≤ tick). */
export const usersBandVisible = (band: (typeof USERS_REVEAL_STEPS)[number], tick: number): boolean =>
  USERS_REVEAL_STEPS.indexOf(band) <= tick;
