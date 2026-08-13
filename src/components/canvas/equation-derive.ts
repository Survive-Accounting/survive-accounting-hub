// EQUATION LENS derivation (pure) — one scenario doc, two lenses: the JE card
// shows the ENTRY, the equation card shows the EFFECT on A = L + E. Given a
// scenario's JE lines + the chart of accounts (name → type + normal balance),
// derive the GROSS direction each component moves.
//
// Key rule (same insight the ledger engine uses): within a bucket a DEBIT pushes
// the asset side up and the liability+equity side down — regardless of contra,
// because a contra account's normal balance already encodes its sign, and the
// bucket effect keys off the POSTING side, not the account's normal side. So
// Accumulated Depreciation (contra_asset) credited → assets DOWN, correctly.
//
// GROSS, not net: a bucket touched both up and down is "both" (↑↓) — buy
// equipment with cash hits Assets twice (Equipment DR ↑, Cash CR ↓) and we WANT
// to show A↑↓, not net-to-none. Revenue/expense fold into Equity (via retained
// earnings — treated as E for this lens): revenue CR → E↑, expense DR → E↓.
import type { CoaAccount } from "./je-logic";
import type { EqComponent, EqDir, EqPreset, RubricSign } from "./types";

export type { EqComponent, EqDir } from "./types";

export const EQ_DIR_CYCLE: EqDir[] = ["up", "down", "both", "none"];
export const EQ_ARROW_GLYPH: Record<EqDir, string> = { up: "↑", down: "↓", both: "↑↓", none: "—" };

/** account_type → which bucket it belongs to for a given PRESET (ER4). ale folds
 *  revenue/expense into equity; re surfaces them as revenues/expenses and drops
 *  balance-sheet accounts (null). null = not shown on this preset's card. */
export function equationBucketOf(type: string | undefined | null, preset: EqPreset = "ale"): EqComponent | null {
  if (preset === "re") {
    switch (type) {
      case "revenue":
      case "contra_revenue":
        return "revenues";
      case "expense":
      case "contra_expense":
        return "expenses";
      default:
        return null; // assets/liabilities/equity don't appear on the income lens
    }
  }
  switch (type) {
    case "asset":
    case "contra_asset":
      return "assets";
    case "liability":
    case "contra_liability":
    case "liability_adjunct":
      return "liabilities";
    case "equity":
    case "contra_equity":
    case "revenue":
    case "contra_revenue":
    case "expense":
    case "contra_expense":
      return "equity"; // A=L+E lens: revenue & expense move equity
    default:
      return null;
  }
}

/** The STATIC rubric of a component (ER5) — what a DEBIT does and what a CREDIT
 *  does, from the account type. NOT scenario-bound. Assets/Expenses are
 *  debit-normal (debit +); Liabilities/Equity/Revenues credit-normal (credit +). */
export function rubricOf(component: EqComponent): { dr: RubricSign; cr: RubricSign } {
  const debitNormal = component === "assets" || component === "expenses";
  return debitNormal ? { dr: "+", cr: "-" } : { dr: "-", cr: "+" };
}

interface LineLike {
  account?: string;
  side?: "dr" | "cr";
  dr?: number | null;
  cr?: number | null;
}

/** A line's posting side — explicit `side` wins, else inferred from which amount is set. */
export function sideOfLine(line: LineLike): "dr" | "cr" | null {
  if (line.side === "dr" || line.side === "cr") return line.side;
  if (line.dr != null) return "dr";
  if (line.cr != null) return "cr";
  return null;
}

/** GROSS effect of one posting on its bucket's total. Debit-normal buckets
 *  (assets, expenses): debit ↑ / credit ↓; credit-normal (liabilities, equity,
 *  revenues): credit ↑ / debit ↓. */
function bucketDir(bucket: EqComponent, side: "dr" | "cr"): "up" | "down" {
  const debitNormal = bucket === "assets" || bucket === "expenses";
  if (debitNormal) return side === "dr" ? "up" : "down";
  return side === "cr" ? "up" : "down";
}

export interface EquationArrows { assets: EqDir; liabilities: EqDir; equity: EqDir }

