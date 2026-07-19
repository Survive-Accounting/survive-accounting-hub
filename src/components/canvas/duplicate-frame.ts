// DUPLICATION CORE (pure) — the deep-copy engine behind "Duplicate frame" and
// "Duplicate lesson" (PROMPT 1, the swap-many foundation). Given a SET of nodes
// (a frame + its cards, or a whole lesson subtree) and the edges wholly inside
// that set, it returns fresh copies with brand-new NODE ids, an old→new id map,
// and the edges re-pointed to the copies. No React, no React Flow, no network —
// everything worth unit-testing lives here; the route turns the result into one
// undoable bus command.
//
// WHAT GETS A NEW ID, AND WHY NOT MORE. Only NODE ids are regenerated. Every
// INTERNAL element id (JE line ids, formula segment ids, list row ids, memo ids,
// legend slip ids) is preserved on purpose: React Flow handles encode those
// internal ids (`ln:<lineId>`, `mn:<lineId>`, `anc:<subId>`) and are scoped to a
// node, so a copied card keeps working with its handles untouched — and an edge's
// handle strings never need rewriting. What we DO remap are the references that
// point at a NODE: parentId (child→new frame, frame→new lesson), edge
// source/target, a frame script's @mark linkedCardId, and the deck-membership
// pointers (deckId via a deck-id map, deckLessonId via the node id map).
//
// NOTHING SHARED MUTATES. Every copied `data` is structuredCloned, so editing a
// copy's script/lines/rows can never reach back into the original.

/** The minimal node shape the copier needs (a slice of a React Flow node). */
export interface CloneNode {
  id: string;
  type?: string;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, unknown>;
}

/** The minimal edge shape (a slice of a React Flow edge). Handles are opaque
 *  strings carried verbatim — they reference preserved internal ids. */
export interface CloneEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [k: string]: unknown;
}

export interface CloneResult {
  nodes: CloneNode[];
  edges: CloneEdge[];
  /** old node id → new node id (the caller re-parents/positions the roots). */
  idMap: Map<string, string>;
}

export interface CloneOpts {
  /** Strip all deck-membership fields from every copy (FRAME dup: a duplicated
   *  card is never auto-added to a deck). */
  stripDeck?: boolean;
  /** Remap data.deckId through this map (LESSON dup: decks are copied too, so
   *  members follow their deck to the new deck id). */
  deckIdMap?: Map<string, string>;
}

/** Every field that expresses deck membership/presence (stripped on frame dup). */
export const DECK_MEMBER_FIELDS = [
  "deckId", "deckMember", "tucked", "stageOrder", "slotIndex",
  "deckLessonId", "deckPos", "deckCategory", "minimized", "staged",
] as const;

/** Remap the NODE-id references buried inside a copied node's `data`. Mutates the
 *  passed (already-cloned) object. */
function remapData(data: Record<string, unknown>, idMap: Map<string, string>, opts: CloneOpts): void {
  // FRAME SCRIPT @MARKS → point at the new card copies. A mark referencing a card
  // outside the copied set is unlinked (null) — the copy must never borrow the
  // original's card.
  const script = data.script as { marks?: Array<{ linkedCardId?: string | null }> } | undefined;
  if (script && Array.isArray(script.marks)) {
    for (const m of script.marks) {
      if (typeof m.linkedCardId === "string") m.linkedCardId = idMap.get(m.linkedCardId) ?? null;
    }
  }
  if (opts.stripDeck) {
    for (const f of DECK_MEMBER_FIELDS) delete data[f];
    return;
  }
  // LESSON dup: keep membership, but re-home the pointers.
  if (typeof data.deckLessonId === "string" && idMap.has(data.deckLessonId)) {
    data.deckLessonId = idMap.get(data.deckLessonId);
  }
  if (opts.deckIdMap && typeof data.deckId === "string" && opts.deckIdMap.has(data.deckId)) {
    data.deckId = opts.deckIdMap.get(data.deckId);
  }
}

/** Deep-copy `nodes` (+ the edges wholly inside the set) with fresh node ids.
 *  `mkId(kind)` mints a new id for a node of that kind (pass the app's cardId, or
 *  a deterministic counter in tests). Never mutates the inputs. */
export function cloneNodeSet(
  nodes: CloneNode[],
  edges: CloneEdge[],
  mkId: (kind: string) => string,
  opts: CloneOpts = {},
): CloneResult {
  // pass 1 — assign every node a fresh id so references can resolve forward.
  const idMap = new Map<string, string>();
  for (const n of nodes) idMap.set(n.id, mkId(n.type ?? "node"));

  // pass 2 — rebuild each node from its known fields (avoid cloning RF internals
  // like `measured`/`internals`), deep-cloning data and remapping references.
  const outNodes: CloneNode[] = nodes.map((n) => {
    const data = structuredClone(n.data);
    remapData(data, idMap, opts);
    const copy: CloneNode = {
      id: idMap.get(n.id)!,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data,
    };
    // parentId is remapped only when the parent is itself in the set; a ROOT's
    // parentId is left as-is for the caller to override at placement.
    if (n.parentId != null) copy.parentId = idMap.get(n.parentId) ?? n.parentId;
    if (n.width != null) copy.width = n.width;
    if (n.height != null) copy.height = n.height;
    return copy;
  });

  // edges — copy only those with BOTH endpoints in the set (cross-boundary arrows
  // are intentionally dropped: the copy simply doesn't grow them). Fresh id +
  // remapped endpoints; handle strings ride along unchanged (internal ids kept).
  const outEdges: CloneEdge[] = [];
  for (const e of edges) {
    const ns = idMap.get(e.source);
    const nt = idMap.get(e.target);
    if (!ns || !nt) continue;
    const copy = structuredClone(e);
    copy.id = e.id.startsWith("mre-") ? `mre-${mkId("e")}` : `dup-${mkId("e")}`;
    copy.source = ns;
    copy.target = nt;
    delete (copy as { selected?: unknown }).selected;
    outEdges.push(copy);
  }

  return { nodes: outNodes, edges: outEdges, idMap };
}

/** Container-first ordering (lesson → frame → card) so React Flow always sees a
 *  parent before its children when the copies are added in one batch. */
export function orderParentsFirst<T extends { type?: string }>(nodes: T[]): T[] {
  const rank = (t: string | undefined) => (t === "lesson" ? 0 : t === "frame" ? 1 : 2);
  return [...nodes].sort((a, b) => rank(a.type) - rank(b.type));
}
