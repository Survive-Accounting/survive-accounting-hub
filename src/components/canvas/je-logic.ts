// Pure JE-card logic — side handling, line moves/swaps/hops, settings presets.
// Everything returns NEW arrays (absolute patches for the dispatcher); nothing
// here touches React Flow. Unit-tested in je-logic.test.ts.
import type { JeLine } from "./types";

export type JeSide = "dr" | "cr";
export type JeEntryType = "standard" | "adjusting" | "closing";

/** Explicit side wins; legacy lines (scenario docs) derive from which amount is set. */
export function sideOf(l: JeLine): JeSide {
  if (l.side) return l.side;
  if (l.cr != null && l.dr == null) return "cr";
  return "dr";
}

/** Display order: debits first, then credits (classic JE shape), stable within side. */
export function groupLines(lines: JeLine[]): { dr: JeLine[]; cr: JeLine[] } {
  return { dr: lines.filter((l) => sideOf(l) === "dr"), cr: lines.filter((l) => sideOf(l) === "cr") };
}

/** The single amount of a line (whichever column it sits in). */
export function amountOf(l: JeLine): number | null {
  return sideOf(l) === "dr" ? l.dr : l.cr;
}

/** Put a line's amount into the column its side dictates (dr XOR cr). */
function withSide(l: JeLine, side: JeSide): JeLine {
  const amt = amountOf(l);
  return { ...l, side, dr: side === "dr" ? amt : null, cr: side === "cr" ? amt : null };
}

/** Move `id` to `side` at `index` (position within that side, 0-based; clamped).
 *  Rebuilds the flat array as [dr…, cr…] — display order IS array order. */
export function moveLine(lines: JeLine[], id: string, side: JeSide, index: number): JeLine[] {
  const mover = lines.find((l) => l.id === id);
  if (!mover) return lines;
  const rest = lines.filter((l) => l.id !== id);
  const g = groupLines(rest);
  const target = side === "dr" ? [...g.dr] : [...g.cr];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, withSide(mover, side));
  return side === "dr" ? [...target, ...g.cr] : [...g.dr, ...target];
}

/** SWAP the sides of two lines (drop one account onto another). Amounts travel
 *  with their line into the new column; list positions are exchanged. */
export function swapLines(lines: JeLine[], aId: string, bId: string): JeLine[] {
  const a = lines.find((l) => l.id === aId);
  const b = lines.find((l) => l.id === bId);
  if (!a || !b || aId === bId) return lines;
  const aSide = sideOf(a);
  const bSide = sideOf(b);
  return lines.map((l) => (l.id === aId ? withSide(a, bSide) : l.id === bId ? withSide(b, aSide) : l));
}

/** ← / → : hop a line to the other side (appends at that side's end). */
export function hopLine(lines: JeLine[], id: string): JeLine[] {
  const l = lines.find((x) => x.id === id);
  if (!l) return lines;
  const to: JeSide = sideOf(l) === "dr" ? "cr" : "dr";
  return moveLine(lines, id, to, Number.MAX_SAFE_INTEGER);
}

/** Directed hop for the arrow keys: move EXACTLY `id` to `to`. Returns null when
 *  there's nothing to do (no such line / already on that side) so callers don't
 *  dispatch empty undo steps. The A6 regression contract: the SELECTED line is
 *  the one that moves — never a neighbor. */
export function hopTo(lines: JeLine[], id: string | undefined, to: JeSide): JeLine[] | null {
  if (!id) return null;
  const l = lines.find((x) => x.id === id);
  if (!l || sideOf(l) === to) return null;
  return moveLine(lines, id, to, Number.MAX_SAFE_INTEGER);
}

/** THE INVARIANT: a JE cluster never has fewer than 1 debit + 1 credit block.
 *  Deleting down to zero on a side re-spawns one blank socket there. */
export function ensureMinLines(lines: JeLine[], mkId: () => string): JeLine[] {
  const g = groupLines(lines);
  let out = lines;
  if (g.dr.length === 0) out = [{ id: mkId(), account: "", dr: null, cr: null, side: "dr" as const }, ...out];
  if (g.cr.length === 0) out = [...out, { id: mkId(), account: "", dr: null, cr: null, side: "cr" as const }];
  return out;
}

/** PRACTICE reveal gate: an "attempt" = any visible line the student put content
 *  into (an account name or an amount). No attempt → reveal shows the dialog. */
export function hasAttempt(lines: JeLine[]): boolean {
  return lines.some((l) => !l.hidden && (l.account.trim() !== "" || l.dr != null || l.cr != null));
}

/** Blank silhouette of a solved entry: same line count + sides, empty content.
 *  Used by practice copies and the gear RESET (min-lines invariant applies). */
export function blankFrom(solution: JeLine[], mkId: () => string): JeLine[] {
  return ensureMinLines(
    solution.map((l) => ({ id: mkId(), account: "", dr: null, cr: null, side: sideOf(l) })),
    mkId,
  );
}

