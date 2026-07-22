// CHOREO (pure) — the materializer + part model behind Choreograph mode (Item 2/3)
// and the scrubber (Item 4). A frame's space-walk queue is its `recordedCues`
// (ordered explicit RecCue steps, built by clicking in Choreograph and played by
// Space). `materializeFrame` folds cues 0..n into the EXACT per-node visual state —
// the ONE source of truth that Space / Shift+Space / the scrubber all apply, so
// forward and reverse can never drift.
//
// Reveal is SET-based here (a card names the exact parts revealed so far), so parts
// can be revealed in ANY order, in place — unlike the cumulative first-N derived
// walk (revealPatchForCount). Legacy recorded reveal cues (revealCount, no targetId)
// keep their cumulative meaning, so old takes still play.
import { revealPatchForCount } from "./cue-sheet";
import {
  type CardData,
  type ComputationCard,
  type FormulaCard,
  isElementKind,
  type JeCard,
  type LegendCard,
  type ListCard,
  type RecCue,
  type ScheduleCard,
} from "./types";

/** Reveal-cue sentinels carried in RecCue.targetId. WHOLE = reveal the entire
 *  element at once (the default click). REST = reveal every part not already
 *  revealed for this card (the "rest of <card>" step, Item 3). */
export const WHOLE_TARGET = "__whole__";
export const REST_TARGET = "__rest__";

const EMPTY: ReadonlySet<string> = new Set();

/** Ordered part ids for a card — the G-explode targets and the reveal-set keys.
 *  Empty ⇒ no internal parts (scenery, note, CEQ deal-as-one, t-account): those
 *  reveal as a WHOLE only. Mirrors the kinds the derived walk can already reveal. */
export function framePartIds(d: CardData): string[] {
  switch (d.kind) {
    case "je":
      return (d as JeCard).lines.map((l) => l.id);
    case "computation":
      return (d as ComputationCard).steps.map((s) => s.id);
    case "formula":
      return (d as FormulaCard).segments.map((s) => s.id);
    case "list": {
      const l = d as ListCard;
      if (l.progressiveReveal) return []; // counter-based reveal has no per-row ids
      return [...(l.description ? ["desc"] : []), ...l.rows.map((r) => r.id)];
    }
    case "legend": {
      const l = d as unknown as LegendCard;
      return [...(l.slips ?? []).map((s) => s.id), ...(l.flavor ? ["flavor"] : [])];
    }
    case "schedule": {
      const out: string[] = [];
      (d as ScheduleCard).rows.forEach((row, r) => row.forEach((cl, c) => { if (cl.v !== "") out.push(`${r}·${c}`); }));
      return out;
    }
    default:
      return [];
  }
}

/** Part id + a short human label, in reveal order — the G-explode picker (Item 3).
 *  Aligned with framePartIds. Empty ⇒ the card has no natural parts. */
export function framePartLabels(d: CardData): { id: string; label: string }[] {
  switch (d.kind) {
    case "je":
      return (d as JeCard).lines.map((l, i) => ({ id: l.id, label: (l as { account?: string }).account || `line ${i + 1}` }));
    case "computation":
      return (d as ComputationCard).steps.map((s, i) => ({ id: s.id, label: s.label || `step ${i + 1}` }));
    case "formula":
      return (d as FormulaCard).segments.map((s, i) => ({ id: s.id, label: s.label || `part ${i + 1}` }));
    case "list": {
      const l = d as ListCard;
      if (l.progressiveReveal) return [];
      return [...(l.description ? [{ id: "desc", label: "definition" }] : []), ...l.rows.map((r, i) => ({ id: r.id, label: (r as { text?: string }).text || `item ${i + 1}` }))];
    }
    case "legend": {
      const l = d as unknown as LegendCard;
      return [...(l.slips ?? []).map((s, i) => ({ id: s.id, label: (s as { text?: string }).text || `slip ${i + 1}` })), ...(l.flavor ? [{ id: "flavor", label: "flavor line" }] : [])];
    }
    case "schedule": {
      const out: { id: string; label: string }[] = [];
      (d as ScheduleCard).rows.forEach((row, r) => row.forEach((cl, c) => { if (cl.v !== "") out.push({ id: `${r}·${c}`, label: String(cl.v) }); }));
      return out;
    }
    default:
      return [];
  }
}

/** A patch that sets a card's parts to exactly the VISIBLE set (or the whole card).
 *  Order-independent: each part's `hidden` is `!visible.has(id)`. `whole` overrides
 *  the set (everything visible). Touches the SAME fields as the derived walk. */
export function revealPartsPatch(d: CardData, visible: ReadonlySet<string>, whole: boolean): Partial<CardData> {
  const vis = (id: string) => whole || visible.has(id);
  switch (d.kind) {
    case "je":
      return { lines: (d as JeCard).lines.map((l) => ({ ...l, hidden: !vis(l.id) })) } as Partial<CardData>;
    case "computation":
      return { steps: (d as ComputationCard).steps.map((s) => ({ ...s, hidden: !vis(s.id) })) } as Partial<CardData>;
    case "formula":
      return { segments: (d as FormulaCard).segments.map((s) => ({ ...s, hidden: !vis(s.id) })) } as Partial<CardData>;
    case "list": {
      const l = d as ListCard;
      if (l.progressiveReveal) return { revealN: whole ? (l.revealTotal ?? 0) : Math.min(visible.size, l.revealTotal ?? 0) } as Partial<CardData>;
      return {
        descHidden: l.description ? !vis("desc") : undefined,
        rows: l.rows.map((r) => ({ ...r, hidden: !vis(r.id) })),
      } as Partial<CardData>;
    }
    case "legend": {
      const l = d as unknown as LegendCard;
      return {
        slips: (l.slips ?? []).map((s) => ({ ...s, hidden: !vis(s.id) })),
        flavorHidden: l.flavor ? !vis("flavor") : undefined,
      } as Partial<CardData>;
    }
    case "schedule":
      return { rows: (d as ScheduleCard).rows.map((row, r) => row.map((cl, c) => (cl.v !== "" ? { ...cl, hidden: !vis(`${r}·${c}`) } : cl))) } as Partial<CardData>;
    default:
      return {};
  }
}

