// THE BRIDGE — the Map's nodes, resolved against the models the canvas already owns.
//
// Lee, 2026-09-07: "What type of account is ______. This is simple, I'll just need a summary of
// each account type and all the accounts within each type… I need T account builder, trial
// balance builder, and of course journal entry builder… A = L + E rubric will be useful."
// None of that is rebuilt here. A map node names things; this module looks them up:
//
//   accounts   ← account-registry (the five categories, their labels, the normal side) in the
//                classifier's reveal order (classification-exhibit-config's tiles)
//   je         ← ledger-model's JeLine / jePieces / jeTotals — the same piece-by-piece reveal
//   taccount   ← ledger-model's postToTs, fed the je nodes that post into it
//   tb         ← the taccount nodes it names, totalled the way trialBalance does
//   equation   ← equation-derive's lineEquationEffect (via deriveEquationArrows) with the
//                registry as the chart of accounts, when a je points at the equation
//
// EVERY DERIVATION FALLS BACK TO THE NODE'S OWN DATA WHEN PRESENT: explicit posts, explicit
// rows, explicit arrows win. `resolveCluster` fills the derived fields once so ClusterStage and
// its node renderers never derive inline — a renderer draws a ResolvedNode, nothing else.
//
// Pure: no React, no network. cluster-models.test.ts pins it against the spec test's fixture.
import { ACCOUNT_REGISTRY, accountByLabel, accountsIn, type AccountCategory } from "@/components/canvas/account-registry";
import { CLASS_TILES } from "@/components/canvas/classification-exhibit-config";
import { deriveEquationArrows } from "@/components/canvas/equation-derive";
import { MASK, jePieces, jeTotals, postToTs, tBalanceRow, tRows, trialBalance, type JeLine, type JePiece, type TAccount, type TRow } from "@/components/canvas/exhibit-lab/ledger-model";
import type { AcctType, Scenario } from "@/components/canvas/exhibit-lab/rubric-model";
import type { CoaAccount } from "@/components/canvas/je-logic";

import type { ClusterEdge, ClusterNode, ClusterNodeData, ClusterSpec, EqDir } from "./cluster-spec";

export { MASK };

type AccountsGroup = Extract<ClusterNodeData, { kind: "accounts" }>["groups"][number];
type JeData = Extract<ClusterNodeData, { kind: "je" }>;
type TData = Extract<ClusterNodeData, { kind: "taccount" }>;
type TbData = Extract<ClusterNodeData, { kind: "tb" }>;
type EqData = Extract<ClusterNodeData, { kind: "equation" }>;

// ---------------------------------------------------------------- the registry, as the map wants it

/** The classifier's reveal order — the five tiles, Assets first (CLASS_TILES is the record). */
export const FIVE_TYPES: readonly AccountCategory[] = CLASS_TILES.map((t) => t.id);

const CATEGORY_TYPE: Record<AccountCategory, AcctType> = { asset: "A", liability: "L", equity: "E", revenue: "R", expense: "X" };
const NORMAL_OF: Record<AccountCategory, "dr" | "cr"> = { asset: "dr", liability: "cr", equity: "cr", revenue: "cr", expense: "dr" };

/** The category a group label names — "ASSETS", "Assets", "asset", "Liabilities"… — or null. */
export function categoryOfLabel(label: string): AccountCategory | null {
  const k = label.trim().toLowerCase().replace(/s$/, "").replace("ie", "y");
  return (FIVE_TYPES as readonly string[]).includes(k) ? (k as AccountCategory) : null;
}

/** The accounts node's `groups`, straight from the registry: one group per category (the five,
 *  or the ones asked for), the tile's label, every account of that category by its registry
 *  label in registry order (contras already last), the normal side, and Lee's one-word anchor
 *  (OWN · OWE · VALUE · EARN · COST) as the note. */
export function accountsFromRegistry(kind: "five-types" | readonly AccountCategory[] = "five-types"): AccountsGroup[] {
  const cats = kind === "five-types" ? FIVE_TYPES : kind;
  return cats.map((c) => {
    const tile = CLASS_TILES.find((t) => t.id === c);
    return { label: tile?.label ?? c.toUpperCase(), accounts: accountsIn(c).map((a) => a.label), normal: NORMAL_OF[c], ...(tile ? { note: tile.anchor } : {}) };
  });
}