/** Balance state honoring the ??? contract: any VISIBLE line with a null amount
 *  → "unknown" (neutral chip); otherwise sum and compare. */
export function balanceState(lines: JeLine[]): { state: "unknown" | "balanced" | "off"; sumDr: number; sumCr: number } {
  let sumDr = 0;
  let sumCr = 0;
  let anyUnknown = false;
  let anyValue = false;
  for (const l of lines) {
    if (l.hidden) continue;
    const amt = amountOf(l);
    if (amt == null) { anyUnknown = true; continue; }
    anyValue = true;
    if (sideOf(l) === "dr") sumDr += amt;
    else sumCr += amt;
  }
  if (anyUnknown || !anyValue) return { state: "unknown", sumDr, sumCr };
  return { state: Math.abs(sumDr - sumCr) < 0.005 ? "balanced" : "off", sumDr, sumCr };
}

// ---- settings + presets ----------------------------------------------------
// A1/A8/A9 cleanup: TWO modes only (Blind removed — a zero-grid card taught
// nothing). Amounts are ALWAYS ??? -until-valued (no visibility toggle) and the
// picker search is ALWAYS on — both left this struct entirely.
export interface JeSettings {
  showPicker: boolean; // GUIDED: "Choose account" dropdown; PRACTICE: free-type
  showNormalChips: boolean; // DR/CR normal-balance chips in the picker
  showGhosts: boolean; // ghost template sockets (both modes ship true — never zero-grid)
  lightbulbs: boolean; // memo lightbulbs on lines
}

export type JePreset = "guided" | "practice";

export const JE_PRESETS: Record<JePreset, JeSettings> = {
  guided: { showPicker: true, showNormalChips: true, showGhosts: true, lightbulbs: true },
  practice: { showPicker: false, showNormalChips: false, showGhosts: true, lightbulbs: false },
};

/** Legacy preset names (v≤2 scenes) → the surviving two. Blind reads as practice. */
export function normalizePreset(p: string | undefined): JePreset {
  return p === "practice" || p === "blind" ? "practice" : "guided";
}

/** Effective settings: canvas default preset, overridden per card. Old cards may
 *  carry retired keys (allowSearch/showAmounts) in their overrides — harmless. */
export function effectiveSettings(cardSettings: Partial<JeSettings> | undefined, canvasPreset: JePreset): JeSettings {
  return { ...JE_PRESETS[canvasPreset], ...pickKnown(cardSettings) };
}

function pickKnown(s: Partial<JeSettings> | undefined): Partial<JeSettings> {
  if (!s) return {};
  const out: Partial<JeSettings> = {};
  if (typeof s.showPicker === "boolean") out.showPicker = s.showPicker;
  if (typeof s.showNormalChips === "boolean") out.showNormalChips = s.showNormalChips;
  if (typeof s.showGhosts === "boolean") out.showGhosts = s.showGhosts;
  if (typeof s.lightbulbs === "boolean") out.lightbulbs = s.lightbulbs;
  return out;
}

/** The card's effective mode: explicit per-card mode wins, else the canvas default. */
export function effectiveMode(cardMode: string | undefined, canvasPreset: JePreset): JePreset {
  return cardMode === "guided" || cardMode === "practice" ? cardMode : canvasPreset;
}

// ---- chart of accounts grouping ---------------------------------------------
export interface CoaAccount { name: string; type: string; normal: "debit" | "credit" }
export interface CoaGroup { label: string; normal: "debit" | "credit"; accounts: CoaAccount[] }

const GROUP_OF: Record<string, string> = {
  asset: "Assets", contra_asset: "Assets",
  liability: "Liabilities", contra_liability: "Liabilities", liability_adjunct: "Liabilities",
  equity: "Equity", contra_equity: "Equity",
  revenue: "Revenue", contra_revenue: "Revenue",
  expense: "Expenses", contra_expense: "Expenses",
};
const GROUP_ORDER = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"] as const;
const GROUP_NORMAL: Record<string, "debit" | "credit"> = {
  Assets: "debit", Liabilities: "credit", Equity: "credit", Revenue: "credit", Expenses: "debit",
};

/** 5 teaching groups in fixed order; contra/adjunct accounts ride with their parent type. */
export function groupCoa(rows: { canonical_name: string; account_type: string; normal_balance: string }[]): CoaGroup[] {
  const groups: CoaGroup[] = GROUP_ORDER.map((label) => ({ label, normal: GROUP_NORMAL[label], accounts: [] }));
  for (const r of rows) {
    const label = GROUP_OF[r.account_type?.toLowerCase() ?? ""] ?? null;
    if (!label) continue;
    groups.find((g) => g.label === label)!.accounts.push({
      name: r.canonical_name,
      type: r.account_type,
      normal: r.normal_balance === "credit" ? "credit" : "debit",
    });
  }
  for (const g of groups) g.accounts.sort((a, b) => a.name.localeCompare(b.name));
  return groups.filter((g) => g.accounts.length > 0);
}
