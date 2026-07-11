// Scene serialization hygiene. Nodes carry TRANSIENT interaction state that must
// never round-trip through a saved scene:
//   - selected: a scene saved with 2+ cards selected reloads multi-selected, and
//     React Flow drags every selected node as a group — "two JE cards spawned
//     together move as a group" (the S2.0 bug).
//   - dragging: mid-gesture flag.
//   - _arrowPending: half-finished arrow gesture.
// sanitizeSceneNodes strips all three; it runs on SAVE and on LOAD (so scenes
// saved before this fix heal on their next load).

export function sanitizeSceneNodes<T extends { data?: Record<string, unknown>; selected?: boolean; dragging?: boolean }>(
  nodes: T[],
): T[] {
  return nodes.map((n) => {
    const { _arrowPending, ...data } = (n.data ?? {}) as Record<string, unknown>;
    void _arrowPending;
    const { selected, dragging, ...rest } = n;
    void selected;
    void dragging;
    return { ...rest, data } as T;
  });
}
