// SPOTLIGHT (pure) — the PERFORMANCE cursor, distinct from selection. Selection
// is silver + authoring + saved; Spotlight is warm + transient (NEVER persisted)
// + works in film mode. It's a per-card focus INDEX over that card's ordered
// "emphasis targets", with an optional contiguous RANGE (shift-extend).
//
// This file is the pure core: the target REGISTRY (card kind → ordered target
// ids) + the index reducer + range membership. No React, no rf.
import { orderLines } from "./je-logic";
import type { CardData, CeqCard, ComputationCard, CycleElement, FormulaCard, JeCard, ListCard, ScheduleCard, TAccountCard } from "./types";

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
    case "cycle": // accounting cycle — per-STEP targets (Lee: only steps, not the whole element)
      return (data as CycleElement).steps.map((s) => s.id);
    case "memo":
    case "heading": // heading / Big Text — whole-element spotlight (Lee)
    case "text": // text block — whole-element spotlight (Lee)
    case "examcue": // exam-cue callout — whole-element spotlight (Lee)
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

// SpotState is a remnant of the old index/range CURSOR model. Its movers
// (moveSpot/startSpot/spotMembership) were deleted in the deletion run — the
// click-toggle model below replaced them. The interface itself is RETAINED only
// because SpotlightContext's dormant `spot` field is typed with it (spotTrapFlip
// reads spot.cardId). Removing it fully is an attended follow-up.
export interface SpotState {
  cardId: string;
  index: number;
  anchor: number | null;
}

// ---- CLICK-TOGGLE MODEL (Lee's redesign) -----------------------------------
// Two independent emphasis layers keyed by `${cardId}::${targetId}`:
//   • regular = MANY gold pills (Ctrl+click toggles each).
//   • superKey = ONE super-spotlight with a TONE:
//       "focus" (Ctrl+Shift+click)     → 🔥 gold flame — "look HERE, this matters".
//       "warn"  (Ctrl+Alt+Shift+click) → 🚨 red siren  — "this is BAD / a trap".
//     Setting a new super replaces the previous one.
// A key lives in at most one layer. Pure reducers so the behaviour is testable.
export type SuperTone = "focus" | "warn";
export interface SpotSets {
  regular: Set<string>;
  superKey: string | null;
  /** Tone of the current super. Absent ⇒ "focus" (back-compat for old callers). */
  superTone?: SuperTone;
}
export const spotKey = (cardId: string, targetId: string) => `${cardId}::${targetId}`;

/** Ctrl+click a target. On a SUPER target → downgrade it to regular. On a regular
 *  target → toggle it off. Otherwise → add a regular pill. */
export function applyRegularClick(s: SpotSets, k: string): SpotSets {
  const regular = new Set(s.regular);
  if (s.superKey === k) { regular.add(k); return { regular, superKey: null }; }
  if (regular.has(k)) regular.delete(k); else regular.add(k);
  return { regular, superKey: s.superKey, superTone: s.superTone };
}

/** Ctrl+Shift+click (tone "focus") / Ctrl+Alt+Shift+click (tone "warn"). Clicking
 *  the SAME target with the SAME tone toggles it off; the same target with a NEW
 *  tone switches tone (focus↔warn); any other target becomes the ONE super and
 *  is dropped from regular. */
export function applySuperClick(s: SpotSets, k: string, tone: SuperTone = "focus"): SpotSets {
  const cur = s.superTone ?? "focus";
  if (s.superKey === k && cur === tone) return { regular: s.regular, superKey: null };
  const regular = new Set(s.regular);
  regular.delete(k);
  return { regular, superKey: k, superTone: tone };
}
