// SPOTLIGHT provider + hooks — the transient performance-cursor layer. Lives
// inside the ReactFlowProvider (needs rf to read a card's targets + its frame).
// State is React-only: NEVER written to node data / scenes. Cards read their
// spotlight state through useSpotTarget (per target) + useCardDim (whole card).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { applyRegularClick, applySuperClick, spotKey, type SpotSets, type SpotState } from "./spotlight";

/** The target the camera should push toward — the most recent emphasis, super
 *  taking precedence over the regular pills. Null when nothing is emphasized. */
export interface FocusTarget { cardId: string; targetId: string; tier: "regular" | "super" }

export type FocusDimMode = "auto" | "on" | "off"; // auto = ON in film, OFF outside
export type SpotTargetState = "spot" | "range" | "dim" | null;

interface SpotlightApi {
  spot: SpotState | null;
  active: boolean;
  followReveals: boolean;
  /** Ctrl+click a target → begin (or restart) here. */
  start: (cardId: string, targetId: string) => void;
  /** Arrow movement while active. dir ±1; range = shift-extend; jump = ctrl edge. */
  move: (dir: -1 | 1, opts?: { range?: boolean; jump?: boolean }) => void;
  /** ↓ immediately after an ↑-exit re-enters the last card; else false (caller falls through). */
  tryReenter: (dir: -1 | 1) => boolean;
  exit: () => void;
  /** F2 — open inline edit on the spotlit target (authoring only; caller gates film). */
  editSpot: () => void;
  /** Follow-reveals: jump the spotlight onto a just-revealed target. */
  onReveal: (cardId: string, targetId: string) => void;
  /** The currently spotlit target id (single-focus) — powers the film trap-flip. */
  focusTargetId: () => string | null;
  targetState: (cardId: string, targetId: string) => SpotTargetState;
  cardDim: (cardId: string) => boolean;
  /** DOUBLE-EMPHASIS (🔥) — a fixed, elective "on fire" mark: Ctrl+Shift+click a
   *  target to toggle it. Independent of the movable spotlight (can stack on it),
   *  never persisted. Multiple targets can burn at once. */
  toggleFlame: (cardId: string, targetId: string) => void;
  isFlamed: (cardId: string, targetId: string) => boolean;
  /** True when this card owns ANY lit target (a regular pill or the super flame).
   *  Cards read it to UNCLIP their overflow so an enlarged spotlit/flamed row
   *  (scale 1.2 / 1.4) spills past the card edge and stays legible instead of
   *  being cut off — works the same in film. */
  cardHasEmphasis: (cardId: string) => boolean;
  /** CINEMATIC PUSH (Lee): the target the camera should dolly toward — the most
   *  recent emphasis (super wins over regular), or null when cleared. */
  focusTarget: FocusTarget | null;
}

export const SpotlightCtx = createContext<SpotlightApi | null>(null);
export const useSpotlight = () => useContext(SpotlightCtx);
export type { SpotlightApi };

/** The controller — CLICK-TOGGLE model (Lee's redesign). Regular spotlights are a
 *  MANY-set of gold pills; super is a SINGLE flame. No movable cursor / arrow-nav
 *  anymore (arrow keys belong to frame navigation). The old cursor methods stay on
 *  the API as inert no-ops so the keymap keeps type-checking; only `active` (any
 *  emphasis present) and `exit` (clear all) still do anything for the keymap. */
export function useSpotlightController(_opts?: { film?: boolean; focusDimMode?: FocusDimMode; followReveals?: boolean; onAction?: (cardId: string, targetId: string, tier: "regular" | "super") => void }): SpotlightApi {
  const [sets, setSets] = useState<SpotSets>(() => ({ regular: new Set(), superKey: null }));
  const setsRef = useRef(sets);
  setsRef.current = sets;
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  // CUE RECORDER (Lee): fire ONLY when a click turns emphasis ON, so the recorder
  // logs the spotlight/super but not a toggle-off. Kept in a ref → stable callbacks.
  const onActionRef = useRef(_opts?.onAction);
  onActionRef.current = _opts?.onAction;

  // Which target the camera should push toward, given the new sets + the target
  // that was just acted on. Super wins; else the acted key if it's now lit; else
  // the most recent remaining regular pill (Set preserves insertion order); else none.
  const focusFrom = useCallback((s: SpotSets, actedKey: string): FocusTarget | null => {
    const parse = (key: string, tier: "regular" | "super"): FocusTarget => { const i = key.indexOf("::"); return { cardId: key.slice(0, i), targetId: key.slice(i + 2), tier }; };
    if (s.superKey) return parse(s.superKey, "super");
    if (s.regular.has(actedKey)) return parse(actedKey, "regular");
    const arr = [...s.regular];
    return arr.length ? parse(arr[arr.length - 1], "regular") : null;
  }, []);

  // Ctrl+click → regular toggle (also downgrades a super to regular).
  const start = useCallback((cardId: string, targetId: string) => {
    const key = spotKey(cardId, targetId);
    const next = applyRegularClick(setsRef.current, key);
    setsRef.current = next; setSets(next);
    setFocus(focusFrom(next, key));
    if (next.regular.has(key)) onActionRef.current?.(cardId, targetId, "regular");
  }, [focusFrom]);
  // Ctrl+Shift+click → the ONE super (replaces the previous; re-click toggles off).
  const toggleFlame = useCallback((cardId: string, targetId: string) => {
    const key = spotKey(cardId, targetId);
    const next = applySuperClick(setsRef.current, key);
    setsRef.current = next; setSets(next);
    setFocus(focusFrom(next, key));
    if (next.superKey === key) onActionRef.current?.(cardId, targetId, "super");
  }, [focusFrom]);
  const isFlamed = useCallback((cardId: string, targetId: string) => sets.superKey === spotKey(cardId, targetId), [sets]);
  const cardHasEmphasis = useCallback((cardId: string): boolean => {
    const prefix = `${cardId}::`;
    if (sets.superKey && sets.superKey.startsWith(prefix)) return true;
    for (const k of sets.regular) if (k.startsWith(prefix)) return true;
    return false;
  }, [sets]);
  // Both regular AND super targets get the gold pill; super additionally burns
  // (data-flame → flame bar + 40% scale). Everything else = null.
  const targetState = useCallback((cardId: string, targetId: string): SpotTargetState => {
    const k = spotKey(cardId, targetId);
    return sets.regular.has(k) || sets.superKey === k ? "spot" : null;
  }, [sets]);
  const exit = useCallback(() => { const n = { regular: new Set<string>(), superKey: null }; setsRef.current = n; setSets(n); setFocus(null); }, []);

  const active = sets.regular.size > 0 || sets.superKey != null;
  const noop = useCallback(() => {}, []);
  const noReenter = useCallback(() => false, []);
  const noFocus = useCallback(() => null, []);
  const noDim = useCallback(() => false, []);

  return useMemo<SpotlightApi>(() => ({
    spot: null, active, followReveals: false,
    start, move: noop, tryReenter: noReenter, exit, editSpot: noop, onReveal: noop,
    focusTargetId: noFocus, targetState, cardDim: noDim, toggleFlame, isFlamed, cardHasEmphasis, focusTarget: focus,
  }), [active, start, noop, noReenter, exit, noFocus, targetState, noDim, toggleFlame, isFlamed, cardHasEmphasis, focus]);
}