/** The rubric type of an account name (registry label or alias), else the explicit type, else a
 *  stand-in from the normal side (dr → A, cr → L) so the ledger math still runs. */
export function typeForAccount(label: string, explicit?: AcctType, normal?: "dr" | "cr"): AcctType {
  if (explicit) return explicit;
  const reg = accountByLabel(label);
  if (reg) return CATEGORY_TYPE[reg.category];
  return normal === "cr" ? "L" : "A";
}

/** THE CHART OF ACCOUNTS for equation-derive: the registry (labels and aliases), contras typed
 *  `contra_<category>` the way the canvas COA types them. */
export function registryCoa(): Map<string, CoaAccount> {
  const m = new Map<string, CoaAccount>();
  for (const a of ACCOUNT_REGISTRY) {
    const acct: CoaAccount = { name: a.label, type: a.contra ? `contra_${a.category}` : a.category, normal: NORMAL_OF[a.category] === "dr" ? "debit" : "credit" };
    m.set(a.label, acct);
    for (const alias of a.aliases ?? []) if (!m.has(alias)) m.set(alias, { ...acct, name: alias });
  }
  return m;
}

const COA_TYPE_OF: Record<AcctType, string> = { A: "asset", L: "liability", E: "equity", R: "revenue", X: "expense" };

// ---------------------------------------------------------------- the journal entry

/** A je node's lines in the lab's JeLine shape — debits first, credits after (the classic
 *  silhouette); the type from the line, else the registry, else the posting side. */
export function jeToLines(node: ClusterNode): JeLine[] {
  if (node.data.kind !== "je") return [];
  const of = (l: JeData["lines"][number]): JeLine => {
    const dr = l.dr != null;
    return { account: l.account, type: typeForAccount(l.account, l.type, dr ? "dr" : "cr"), dr, amount: (dr ? l.dr : l.cr) ?? 0 };
  };
  const lines = node.data.lines;
  return [...lines.filter((l) => l.dr != null).map(of), ...lines.filter((l) => l.dr == null).map(of)];
}

/** A je node as the scenario shape postToTs eats. */
function jeScenario(node: ClusterNode): Scenario | null {
  if (node.data.kind !== "je") return null;
  return { id: node.data.scenarioId ?? node.id, text: node.data.description, entry: jeToLines(node).map((l) => ({ account: l.account, type: l.type, dr: l.dr, amount: l.amount })) };
}

// ---------------------------------------------------------------- the T-account

/** The je nodes that post into `to`: the ones its `fromNodes` names, plus any je with a
 *  "post" edge to it — in node order, each once. */
export function jeSourcesOf(to: ClusterNode, nodes: readonly ClusterNode[], edges: readonly ClusterEdge[]): ClusterNode[] {
  const named = new Set<string>(to.data.kind === "taccount" || to.data.kind === "tb" ? to.data.fromNodes ?? [] : []);
  for (const e of edges) if (e.to === to.id && e.kind === "post") named.add(e.from);
  return nodes.filter((n) => n.data.kind === "je" && named.has(n.id));
}

/** The T for a taccount node: its own `posts` when given, else the postings the je nodes in
 *  `fromNodes` (or with a "post" edge to it) make into this account — via postToTs, so the
 *  totals, the balance and its side are the lab's. */
export function postJe(node: ClusterNode, nodes: readonly ClusterNode[], edges: readonly ClusterEdge[]): TAccount | null {
  if (node.data.kind !== "taccount") return null;
  const d: TData = node.data;
  const type = typeForAccount(d.account, undefined, d.normal);
  const openings = d.opening ? { [d.account]: d.opening } : {};
  const scenarios: Scenario[] = d.posts
    ? d.posts.map((p, i) => ({ id: `${node.id}-post-${i}`, text: p.label, entry: [{ account: d.account, type, dr: p.dr, amount: p.amount }] }))
    : jeSourcesOf(node, nodes, edges).map(jeScenario).filter((s): s is Scenario => !!s);
  // postToTs types an opening-only account through the lab's own COA; a map account it has never
  // heard of (or one with no postings at all) still needs a T — build the empty one by hand.
  const ts = postToTs(scenarios, openings);
  const hit = ts.find((t) => t.account === d.account);
  if (hit) return hit;
  const normalDr = d.normal === "dr";
  const opening = d.opening ?? 0;
  return { account: d.account, type, opening, posts: [], drTotal: normalDr ? opening : 0, crTotal: normalDr ? 0 : opening, balance: Math.abs(opening), side: opening >= 0 ? d.normal : normalDr ? "cr" : "dr" };
}

