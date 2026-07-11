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
