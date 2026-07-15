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
import type { EqComponent, EqDir } from "./types";

export type { EqComponent, EqDir } from "./types";

export const EQ_DIR_CYCLE: EqDir[] = ["up", "down", "both", "none"];
export const EQ_ARROW_GLYPH: Record<EqDir, string> = { up: "↑", down: "↓", both: "↑↓", none: "—" };

/** account_type → which equation bucket it belongs to (null = unclassifiable). */
export function equationBucketOf(type: string | undefined | null): EqComponent | null {
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
      return "equity"; // R/E lens: revenue & expense move equity
    default:
      return null;
  }
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

/** GROSS effect of one posting on its bucket's total. Assets: debit ↑ / credit ↓;
 *  liabilities & equity: credit ↑ / debit ↓. */
function bucketDir(bucket: EqComponent, side: "dr" | "cr"): "up" | "down" {
  if (bucket === "assets") return side === "dr" ? "up" : "down";
  return side === "cr" ? "up" : "down";
}

export interface EquationArrows {
  assets: EqDir;
  liabilities: EqDir;
  equity: EqDir;
}

/** The effect one line has, for click-through / labeling ("Cash DR → A↑"). */
export function lineEquationEffect(line: LineLike, coa: Map<string, CoaAccount>): { bucket: EqComponent; dir: "up" | "down" } | null {
  const acct = (line.account ?? "").trim();
  if (!acct) return null;
  const bucket = equationBucketOf(coa.get(acct)?.type);
  const side = sideOfLine(line);
  if (!bucket || !side) return null;
  return { bucket, dir: bucketDir(bucket, side) };
}

/** Aggregate a scenario's lines into a gross arrow per component. */
export function deriveEquationArrows(lines: LineLike[], coa: CoaAccount[] | Map<string, CoaAccount>): EquationArrows {
  const map = coa instanceof Map ? coa : new Map(coa.map((a) => [a.name, a]));
  const seen: Record<EqComponent, { up: boolean; down: boolean }> = {
    assets: { up: false, down: false },
    liabilities: { up: false, down: false },
    equity: { up: false, down: false },
  };
  for (const line of lines) {
    const eff = lineEquationEffect(line, map);
    if (eff) seen[eff.bucket][eff.dir] = true;
  }
  const resolve = (b: EqComponent): EqDir => {
    const s = seen[b];
    if (s.up && s.down) return "both";
    if (s.up) return "up";
    if (s.down) return "down";
    return "none";
  };
  return { assets: resolve("assets"), liabilities: resolve("liabilities"), equity: resolve("equity") };
}

/** Flatten grouped COA (ctx.coa) to a name → account lookup for the lib. */
export function coaLookup(groups: { accounts: CoaAccount[] }[]): Map<string, CoaAccount> {
  const m = new Map<string, CoaAccount>();
  for (const g of groups) for (const a of g.accounts) m.set(a.name, a);
  return m;
}
