// CUE SHEET (AC4, pure) — derive a frame's full space-walk sequence as an ordered
// list of CUES, from the SAME mechanics the show key performs: deck deals (deck
// order), each card's reveal steps, its memos, then the arm/advance. Read-only
// derivation + the inverse `revealPatchForCount` so clicking a cue can execute the
// frame up to that point. Phase 1: cues are DERIVED (deal order + reading order);
// Phase 2 (an explicit per-frame cue-order the space ladder consults) is speccable
// on top of this without changing the derivation contract.
import type { CardData, ComputationCard, FormulaCard, JeCard, LegendCard, ListCard, ScheduleCard } from "./types";

export type CueKind = "deal" | "reveal" | "memo" | "advance";
export interface Cue {
  id: string;
  kind: CueKind;
  cardId?: string;
  memoId?: string; // memo cues: the memo NODE id (cardId holds the memo's target card)
  label: string; // primary ("Deal", "Reveal", "Memo", "Advance")
  target: string; // what it acts on ("Owner invests cash", "slip 3", …)
  /** reveal cues only: how many of this card's steps are visible AFTER this cue. */
  revealCount?: number;
}

interface CardNodeLike {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: CardData & { title?: string; deckMember?: boolean; tucked?: boolean; stageOrder?: number };
}
interface MemoNodeLike { id: string; type?: string; data: { title?: string; body?: string; memoKind?: string } }
interface EdgeLike { id: string; source: string; target: string }

/** A short human name for a card (title, else JE description, else kind). */
function cardName(d: CardData & { title?: string }): string {
  if (d.title) return d.title;
  if (d.kind === "je") return (d as JeCard).caption || "Journal entry";
  if (d.kind === "legend") return (d as unknown as LegendCard).name || "Legend";
  return d.kind;
}

/** Ordered labels of a card's reveal steps — the exact order the space key reveals
 *  them (mirrors stepReveal). Empty ⇒ the card has nothing to reveal. */
export function hideableLabels(d: CardData): string[] {
  switch (d.kind) {
    case "je":
      return (d as JeCard).lines.map((l, i) => l.account || `line ${i + 1}`);
    case "computation":
      return (d as ComputationCard).steps.map((s, i) => s.label || `step ${i + 1}`);
    case "list": {
      const l = d as ListCard;
      if (l.progressiveReveal) return Array.from({ length: l.revealTotal ?? 0 }, (_, i) => `item ${i + 1}`);
      const rows = l.rows.map((r, i) => r.text || `item ${i + 1}`);
      return l.description ? ["definition", ...rows] : rows;
    }
    case "formula":
      return (d as FormulaCard).segments.map((s, i) => s.label || `part ${i + 1}`);
    case "legend": {
      const l = d as unknown as LegendCard;
      const slips = (l.slips ?? []).map((_, i) => `slip ${i + 1}`);
      return l.flavor ? [...slips, "flavor line"] : slips;
    }
    case "schedule": {
      const rows = (d as ScheduleCard).rows ?? [];
      const out: string[] = [];
      rows.forEach((row, r) => row.forEach((cl, c) => { if (cl.v !== "") out.push(`cell ${r + 1}·${c + 1}`); }));
      return out;
    }
    default:
      return [];
  }
}

/** Inverse of the reveal walk: a data patch that makes exactly the FIRST `n`
 *  reveal steps visible and the rest hidden (n=0 hides all, n≥count reveals all).
 *  Order matches hideableLabels so a cue index maps cleanly to card state. */
export function revealPatchForCount(d: CardData, n: number): Partial<CardData> {
  const vis = (i: number) => i >= n; // hidden === true when NOT yet revealed
  switch (d.kind) {
    case "je":
      return { lines: (d as JeCard).lines.map((l, i) => ({ ...l, hidden: vis(i) })) } as Partial<CardData>;
    case "computation":
      return { steps: (d as ComputationCard).steps.map((s, i) => ({ ...s, hidden: vis(i) })) } as Partial<CardData>;
    case "list": {
      const l = d as ListCard;
      if (l.progressiveReveal) return { revealN: Math.max(0, Math.min(n, l.revealTotal ?? 0)) } as Partial<CardData>;
      const off = l.description ? 1 : 0;
      return {
        descHidden: l.description ? n < 1 : undefined,
        rows: l.rows.map((r, i) => ({ ...r, hidden: vis(i + off) })),
      } as Partial<CardData>;
    }
    case "formula":
      return { segments: (d as FormulaCard).segments.map((s, i) => ({ ...s, hidden: vis(i) })) } as Partial<CardData>;
    case "legend": {
      const l = d as unknown as LegendCard;
      const slips = l.slips ?? [];
      return {
        slips: slips.map((s, i) => ({ ...s, hidden: vis(i) })),
        flavorHidden: l.flavor ? n < slips.length + 1 : undefined,
      } as Partial<CardData>;
    }
    case "schedule": {
      const rows = (d as ScheduleCard).rows ?? [];
      let k = 0;
      return { rows: rows.map((row) => row.map((cl) => (cl.v !== "" ? { ...cl, hidden: vis(k++) } : cl))) } as Partial<CardData>;
    }
    default:
      return {};
  }
}