/** WARM performance styling for a target. The spotlight now reads as a GOLD
 *  HIGHLIGHT PILL (the "you are here" bar) that MOVES with the focus — an amber
 *  wash + left gate bar + glow, not just a size bump. `dim` recedes. */
export function spotStyle(state: SpotTargetState): React.CSSProperties {
  const trans = "transform 150ms ease, opacity 150ms ease, filter 150ms ease, background 150ms ease, box-shadow 150ms ease";
  if (state === "spot")
    return {
      background: "rgba(252,163,17,0.22)",
      borderRadius: 8,
      boxShadow: "inset 3px 0 0 #FCA311, 0 0 18px rgba(252,163,17,0.5)",
      fontWeight: 700,
      // SPOTLIT → ~20% larger (Lee's call). Super-spotlight (🔥 flame, Ctrl+Shift+
      // click) goes to ~40% via FLAME_CSS with !important so it wins when a target
      // is both spotlit and flamed.
      transform: "scale(1.2)",
      transformOrigin: "left center",
      transition: trans,
      position: "relative",
      zIndex: 6,
    };
  if (state === "range")
    return {
      background: "rgba(252,163,17,0.14)",
      borderRadius: 8,
      boxShadow: "inset 3px 0 0 rgba(252,163,17,0.7)",
      fontWeight: 600,
      transition: trans,
      position: "relative",
      zIndex: 5,
    };
  if (state === "dim") return { opacity: 0.85, transition: trans };
  return { transition: trans };
}

/** Per-target styling + Ctrl-click starter WITHOUT calling a hook — pass the
 *  `sp` from a single top-level useSpotlight(), so it's safe inside a .map. */
export function spotTargetProps(sp: SpotlightApi | null, cardId: string, targetId: string) {
  const state = sp?.targetState(cardId, targetId) ?? null;
  const flamed = sp?.isFlamed(cardId, targetId) ?? false;
  return {
    state,
    flamed,
    props: {
      "data-spot-target": targetId,
      "data-flame": flamed ? "on" : undefined,
      onPointerDownCapture: (e: React.PointerEvent) => {
        // Ctrl+SHIFT+click → toggle the 🔥 double-emphasis (checked first, since
        // it's also a ctrl-click). Ctrl/Cmd+click alone → move the spotlight here.
        // stopImmediatePropagation on the NATIVE event so React Flow's own pointer
        // listeners (drag / selection box) never see the click.
        if (!sp) return;
        if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); sp.toggleFlame(cardId, targetId); return; }
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation();
          // TOGGLE (Lee's call): Ctrl+click a target that is already the single
          // spotlight → clear it; otherwise move the spotlight here.
          if (sp.targetState(cardId, targetId) === "spot") sp.exit(); else sp.start(cardId, targetId);
        }
      },
    },
  };
}

/** Hook form for a single-target element (e.g. a memo box). */
export function useSpotTarget(cardId: string, targetId: string) {
  const sp = useSpotlight();
  return spotTargetProps(sp, cardId, targetId);
}

/** Whole-card dim (a sibling card in the spotlit frame). Returns a style fragment. */
export function useCardDim(cardId: string): React.CSSProperties {
  const sp = useSpotlight();
  return sp?.cardDim(cardId) ? { opacity: 0.85, transition: "opacity 150ms ease" } : {};
}

/** Does this card own any lit target? Cards use it to UNCLIP overflow while an
 *  emphasis is on so the scaled spotlit/flamed row spills past the card edge and
 *  stays legible (identical in film). */
export function useCardEmphasis(cardId: string): boolean {
  const sp = useSpotlight();
  return sp?.cardHasEmphasis(cardId) ?? false;
}