// ---------------------------------------------------------------- the trial balance

export interface TbRow { account: string; dr?: number; cr?: number }
export interface TbResolved { title: string; rows: TbRow[]; dr: number; cr: number; balanced: boolean }

/** The rows of a tb node: its own `rows` when given, else one per taccount node it names (or
 *  that "post"-edges into it), each balance on its side; totalled like trialBalance. */
export function trialBalanceRows(node: ClusterNode, nodes: readonly ClusterNode[], edges: readonly ClusterEdge[]): TbResolved | null {
  if (node.data.kind !== "tb") return null;
  const d: TbData = node.data;
  const title = d.title ?? "Trial Balance";
  if (d.rows) {
    const dr = d.rows.reduce((s, r) => s + (r.dr ?? 0), 0), cr = d.rows.reduce((s, r) => s + (r.cr ?? 0), 0);
    return { title, rows: d.rows.map((r) => ({ account: r.account, ...(r.dr != null ? { dr: r.dr } : {}), ...(r.cr != null ? { cr: r.cr } : {}) })), dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
  }
  const named = new Set<string>(d.fromNodes ?? []);
  for (const e of edges) if (e.to === node.id && e.kind === "post") named.add(e.from);
  const ts = nodes.filter((n) => n.data.kind === "taccount" && named.has(n.id)).map((n) => postJe(n, nodes, edges)).filter((t): t is TAccount => !!t);
  const rows: TbRow[] = ts.map((t) => ({ account: t.account, ...(t.side === "dr" ? { dr: t.balance } : { cr: t.balance }) }));
  const tot = trialBalance(ts);
  return { title, rows, dr: tot.dr, cr: tot.cr, balanced: tot.balanced };
}

// ---------------------------------------------------------------- the equation

export type EquationArrows = EqData["arrows"];

/** The A = L + E arrows a je node's lines imply — lineEquationEffect per line (through
 *  deriveEquationArrows: gross, so a bucket hit both ways is ↑↓), the registry as the chart of
 *  accounts, and a line's explicit rubric type standing in for an account the registry lacks. */
export function equationFromJe(jeNode: ClusterNode): EquationArrows | null {
  if (jeNode.data.kind !== "je") return null;
  const coa = registryCoa();
  for (const l of jeNode.data.lines) if (l.type && !coa.has(l.account)) coa.set(l.account, { name: l.account, type: COA_TYPE_OF[l.type], normal: l.type === "A" || l.type === "X" ? "debit" : "credit" });
  return deriveEquationArrows(jeNode.data.lines.map((l) => ({ account: l.account, dr: l.dr ?? null, cr: l.cr ?? null })), coa);
}

const NO_ARROWS = (a: EquationArrows): boolean => a.assets === "none" && a.liabilities === "none" && a.equity === "none";

/** An equation node's arrows: its own, unless they are all "—" AND a je node points at it (any
 *  edge from a je to the equation) — then the entry decides. Explicit arrows always win. */
export function equationArrowsOf(node: ClusterNode, nodes: readonly ClusterNode[], edges: readonly ClusterEdge[]): EquationArrows {
  if (node.data.kind !== "equation") return { assets: "none", liabilities: "none", equity: "none" };
  if (!NO_ARROWS(node.data.arrows)) return node.data.arrows;
  const src = edges.filter((e) => e.to === node.id).map((e) => nodes.find((n) => n.id === e.from)).find((n) => n?.data.kind === "je");
  return (src && equationFromJe(src)) ?? node.data.arrows;
}

// ---------------------------------------------------------------- resolve

export type EqTerm = "assets" | "liabilities" | "equity";

export type ResolvedView =
  | { kind: "equation"; arrows: EquationArrows; extras: { label: string; dir: EqDir; links?: EqTerm }[]; caption?: string }
  | { kind: "accounts"; groups: AccountsGroup[]; revealBy: "group" | "account" }
  | { kind: "je"; description: string; badge: "JE" | "ADJ" | "CL"; lines: JeLine[]; pieces: JePiece[]; totals: { dr: number; cr: number; balanced: boolean }; typed: boolean }
  | { kind: "taccount"; t: TAccount; rows: TRow[]; balance: TRow; normal: "dr" | "cr" }
  | { kind: "tb"; tb: TbResolved }
  | { kind: "ceq"; ceqId: string }
  | { kind: "callout"; calloutKind: "cheat" | "phrase" | "tip"; title: string; text?: string; bullets: string[] }
  | { kind: "note"; text: string };

export interface ResolvedNode { node: ClusterNode; view: ResolvedView }

/** One node, resolved — every derived field filled from the models above. */
export function resolveNode(node: ClusterNode, nodes: readonly ClusterNode[], edges: readonly ClusterEdge[]): ResolvedNode {
  const d = node.data;
  switch (d.kind) {
    case "equation":
      return { node, view: { kind: "equation", arrows: equationArrowsOf(node, nodes, edges), extras: d.extras ?? [], ...(d.caption ? { caption: d.caption } : {}) } };
    case "accounts": {
      // A group with no accounts whose label names a category gets the registry's list.
      const groups = d.groups.map((g) => {
        if (g.accounts.length) return g;
        const c = categoryOfLabel(g.label);
        return c ? { ...g, accounts: accountsIn(c).map((a) => a.label), normal: g.normal ?? NORMAL_OF[c] } : g;
      });
      return { node, view: { kind: "accounts", groups, revealBy: d.revealBy ?? "group" } };
    }
    case "je": {
      const lines = jeToLines(node);
      return { node, view: { kind: "je", description: d.description, badge: d.badge ?? "JE", lines, pieces: jePieces(lines), totals: jeTotals(lines), typed: d.lines.some((l) => !!l.type) } };
    }
    case "taccount": {
      const t = postJe(node, nodes, edges)!;
      return { node, view: { kind: "taccount", t, rows: tRows(t), balance: tBalanceRow(t), normal: d.normal } };
    }
    case "tb":
      return { node, view: { kind: "tb", tb: trialBalanceRows(node, nodes, edges)! } };
    case "ceq":
      return { node, view: { kind: "ceq", ceqId: d.ceqId } };
    case "callout":
      return { node, view: { kind: "callout", calloutKind: d.calloutKind, title: d.title, ...(d.text ? { text: d.text } : {}), bullets: d.bullets ?? [] } };
    case "note":
      return { node, view: { kind: "note", text: d.text } };
  }
}

/** The whole map, resolved, keyed by node id — what ClusterStage draws from. */
export function resolveCluster(spec: ClusterSpec): Map<string, ResolvedNode> {
  return new Map(spec.nodes.map((n) => [n.id, resolveNode(n, spec.nodes, spec.edges)]));
}

/** The per-take arrow override the film keeps (click a term on a live equation) — applied over a
 *  resolved equation so the spec on the frame is never written mid-take. */
export type ArrowOverrides = Record<string, Partial<Record<EqTerm, EqDir>>>;

export function withArrowOverrides(resolved: Map<string, ResolvedNode>, overrides: ArrowOverrides | undefined): Map<string, ResolvedNode> {
  if (!overrides || !Object.keys(overrides).length) return resolved;
  const out = new Map(resolved);
  for (const [id, over] of Object.entries(overrides)) {
    const r = out.get(id);
    if (!r || r.view.kind !== "equation") continue;
    out.set(id, { node: r.node, view: { ...r.view, arrows: { ...r.view.arrows, ...over } } });
  }
  return out;
}

/** Money the way the ledger prints it: 1,200 — no cents unless there are some. */
export function fmtAmount(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