/** How many of a card's reveal steps are CURRENTLY visible — powers the cue
 *  sheet's "you are here" / next-cue indicator. */
export function currentRevealCount(d: CardData): number {
  switch (d.kind) {
    case "je": return (d as JeCard).lines.filter((l) => !l.hidden).length;
    case "computation": return (d as ComputationCard).steps.filter((s) => !s.hidden).length;
    case "list": { const l = d as ListCard; if (l.progressiveReveal) return l.revealN ?? 0; return (l.description && !l.descHidden ? 1 : 0) + l.rows.filter((r) => !r.hidden).length; }
    case "formula": return (d as FormulaCard).segments.filter((s) => !s.hidden).length;
    case "legend": { const l = d as unknown as LegendCard; return (l.slips ?? []).filter((s) => !s.hidden).length + (l.flavor && !l.flavorHidden ? 1 : 0); }
    case "schedule": { let n = 0; for (const row of (d as ScheduleCard).rows ?? []) for (const c of row) if (c.v !== "" && !c.hidden) n++; return n; }
    default: return 0;
  }
}

/** PERFORMANCE ORDER of a frame's cards: loose (always-present) cards first in
 *  reading order, then deck members in deal (stageOrder) order — the order the
 *  show key actually reveals/deals them. */
export function frameCardOrder<T extends CardNodeLike>(cards: T[]): T[] {
  const loose = cards.filter((c) => !c.data.deckMember).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const deck = cards.filter((c) => c.data.deckMember).sort((a, b) => (a.data.stageOrder ?? 0) - (b.data.stageOrder ?? 0));
  return [...loose, ...deck];
}

/** Derive the ordered cue list for a frame. `cards` = the frame's card children;
 *  `memos` = its memo children; `edges` map memos → their target card. */
export function deriveFrameCues(cards: CardNodeLike[], memos: MemoNodeLike[], edges: EdgeLike[], hasNextFrame: boolean): Cue[] {
  const order = frameCardOrder(cards);
  const memoByTarget = new Map<string, MemoNodeLike[]>();
  for (const m of memos) {
    const e = edges.find((x) => x.source === m.id);
    const tgt = e?.target ?? "";
    (memoByTarget.get(tgt) ?? memoByTarget.set(tgt, []).get(tgt)!).push(m);
  }
  const cues: Cue[] = [];
  for (const c of order) {
    if (c.data.deckMember) cues.push({ id: `deal:${c.id}`, kind: "deal", cardId: c.id, label: "Deal", target: cardName(c.data) });
    const steps = hideableLabels(c.data);
    steps.forEach((s, i) => cues.push({ id: `rev:${c.id}:${i}`, kind: "reveal", cardId: c.id, label: "Reveal", target: s, revealCount: i + 1 }));
    for (const m of memoByTarget.get(c.id) ?? []) cues.push({ id: `memo:${m.id}`, kind: "memo", cardId: c.id, memoId: m.id, label: "Memo", target: m.data.title || m.data.body?.slice(0, 24) || "note" });
  }
  // memos with no resolved target land at the end
  for (const m of memoByTarget.get("") ?? []) cues.push({ id: `memo:${m.id}`, kind: "memo", memoId: m.id, label: "Memo", target: m.data.title || "note" });
  if (hasNextFrame) cues.push({ id: "advance", kind: "advance", label: "Advance", target: "next frame" });
  return cues;
}

/** PHASE 2: apply an explicit cue order. Cues whose id is in `order` come first in
 *  that order (existing cues only — stale ids drop); every remaining derived cue
 *  appends in its derived position (new cards/reveals auto-land at the end). No
 *  order (or empty) ⇒ the derived list unchanged. */
export function orderedCues(derived: Cue[], order?: string[]): Cue[] {
  if (!order || order.length === 0) return derived;
  const byId = new Map(derived.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Cue[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c && !seen.has(id)) { out.push(c); seen.add(id); }
  }
  for (const c of derived) if (!seen.has(c.id)) out.push(c);
  return out;
}

/** State readers for done/next — supplied live from the canvas nodes. */
export interface CueState {
  isDealt: (cardId: string) => boolean;
  revealCount: (cardId: string) => number;
  memoVisible: (memoId: string) => boolean;
}

/** A cue is DONE when its effect is already on the canvas (used by both the panel's
 *  "next" chip and the cue-driven space ladder). `advance` is never auto-done. */
export function cueIsDone(c: Cue, s: CueState): boolean {
  if (c.kind === "deal") return !!c.cardId && s.isDealt(c.cardId);
  if (c.kind === "reveal") return !!c.cardId && s.revealCount(c.cardId) >= (c.revealCount ?? 0);
  if (c.kind === "memo") return !!c.memoId && s.memoVisible(c.memoId);
  return false;
}

/** Index of the next cue Space will perform (first not-done), or -1 if all done. */
export function nextCueIndex(cues: Cue[], s: CueState): number {
  return cues.findIndex((c) => !cueIsDone(c, s));
}
