// Scene serialization hygiene. Nodes carry TRANSIENT interaction state that must
// never round-trip through a saved scene:
//   - selected: a scene saved with 2+ cards selected reloads multi-selected, and
//     React Flow drags every selected node as a group — "two JE cards spawned
//     together move as a group" (the S2.0 bug).
//   - dragging: mid-gesture flag.
//   - data keys starting with "_" (_arrowPending, _selLine, …): transient
//     gesture state cards stash in node data.
// sanitizeSceneNodes strips all of it; it runs on SAVE and on LOAD (so scenes
// saved before this fix heal on their next load).

export function sanitizeSceneNodes<T extends { data?: Record<string, unknown>; selected?: boolean; dragging?: boolean }>(
  nodes: T[],
): T[] {
  return nodes.map((n) => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((n.data ?? {}) as Record<string, unknown>)) {
      if (!k.startsWith("_")) data[k] = v;
    }
    const { selected, dragging, ...rest } = n;
    void selected;
    void dragging;
    return { ...rest, data } as T;
  });
}

/** V2 connections: every edge rides named handles (t/b/l/r) + smoothstep.
 *  Old scenes' edges (Ctrl+click era) had NO handle ids — with 4 named source
 *  handles per node they'd fail to resolve, so stamp the old visual (right →
 *  left) and the new edge type on load. No-op for already-migrated edges. */
export function migrateEdges<T extends { sourceHandle?: string | null; targetHandle?: string | null; type?: string }>(edges: T[]): T[] {
  return edges.map((e) => ({
    ...e,
    sourceHandle: e.sourceHandle ?? "r",
    targetHandle: e.targetHandle ?? "l",
    type: e.type ?? "smoothstep",
  }));
}

/** schema_version 1 → 2: `staged`/`minimized` both meant "in the deck, hidden".
 *  The v2 model splits MEMBERSHIP (deckMember) from PRESENCE (tucked). Runs on
 *  every load — a no-op for v2 scenes, so old and new both open fine. */
export function migrateDeckFields<T extends { data?: Record<string, unknown> }>(nodes: T[]): T[] {
  return nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (!d.staged && !d.minimized) return n;
    const { staged, minimized, ...rest } = d;
    void staged;
    void minimized;
    return { ...n, data: { ...rest, deckMember: true, tucked: true } } as T;
  });
}

/** ELEMENTS never live in the deck (design-elements run). Old scenes may have a
 *  heading with deck membership from the pre-category era — strip it silently
 *  (revealing any tucked element back onto the canvas) and note it in console. */
export function migrateElementDeckFields<T extends { data?: Record<string, unknown> }>(
  nodes: T[],
  isElement: (kind: string | undefined) => boolean,
): T[] {
  let stripped = 0;
  const out = nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (!isElement(d.kind as string | undefined)) return n;
    if (!d.deckMember && !d.tucked && !d.faceDown) return n;
    stripped++;
    const { deckMember, tucked, stageOrder, deckPos, deckCategory, faceDown, ...rest } = d;
    void deckMember; void tucked; void stageOrder; void deckPos; void deckCategory; void faceDown;
    return { ...n, data: rest } as T;
  });
  if (stripped > 0) console.info(`[canvas] ${stripped} element(s) had deck membership from an old scene — membership dropped (elements never deck).`);
  return out;
}
