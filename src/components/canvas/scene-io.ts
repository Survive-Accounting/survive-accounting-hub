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
