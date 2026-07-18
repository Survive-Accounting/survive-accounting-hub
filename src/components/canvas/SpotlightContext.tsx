// SPOTLIGHT provider + hooks — the transient performance-cursor layer. Lives
// inside the ReactFlowProvider (needs rf to read a card's targets + its frame).
// State is React-only: NEVER written to node data / scenes. Cards read their
// spotlight state through useSpotTarget (per target) + useCardDim (whole card).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";

import { moveSpot, spotlightTargetsOf, spotMembership, startSpot, type SpotState } from "./spotlight";

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
}

const flameKey = (cardId: string, targetId: string) => `${cardId}::${targetId}`;

export const SpotlightCtx = createContext<SpotlightApi | null>(null);
export const useSpotlight = () => useContext(SpotlightCtx);
export type { SpotlightApi };

/** The controller — call it inside the canvas component (which owns `film` +
 *  settings + the keymap), drive it from key handlers, and hand its result to
 *  <SpotlightCtx.Provider> so the card nodes can read it. */
export function useSpotlightController({ film, focusDimMode, followReveals }: {
  film: boolean;
  focusDimMode: FocusDimMode;
  followReveals: boolean;
}): SpotlightApi {
  const rf = useReactFlow();
  const [spot, setSpot] = useState<SpotState | null>(null);
  const [flames, setFlames] = useState<Set<string>>(() => new Set());
  const justExited = useRef(false);
  const lastCardId = useRef<string | null>(null);

  const toggleFlame = useCallback((cardId: string, targetId: string) => {
    setFlames((prev) => {
      const next = new Set(prev);
      const k = flameKey(cardId, targetId);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);
  const isFlamed = useCallback((cardId: string, targetId: string) => flames.has(flameKey(cardId, targetId)), [flames]);

  const focusDimOn = focusDimMode === "on" ? true : focusDimMode === "off" ? false : film;

  const targetsOf = useCallback((cardId: string) => spotlightTargetsOf(rf.getNode(cardId)?.data as never), [rf]);
  const frameOf = useCallback((id: string): string | null => {
    let n = rf.getNode(id);
    let g = 0;
    while (n?.parentId && g++ < 12) {
      const p = rf.getNode(n.parentId);
      if (p?.type === "frame") return p.id;
      n = p;
    }
    return null;
  }, [rf]);

  const start = useCallback((cardId: string, targetId: string) => {
    justExited.current = false;
    lastCardId.current = cardId;
    setSpot(startSpot(cardId, targetsOf(cardId), targetId));
  }, [targetsOf]);

  const exit = useCallback(() => {
    setSpot((s) => { if (s) { lastCardId.current = s.cardId; justExited.current = true; } return null; });
  }, []);

  const move = useCallback((dir: -1 | 1, opts?: { range?: boolean; jump?: boolean }) => {
    setSpot((s) => {
      if (!s) return s;
      const n = targetsOf(s.cardId).length;
      const next = moveSpot(s, n, dir, opts);
      if (next === "exit") { lastCardId.current = s.cardId; justExited.current = true; return null; }
      return next;
    });
  }, [targetsOf]);

  const tryReenter = useCallback((dir: -1 | 1) => {
    if (dir > 0 && justExited.current && lastCardId.current && rf.getNode(lastCardId.current)) {
      justExited.current = false;
      setSpot({ cardId: lastCardId.current, index: 0, anchor: null });
      return true;
    }
    justExited.current = false; // any other move clears the escape-hatch window
    return false;
  }, [rf]);

  const focusTargetId = useCallback(() => {
    if (!spot) return null;
    return targetsOf(spot.cardId)[spot.index] ?? null;
  }, [spot, targetsOf]);

  const onReveal = useCallback((cardId: string, targetId: string) => {
    if (!followReveals) return;
    justExited.current = false;
    lastCardId.current = cardId;
    setSpot(startSpot(cardId, targetsOf(cardId), targetId));
  }, [followReveals, targetsOf]);

  const editSpot = useCallback(() => {
    if (!spot) return;
    const cardId = spot.cardId;
    const targetId = targetsOf(cardId)[spot.index];
    rf.updateNodeData(cardId, { editMode: true });
    // focus the target's own editor once edit mode paints
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${cardId}"] [data-spot-target="${targetId}"] input, .react-flow__node[data-id="${cardId}"] [data-spot-target="${targetId}"] textarea, .react-flow__node[data-id="${cardId}"] [data-spot-target="${targetId}"] [contenteditable]`);
      el?.focus();
    }));
  }, [spot, targetsOf, rf]);

  const targetState = useCallback((cardId: string, targetId: string): SpotTargetState => {
    if (!spot || spot.cardId !== cardId) return null;
    const idx = targetsOf(cardId).indexOf(targetId);
    if (idx < 0) return null;
    const m = spotMembership(spot, idx);
    if (m === "single") return "spot";
    if (m === "range") return "range";
    return focusDimOn ? "dim" : null;
  }, [spot, targetsOf, focusDimOn]);

  const cardDim = useCallback((cardId: string) => {
    if (!spot || !focusDimOn || spot.cardId === cardId) return false;
    return frameOf(cardId) === frameOf(spot.cardId);
  }, [spot, focusDimOn, frameOf]);

  return useMemo<SpotlightApi>(() => ({
    spot, active: !!spot, followReveals, start, move, tryReenter, exit, editSpot, onReveal, focusTargetId, targetState, cardDim, toggleFlame, isFlamed,
  }), [spot, followReveals, start, move, tryReenter, exit, editSpot, onReveal, focusTargetId, targetState, cardDim, toggleFlame, isFlamed]);
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
      transform: "scale(1.03)",
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
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); sp.start(cardId, targetId); }
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