/** The effect one line has, for click-through / labeling ("Cash DR → A↑"). */
export function lineEquationEffect(line: LineLike, coa: Map<string, CoaAccount>, preset: EqPreset = "ale"): { bucket: EqComponent; dir: "up" | "down" } | null {
  const acct = (line.account ?? "").trim();
  if (!acct) return null;
  const bucket = equationBucketOf(coa.get(acct)?.type, preset);
  const side = sideOfLine(line);
  if (!bucket || !side) return null;
  return { bucket, dir: bucketDir(bucket, side) };
}

const ALL_COMPONENTS: EqComponent[] = ["assets", "liabilities", "equity", "revenues", "expenses"];

/** Aggregate a scenario's lines into a gross arrow per component, PRESET-AWARE
 *  (ER4): the same revenue credit derives E↑ on the ale card and Revenues↑ on
 *  the re card. Returns every bucket (unhit → "none"). */
export function deriveArrows(lines: LineLike[], coa: CoaAccount[] | Map<string, CoaAccount>, preset: EqPreset = "ale"): Record<EqComponent, EqDir> {
  const map = coa instanceof Map ? coa : new Map(coa.map((a) => [a.name, a]));
  const seen: Record<EqComponent, { up: boolean; down: boolean }> =
    Object.fromEntries(ALL_COMPONENTS.map((c) => [c, { up: false, down: false }])) as Record<EqComponent, { up: boolean; down: boolean }>;
  for (const line of lines) {
    const eff = lineEquationEffect(line, map, preset);
    if (eff) seen[eff.bucket][eff.dir] = true;
  }
  const resolve = (b: EqComponent): EqDir => {
    const s = seen[b];
    if (s.up && s.down) return "both";
    if (s.up) return "up";
    if (s.down) return "down";
    return "none";
  };
  return Object.fromEntries(ALL_COMPONENTS.map((c) => [c, resolve(c)])) as Record<EqComponent, EqDir>;
}

/** Back-compat: JUST the A=L+E arrows (ale preset, 3 keys). */
export function deriveEquationArrows(lines: LineLike[], coa: CoaAccount[] | Map<string, CoaAccount>): EquationArrows {
  const all = deriveArrows(lines, coa, "ale");
  return { assets: all.assets, liabilities: all.liabilities, equity: all.equity };
}

const PRESET_COMPONENTS: Record<EqPreset, { label: string; component: EqComponent }[]> = {
  ale: [
    { label: "Assets", component: "assets" },
    { label: "Liabilities", component: "liabilities" },
    { label: "Equity", component: "equity" },
  ],
  re: [
    { label: "Revenues", component: "revenues" },
    { label: "Expenses", component: "expenses" },
  ],
};

/** ER7 — the FormulaCard data for one BOUND, BLANK, arrows-lens effect card: each
 *  component's answer arrow is derived from the scenario's lines (preset-aware)
 *  and stored, but every segment ships HIDDEN so the card is blank until the
 *  space-walk reveals it. Pure — the caller wraps it into a node. */
export function effectCardData(
  scenarioId: string,
  lines: LineLike[],
  coa: CoaAccount[] | Map<string, CoaAccount>,
  preset: EqPreset,
  mkId: () => string,
): { kind: "formula"; scenarioId: string; preset: EqPreset; display: "arrows"; operators: string[]; segments: { id: string; label: string; value: string; component: EqComponent; arrow: EqDir; hidden: true }[] } {
  const arr = deriveArrows(lines, coa, preset);
  return {
    kind: "formula",
    scenarioId,
    preset,
    display: "arrows",
    operators: preset === "re" ? [] : ["=", "+"],
    segments: PRESET_COMPONENTS[preset].map((c) => ({ id: mkId(), label: c.label, value: "", component: c.component, arrow: arr[c.component], hidden: true as const })),
  };
}

/** Flatten grouped COA (ctx.coa) to a name → account lookup for the lib. */
export function coaLookup(groups: { accounts: CoaAccount[] }[]): Map<string, CoaAccount> {
  const m = new Map<string, CoaAccount>();
  for (const g of groups) for (const a of g.accounts) m.set(a.name, a);
  return m;
}
