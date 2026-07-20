// SPOTLIGHT (pure) — the PERFORMANCE cursor, distinct from selection. Selection
// is silver + authoring + saved; Spotlight is warm + transient (NEVER persisted)
// + works in film mode. It's a per-card focus INDEX over that card's ordered
// "emphasis targets", with an optional contiguous RANGE (shift-extend).
//
// This file is the pure core: the target REGISTRY (card kind → ordered target
// ids) + the index reducer + range membership. No React, no rf.
import { orderLines } from "./je-logic";
import type { CardData, CeqCard, ComputationCard, FormulaCard, JeCard, ListCard, ScheduleCard, TAccountCard } from "./types";

/** A schedule row has no id — address it by index. */
export const scheduleRowTarget = (rowIndex: number) => `sr:${rowIndex}`;
/** A memo card is a single self-target (spotlighting it glows the box + arrow). */
export const MEMO_SELF_TARGET = "self";

/** Ordered emphasis targets for a card, in READING order. Empty = not spotlightable.
 *  New kinds opt in by adding a case here — nothing else to touch. */
export function spotlightTargetsOf(data: CardData | undefined): string[] {
  if (!data) return [];
  switch (data.kind) {
    case "list":
      return (data as ListCard).rows.map((r) => r.id);
    case "je":
      return orderLines((data as JeCard).lines).map((l) => l.id);
    case "taccount": {
      const d = data as TAccountCard;
      return [...d.debits.map((e) => e.id), ...d.credits.map((e) => e.id)];
    }
    case "formula":
      return (data as FormulaCard).segments.map((s) => s.id);
    case "computation":
      return (data as ComputationCard).steps.map((s) => s.id);
    case "schedule":
      return (data as ScheduleCard).rows.map((_, i) => scheduleRowTarget(i));
    case "ceq":
      return (data as CeqCard).choices.map((c) => c.id);
    case "memo":
      return [MEMO_SELF_TARGET];
    default:
      return [];
  }
}

/** Which target a reveal step just uncovered (hidden true→false), so Spotlight can
 *  follow the reveal. Compares the card BEFORE against the reveal patch. */
export function revealedTargetId(before: CardData, patch: Partial<CardData>): string | null {
  const firstUncovered = <T extends { hidden?: boolean }>(b: T[], a: T[] | undefined, id: (t: T, i: number) => string): string | null => {
    if (!a) return null;
    for (let i = 0; i < b.length; i++) if (b[i]?.hidden && !a[i]?.hidden) return id(b[i], i);
    return null;
  };
  switch (before.kind) {
    case "list":
      return firstUncovered((before as ListCard).rows, (patch as Partial<ListCard>).rows, (r) => r.id);
    case "je":
      return firstUncovered((before as JeCard).lines, (patch as Partial<JeCard>).lines, (l) => l.id);
    case "formula":
      return firstUncovered((before as FormulaCard).segments, (patch as Partial<FormulaCard>).segments, (s) => s.id);
    case "computation":
      return firstUncovered((before as ComputationCard).steps, (patch as Partial<ComputationCard>).steps, (s) => s.id);
    case "schedule": {
      const b = (before as ScheduleCard).rows;
      const a = (patch as Partial<ScheduleCard>).rows;
      if (!a) return null;
      for (let r = 0; r < b.length; r++)
        for (let c = 0; c < b[r].length; c++)
          if (b[r][c]?.hidden && !a[r]?.[c]?.hidden) return scheduleRowTarget(r);
      return null;
    }
    default:
      return null;
  }
}

export interface SpotState {
  cardId: string;
  /** Focus index into spotlightTargetsOf(card). */
  index: number;
  /** Range anchor (shift-extend); null = single-target spotlight. */
  anchor: number | null;
}

/** Is target `index` spotlit under `state`? "single" one target, "range" inside a
 *  shift-extended band, false otherwise. */
export function spotMembership(state: SpotState, index: number): "single" | "range" | false {
  if (state.anchor == null) return state.index === index ? "single" : false;
  const lo = Math.min(state.anchor, state.index);
  const hi = Math.max(state.anchor, state.index);
  return index >= lo && index <= hi ? "range" : false;
}

/** Move the focus within a card of `n` targets.
 *  - dir -1 past the FIRST target → "exit" (the escape hatch).
 *  - shift (range) extends the band from the anchor; ctrl (jump) snaps to an edge.
 *  Returns the next state, or "exit" to leave Spotlight. */
export function moveSpot(state: SpotState, n: number, dir: -1 | 1, opts?: { range?: boolean; jump?: boolean }): SpotState | "exit" {
  if (n <= 0) return "exit";
  if (opts?.jump) {
    const index = dir < 0 ? 0 : n - 1;
    return { ...state, index, anchor: opts.range ? (state.anchor ?? state.index) : null };
  }
  if (opts?.range) {
    const anchor = state.anchor ?? state.index;
    const index = Math.max(0, Math.min(n - 1, state.index + dir));
    return { ...state, index, anchor };
  }
  // plain move — up off the top exits
  if (dir < 0 && state.index === 0) return "exit";
  const index = Math.max(0, Math.min(n - 1, state.index + dir));
  return { cardId: state.cardId, index, anchor: null };
}

/** Start (or restart) a spotlight on a specific target id of a card. */
export function startSpot(cardId: string, targets: string[], targetId: string): SpotState {
  const index = Math.max(0, targets.indexOf(targetId));
  return { cardId, index, anchor: null };
}

// ---- CLICK-TOGGLE MODEL (Lee's redesign) -----------------------------------
// Two independent emphasis layers keyed by `${cardId}::${targetId}`:
//   • regular = MANY gold pills (Ctrl+click toggles each).
//   • superKey = ONE flame (Ctrl+Shift+click; setting a new one replaces it).
// A key lives in at most one layer. Pure reducers so the behaviour is testable.
export interface SpotSets {
  regular: Set<string>;
  superKey: string | null;
}
export const spotKey = (cardId: string, targetId: string) => `${cardId}::${targetId}`;

/** Ctrl+click a target. On a SUPER target → downgrade it to regular. On a regular
 *  target → toggle it off. Otherwise → add a regular pill. */
export function applyRegularClick(s: SpotSets, k: string): SpotSets {
  const regular = new Set(s.regular);
  if (s.superKey === k) { regular.add(k); return { regular, superKey: null }; }
  if (regular.has(k)) regular.delete(k); else regular.add(k);
  return { regular, superKey: s.superKey };
}

/** Ctrl+Shift+click a target. On the current SUPER → toggle it off. Otherwise →
 *  make it the ONE super (replacing any previous), and drop it from regular. */
export function applySuperClick(s: SpotSets, k: string): SpotSets {
  if (s.superKey === k) return { regular: s.regular, superKey: null };
  const regular = new Set(s.regular);
  regular.delete(k);
  return { regular, superKey: k };
}
