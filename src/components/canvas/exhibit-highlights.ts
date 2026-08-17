// EXHIBIT HIGHLIGHTS (A3) — the SHARED emphasis system for exhibit cards
// (accounting cycle today; T-account / journal-entry / trial-balance cards
// next). Replaces the per-step spotlight/superspotlight on the cycle card,
// whose pop-to-centre transform resized/zoomed the card mid-take.
//
// TEASE MODE (Lee, 08-17). A node now cycles through THREE states on click, in
// one fixed order, looping:
//
//     normal  →  lit (highlighted)  →  blurred  →  normal
//
// One click = one advance. No modifiers, no mode toggle, no context menu — the
// gesture has to be predictable mid-take, because Lee is on camera when he uses
// it. `blurred` is the teaser: the step is visibly THERE but its text is
// unreadable even if a viewer pauses and zooms, so a blast video can show two
// steps and withhold two.
//
// States are per node and independent; any mix across the nine steps is valid,
// and nothing here is persisted — a refresh returns everything to normal.
//
//   · edgeLit(a, b): both endpoints LIT ⇒ the connector between them glows too,
//     so a lit sequence reads as a flowing path. A blurred node never lights an
//     edge — it is being hidden, not taught.
//   · ` clears everything (wired into the film/recording key handlers, already
//     behind their typing guards) — unchanged.
//   · 0 resets every node to normal without touching anything else (see
//     CHANGES.md for the binding audit).
//
// GLOW IS PURELY VISUAL: box-shadow / border / filter / opacity. The one motion
// allowed is a slight scale on the NODE itself (Lee's spec) — that is a
// transform on an absolutely-positioned pill, so the CARD's box never changes.
// The incident this system replaced was a pop-to-centre that resized the whole
// card mid-take; that remains banned, and film-lock.ts enforces the same law
// for drags.
import { useCallback, useEffect, useMemo, useState } from "react";

/** Absence from the map = `normal`. Only the two non-default states are stored,
 *  so "reset" is simply an empty map. */
export type ExhibitNodeState = "lit" | "blurred";
export type ExhibitStates = ReadonlyMap<string, ExhibitNodeState>;

/** The cycle, as data — the order is the contract and tests pin it. */
export const STATE_CYCLE: readonly (ExhibitNodeState | undefined)[] = [undefined, "lit", "blurred"];

/** Pure advance: normal → lit → blurred → normal. Returns a NEW map; never
 *  mutates. Exported for tests. */
export function cycleState(states: ExhibitStates, nodeId: string): Map<string, ExhibitNodeState> {
  const next = new Map(states);
  const cur = states.get(nodeId);
  const at = STATE_CYCLE.indexOf(cur);
  const to = STATE_CYCLE[(at + 1) % STATE_CYCLE.length];
  if (to === undefined) next.delete(nodeId);
  else next.set(nodeId, to);
  return next;
}

/** LEGACY binary toggle, kept because the old tests and any card still calling
 *  it expect lit⇄normal. Tease mode uses cycleState. */
export function toggleLit(lit: ReadonlySet<string>, nodeId: string): Set<string> {
  const next = new Set(lit);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  return next;
}

// ---- the ` reset bus -----------------------------------------------------
// Card instances register their clear; the film/recording key handlers call
// clearExhibitHighlights() on `. Module-level (not context) so it reaches
// every mounted card — including the film popout, which shares this realm.
const clearListeners = new Set<() => void>();
/** Clear every highlight on every mounted exhibit card (the ` key, and 0). */
export function clearExhibitHighlights(): void {
  clearListeners.forEach((fn) => fn());
}

/** Register extra work for the ` reset (text highlights etc.) — same bus, same
 *  lifecycle: clearExhibitHighlights() fires every registered card's clear. */
export function useOnExhibitClear(fn: () => void): void {
  useEffect(() => { clearListeners.add(fn); return () => { clearListeners.delete(fn); }; }, [fn]);
}

export interface ExhibitHighlights {
  /** Per-node state. Absent ⇒ normal. */
  states: ExhibitStates;
  /** The lit node ids (derived — kept so existing callers keep working). */
  lit: ReadonlySet<string>;
  /** True while ANY node is LIT — drives the recede-everything-else dim.
   *  Blurring alone must NOT dim the rest: hiding one step is not the same as
   *  spotlighting another. */
  any: boolean;
  isLit: (nodeId: string) => boolean;
  isBlurred: (nodeId: string) => boolean;
  stateOf: (nodeId: string) => ExhibitNodeState | undefined;
  /** Both endpoints lit ⇒ light the connector between them. */
  edgeLit: (a: string, b: string) => boolean;
  /** One click = one advance through the cycle. */
  cycle: (nodeId: string) => void;
  /** Legacy alias — advances the same cycle. */
  toggle: (nodeId: string) => void;
  clear: () => void;
}

export function useExhibitHighlights(): ExhibitHighlights {
  const [states, setStates] = useState<ExhibitStates>(() => new Map());
  const clear = useCallback(() => setStates((p) => (p.size ? new Map() : p)), []);
  useEffect(() => {
    clearListeners.add(clear);
    return () => { clearListeners.delete(clear); };
  }, [clear]);
  const cycle = useCallback((nodeId: string) => setStates((p) => cycleState(p, nodeId)), []);
  return useMemo(() => {
    const lit = new Set<string>();
    for (const [id, s] of states) if (s === "lit") lit.add(id);
    return {
      states,
      lit,
      any: lit.size > 0,
      isLit: (nodeId: string) => states.get(nodeId) === "lit",
      isBlurred: (nodeId: string) => states.get(nodeId) === "blurred",
      stateOf: (nodeId: string) => states.get(nodeId),
      edgeLit: (a: string, b: string) => lit.has(a) && lit.has(b),
      cycle,
      toggle: cycle,
      clear,
    };
  }, [states, cycle, clear]);
}

/** The one glow look — brand orange, bolt-style. Shadow/border/filter/opacity,
 *  plus the single permitted node-level scale (see the law above). */
export const EXHIBIT_GLOW = {
  /** Lit node: border + layered orange bloom. */
  border: "#FCA311",
  shadow: "0 0 0 3px rgba(9,13,26,0.95), 0 0 22px rgba(252,163,17,0.9), 0 0 44px rgba(252,163,17,0.4)",
  /** Lit connector (SVG stroke + halo). */
  arcStroke: "#FCA311",
  arcFilter: "drop-shadow(0 0 6px rgba(252,163,17,0.85))",
  /** Everything unlit recedes to this opacity while ANY node is lit —
   *  contrast without moving a pixel. */
  dimOpacity: 0.45,
  /** Lit nodes grow just enough to read at thumbnail size, and no more. */
  litScale: 1.06,
  /** BLURRED. Deliberately heavy: the text must be unreadable to a viewer who
   *  pauses and zooms at 1080p, so the radius has to exceed the glyph x-height
   *  rather than merely soften it. Paired with a slight contrast drop so the
   *  letterforms don't reassemble when scaled up. */
  blurFilter: "blur(11px) contrast(0.72)",
  /** The blurred node's own chrome stays crisp and present — the viewer should
   *  see that something IS there and be curious. */
  blurredBorder: "rgba(252,163,17,0.5)",
  blurredOpacity: 0.9,
  /** Fast, no bounce. */
  transition: "180ms ease",
} as const;