export interface FrameNodeLike {
  id: string;
  type?: string;
  parentId?: string;
  data: CardData & { deckMember?: boolean; tucked?: boolean; cueHidden?: boolean };
}

export type NodePatch = Partial<CardData> & { tucked?: boolean; cueHidden?: boolean };

export interface MaterializeResult {
  /** nodeId → the patch that brings it to the state at step `n`. Only GOVERNED
   *  nodes (named by some cue) appear; unreferenced nodes are left untouched. */
  patches: Map<string, NodePatch>;
  /** The spotlight active at step `n` (last spot/super cue ≤ n), or null. */
  spot: { cardId: string; targetId: string; super: boolean } | null;
}

/** Fold cues[0..n] into the exact frame state. `n` = steps applied (0 = blank /
 *  rehearsal start; n ≥ len = everything). `cards` = the frame's card+element
 *  children; `memos` = its memo children. Pure — returns patches, applies nothing. */
export function materializeFrame(cards: FrameNodeLike[], memos: FrameNodeLike[], cues: RecCue[], n: number): MaterializeResult {
  const k = Math.max(0, Math.min(n, cues.length));

  // Which nodes are GOVERNED by the queue (named anywhere in the full list) — a
  // governed node is fully controlled by the walk; everything else is left alone.
  const dealGoverned = new Set<string>();
  const revealGoverned = new Set<string>();
  const memoGoverned = new Set<string>();
  for (const c of cues) {
    if (c.kind === "deal" && c.cardId) dealGoverned.add(c.cardId);
    else if (c.kind === "reveal" && c.cardId) revealGoverned.add(c.cardId);
    else if (c.kind === "memo" && c.memoId) memoGoverned.add(c.memoId);
  }

  // Apply the first k cues.
  const dealt = new Set<string>();
  const revealWhole = new Set<string>();
  const revealParts = new Map<string, Set<string>>();
  const legacyCount = new Map<string, number>();
  const memoShown = new Set<string>();
  let spot: MaterializeResult["spot"] = null;
  for (let i = 0; i < k; i++) {
    const c = cues[i];
    if (c.kind === "deal" && c.cardId) dealt.add(c.cardId);
    else if (c.kind === "reveal" && c.cardId) {
      const tid = c.targetId;
      if (tid === WHOLE_TARGET || tid === REST_TARGET) revealWhole.add(c.cardId);
      else if (tid) { const s = revealParts.get(c.cardId) ?? new Set<string>(); s.add(tid); revealParts.set(c.cardId, s); }
      else if (c.revealCount != null) legacyCount.set(c.cardId, Math.max(legacyCount.get(c.cardId) ?? 0, c.revealCount));
      else revealWhole.add(c.cardId); // reveal with no target + no count = whole
    } else if (c.kind === "memo" && c.memoId) memoShown.add(c.memoId);
    else if ((c.kind === "spot" || c.kind === "super") && c.cardId) spot = { cardId: c.cardId, targetId: c.targetId ?? "self", super: c.kind === "super" };
  }

  const patches = new Map<string, NodePatch>();
  for (const node of cards) {
    const d = node.data;
    const patch: NodePatch = {};
    if (isElementKind(d.kind)) {
      // scenery (heading / text / gate / exam cue): reveal = show (cueHidden false);
      // governed-but-not-yet = hidden. No internal parts.
      if (revealGoverned.has(node.id)) patch.cueHidden = !revealWhole.has(node.id);
    } else {
      if (dealGoverned.has(node.id)) patch.tucked = !dealt.has(node.id);
      if (revealGoverned.has(node.id)) {
        if (revealWhole.has(node.id)) Object.assign(patch, revealPartsPatch(d, EMPTY, true));
        else if (revealParts.has(node.id)) Object.assign(patch, revealPartsPatch(d, revealParts.get(node.id)!, false));
        else if (legacyCount.has(node.id)) Object.assign(patch, revealPatchForCount(d, legacyCount.get(node.id)!));
        else Object.assign(patch, revealPartsPatch(d, EMPTY, false)); // governed, none applied → all hidden
      }
    }
    if (Object.keys(patch).length) patches.set(node.id, patch);
  }
  for (const m of memos) if (memoGoverned.has(m.id)) patches.set(m.id, { cueHidden: !memoShown.has(m.id) });

  return { patches, spot };
}

/** Cue ids attached to a card/element/memo (used to remove an element's steps when
 *  it is un-clicked in Choreograph). */
export function cuesForNode(cues: RecCue[], nodeId: string): RecCue[] {
  return cues.filter((c) => c.cardId === nodeId || c.memoId === nodeId);
}
