// Pure JE-card logic — side handling, line moves/swaps/hops, memos, settings
// presets. Everything returns NEW arrays (absolute patches for the dispatcher);
// nothing here touches React Flow. Unit-tested in je-logic.test.ts.
import type { JeLine, JeMemo } from "./types";

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

/** Directed hop for the arrow keys: flip EXACTLY `id` to `to` IN PLACE — the
 *  line keeps its index in the array, so the block shifts horizontally where it
 *  sits and never re-sorts to the bottom. Returns null when there's nothing to
 *  do (no such line / already on that side) so callers don't dispatch empty
 *  undo steps. The A6 regression contract still holds: the SELECTED line is the
 *  one that flips — never a neighbor. Dragging to a socket (moveLine) remains
 *  the explicit-placement path. */
export function hopTo(lines: JeLine[], id: string | undefined, to: JeSide): JeLine[] | null {
  if (!id) return null;
  const l = lines.find((x) => x.id === id);
  if (!l || sideOf(l) === to) return null;
  return lines.map((x) => (x.id === id ? withSide(x, to) : x));
}

/** Explicit socket placement (drag-drop): insert `id` at ARRAY position `index`
 *  on `side`. Array order is render order (the polyomino contract) — nothing
 *  else re-sorts. `index` is the gap position AFTER the dragged line's removal. */
export function placeLine(lines: JeLine[], id: string, side: JeSide, index: number): JeLine[] {
  const l = lines.find((x) => x.id === id);
  if (!l) return lines;
  const rest = lines.filter((x) => x.id !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), withSide(l, side), ...rest.slice(at)];
}

/** Add-line nook: a new blank line lands adjacent to its column — after the
 *  LAST same-side line (debits fall back to the top, credits to the bottom). */
export function insertLine(lines: JeLine[], side: JeSide, nl: JeLine): JeLine[] {
  let last = -1;
  lines.forEach((l, i) => { if (sideOf(l) === side) last = i; });
  const at = last >= 0 ? last + 1 : side === "dr" ? 0 : lines.length;
  return [...lines.slice(0, at), withSide(nl, side), ...lines.slice(at)];
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

// ---- memos (PROMPT A: text + calc per line) ---------------------------------

/** The line's memos, normalized: the memos array is truth; a legacy `label`
 *  (scenario docs still spawn it) synthesizes a text memo carrying the old
 *  pos/open fields, so pre-migration lines render identically. */
export function memosOf(l: JeLine): JeMemo[] {
  if (l.memos) return l.memos;
  if (l.label) return [{ id: `${l.id}-m-text`, kind: "text", text: l.label, pos: l.memoPos, open: l.memoOpen }];
  return [];
}

export function memoOf(l: JeLine, kind: JeMemo["kind"]): JeMemo | undefined {
  return memosOf(l).find((m) => m.kind === kind);
}

/** The text memo's content — what scenario docs call the line label (hint,
 *  save-to-library round-trip). */
export function textMemoOf(l: JeLine): string | undefined {
  return memoOf(l, "text")?.text || undefined;
}

/** Set/replace the memo of `kind` (one per kind). Empty text REMOVES it.
 *  Returns the line's next memo fields — INCLUDING `label` kept in sync for
 *  the text kind, so doc round-trips and old readers stay correct. */
export function upsertMemo(l: JeLine, kind: JeMemo["kind"], text: string, extra?: Partial<JeMemo>): Partial<JeLine> {
  const rest = memosOf(l).filter((m) => m.kind !== kind);
  const prev = memoOf(l, kind);
  const memos = text.trim() === ""
    ? rest
    : [...rest, { id: prev?.id ?? `${l.id}-m-${kind}`, kind, text, pos: prev?.pos, open: prev?.open, ...extra }];
  const patch: Partial<JeLine> = { memos };
  if (kind === "text") patch.label = text.trim() === "" ? undefined : text;
  return patch;
}

/** Patch ONE memo's fields (pos/open) without touching its siblings. */
export function patchMemo(l: JeLine, kind: JeMemo["kind"], patch: Partial<JeMemo>): Partial<JeLine> {
  return { memos: memosOf(l).map((m) => (m.kind === kind ? { ...m, ...patch } : m)) };
}

/** Calc memo display: split each physical line at its LAST "=" so the = signs
 *  align in a two-column grid. Lines without "=" span both columns. */
export function calcRows(text: string): { left: string; right: string | null }[] {
  return text.split("\n").filter((ln) => ln.trim() !== "").map((ln) => {
    const at = ln.lastIndexOf("=");
    if (at === -1) return { left: ln.trim(), right: null };
    return { left: ln.slice(0, at).trim(), right: ln.slice(at + 1).trim() };
  });
}

// ---- date (PROMPT A item 6) -------------------------------------------------

/** "2026-01-15" → "Jan 15" (year appended only when it differs from today's). */
export function fmtJeDate(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = MONTHS[Number(mo) - 1];
  if (!month || Number(d) < 1 || Number(d) > 31) return null;
  const day = Number(d);
  return Number(y) === now.getFullYear() ? `${month} ${day}` : `${month} ${day}, ${y}`;
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
