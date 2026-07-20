// Arrow (edge) logic — pure helpers + bus command factories. PROMPT A.
//
// THE UNDO BUG, root-caused: in UNCONTROLLED mode (defaultEdges set), React
// Flow's handle code runs `setEdges(addEdge(params, edges))` itself BEFORE
// invoking our onConnect (xyflow onConnectExtended, confirmed in source). So
// by the time onConnect ran, an auto-added plain edge (id "xy-edge__…", no
// style/marker/type) was already in the store — the old duplicate-guard saw
// it, returned early, and the bus never recorded anything. Three symptoms,
// one cause: Ctrl+Z ignored arrows, edges had no arrowheads, and live edges
// were bezier (the styled smoothstep only appeared after a reload re-stamp).
//
// resolveConnection() is the fix: it identifies RF's auto edge(s) for the
// connection (to be removed raw — they were never a user action) and returns
// the styled replacement to dispatch through the bus, or null when a
// bus-created identical edge already exists (the genuine double-invoke case).
import type { Command, RfLike } from "./commands";
import { isPlainHandle } from "./floating-anchor";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";

export interface EdgeLike {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  style?: unknown;
  markerEnd?: unknown;
  [k: string]: unknown;
}

export interface ConnectionLike {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const sameEnds = (e: EdgeLike, c: ConnectionLike) =>
  e.source === c.source &&
  e.target === c.target &&
  (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
  (e.targetHandle ?? null) === (c.targetHandle ?? null);

/** RF's uncontrolled-mode auto edges — never user-authored, always replaced. */
export const isAutoEdge = (e: EdgeLike) => e.id.startsWith("xy-edge__");

export function resolveConnection(
  existing: EdgeLike[],
  c: ConnectionLike,
  mkId: () => string,
): { autoIds: string[]; edge: EdgeLike | null } {
  if (!c.source || !c.target || c.source === c.target) {
    // even an invalid connect may have auto-added — clean those up too
    return { autoIds: existing.filter((e) => isAutoEdge(e) && sameEnds(e, c)).map((e) => e.id), edge: null };
  }
  const autoIds = existing.filter((e) => isAutoEdge(e) && sameEnds(e, c)).map((e) => e.id);
  // a BUS-created identical edge (ours) already there → double invoke, skip
  if (existing.some((e) => !isAutoEdge(e) && sameEnds(e, c))) return { autoIds, edge: null };
  // FLOATING ANCHOR (Lee): a plain card→card arrow (both ends on a t/b/l/r dot
  // or no handle) floats to the border point facing the other node — attaches
  // "at any point on the border of any element". Semantic arrows (ln:/mn:/anc:
  // handles) stay pinned to their exact handle and are never floated.
  const floating = isPlainHandle(c.sourceHandle) && isPlainHandle(c.targetHandle);
  return {
    autoIds,
    edge: {
      id: mkId(),
      source: c.source,
      target: c.target,
      sourceHandle: c.sourceHandle ?? "r",
      targetHandle: c.targetHandle ?? "l",
      type: "smoothstep",
      ...(floating ? { data: { floating: true } } : {}),
      // ABOVE THE CARDS (JT3): a connection has to be visible ACROSS card bodies.
      // Selected nodes elevate to zIndex 1000 (RF default), so edges ride above
      // even a selected card.
      zIndex: EDGE_Z,
      style: { ...EDGE_STYLE },
      markerEnd: { ...EDGE_MARKER },
    },
  };
}

/** Add one edge as an undoable step. */
export function addEdgeCmd(rf: RfLike, edge: EdgeLike, label = "connect"): Command {
  const snap = structuredClone(edge);
  return {
    label,
    do: () => rf.setEdges((eds) => [...eds.filter((e) => e.id !== snap.id), structuredClone(snap)]),
    undo: () => rf.setEdges((eds) => eds.filter((e) => e.id !== snap.id)),
  };
}

/** Remove one edge as an undoable step (undo restores it exactly). */
export function removeEdgeCmd(rf: RfLike, id: string, label = "delete arrow"): Command | null {
  const edge = rf.getEdges().find((e: EdgeLike) => e.id === id);
  if (!edge) return null;
  const snap = structuredClone(edge);
  return {
    label,
    do: () => rf.setEdges((eds) => eds.filter((e) => e.id !== id)),
    undo: () => rf.setEdges((eds) => [...eds, structuredClone(snap)]),
  };
}

// ---- line-level anchoring (PROMPT A item 3) ---------------------------------
// JE blocks expose per-line handles "ln:<lineId>:l|r" alongside the card-level
// t/b/l/r dots. Edges anchored to a line survive hops/reorders because the
// handle travels with its block (the id is the LINE id, not a position).

export const lineHandleId = (lineId: string, side: "l" | "r") => `ln:${lineId}:${side}`;

/** The line id inside a handle id, or null for card-level handles. */
export function lineIdOfHandle(handle: string | null | undefined): string | null {
  if (!handle || !handle.startsWith("ln:")) return null;
  const parts = handle.split(":");
  return parts.length === 3 ? parts[1] : null;
}

// ---- memo anchoring (J3) ----------------------------------------------------
// A memo box exposes ONE source dot "mn:<lineId>:<kind>". Dragging from it makes
// an ordinary arrow (persist/undo/× all free) to any block or card — the memo's
// own-block pointer stays the in-card leader (the guaranteed default, J2). A
// same-card drop is intercepted upstream to re-target that leader instead.

export const memoHandleId = (lineId: string, kind: "text" | "calc") => `mn:${lineId}:${kind}`;

/** Decode a memo handle → { lineId, kind }, or null for non-memo handles. */
export function memoOfHandle(handle: string | null | undefined): { lineId: string; kind: "text" | "calc" } | null {
  if (!handle || !handle.startsWith("mn:")) return null;
  const parts = handle.split(":");
  return parts.length === 3 && (parts[2] === "text" || parts[2] === "calc") ? { lineId: parts[1], kind: parts[2] } : null;
}
