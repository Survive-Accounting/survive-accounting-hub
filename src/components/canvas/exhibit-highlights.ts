// EXHIBIT HIGHLIGHTS (A3) — the SHARED emphasis system for exhibit cards
// (accounting cycle today; T-account / journal-entry / trial-balance cards
// next). Replaces the per-step spotlight/superspotlight on the cycle card,
// whose pop-to-centre transform resized/zoomed the card mid-take.
//
// The model: an exhibit card declares its NODES (and, implicitly, which are
// adjacent); this layer owns all behavior —
//   · click a node in film mode → toggle its glow
//   · any number of nodes can glow at once (lighting a RUN like "Unadjusted TB
//     → Adjusting Entries → Adjusted TB" is the whole teaching tool)
//   · edgeLit(a, b): both endpoints lit ⇒ the connector between them glows
//     too, so a lit sequence reads as a flowing path
//   · ` clears every highlight (wired into the film/recording key handlers,
//     already behind their typing guards)
// A new card gets all of this by calling useExhibitHighlights() and styling
// from EXHIBIT_GLOW — zero new behavior code.
//
// GLOW IS PURELY VISUAL: box-shadow / border / filter / opacity only. Nothing
// in here may ever change an element's size or position — that's the incident
// this system replaces (and film-lock.ts A1 enforces the same law for drags).
import { useCallback, useEffect, useMemo, useState } from "react";

/** Pure toggle — exported for tests. Returns a NEW set; never mutates. */
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
/** Clear every highlight on every mounted exhibit card (the ` key). */
export function clearExhibitHighlights(): void {
  clearListeners.forEach((fn) => fn());
}

export interface ExhibitHighlights {
  /** The lit node ids (this card instance). */
  lit: ReadonlySet<string>;
  any: boolean;
  isLit: (nodeId: string) => boolean;
  /** Both endpoints lit ⇒ light the connector between them. */
  edgeLit: (a: string, b: string) => boolean;
  toggle: (nodeId: string) => void;
  clear: () => void;
}

export function useExhibitHighlights(): ExhibitHighlights {
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set());
  const clear = useCallback(() => setLit((p) => (p.size ? new Set() : p)), []);
  useEffect(() => {
    clearListeners.add(clear);
    return () => { clearListeners.delete(clear); };
  }, [clear]);
  const toggle = useCallback((nodeId: string) => setLit((p) => toggleLit(p, nodeId)), []);
  return useMemo(() => ({
    lit,
    any: lit.size > 0,
    isLit: (nodeId: string) => lit.has(nodeId),
    edgeLit: (a: string, b: string) => lit.has(a) && lit.has(b),
    toggle,
    clear,
  }), [lit, toggle, clear]);
}

/** The one glow look — brand orange, bolt-style. Shadow/border/filter/opacity
 *  ONLY (see the law above): no transform, no scale, no width/height. */
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
} as const;
