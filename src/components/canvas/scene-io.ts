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

/** Arrow visual contract (PROMPT A): every edge carries the brand stroke + a
 *  real directional arrowhead. Exported so onConnect and the migration stamp
 *  the SAME look — old scenes may hold React Flow auto-added edges (the
 *  uncontrolled-mode bug: RF added its own unstyled bezier before onConnect
 *  ever ran) with no style, no marker, no type. */
export const EDGE_STYLE = { stroke: "#E0284A", strokeWidth: 2.5 } as const;
export const EDGE_MARKER = { type: "arrowclosed", color: "#E0284A", width: 18, height: 18 } as const;
/** Edge z-order (JT3): arrows draw ABOVE card bodies. Selected nodes elevate to
 *  1000 (RF default), so this must clear that. */
export const EDGE_Z = 1001;

/** V2 connections: every edge rides named handles (t/b/l/r or line-level
 *  ln:<lineId>:l|r) + smoothstep + arrowhead. Old scenes' edges (Ctrl+click
 *  era) had NO handle ids — with named source handles per node they'd fail to
 *  resolve, so stamp the old visual (right → left). Auto-added RF edges (the
 *  uncontrolled-mode era) get style/marker stamped too. No-op when migrated. */
export function migrateEdges<
  T extends { sourceHandle?: string | null; targetHandle?: string | null; type?: string; style?: unknown; markerEnd?: unknown; zIndex?: number },
>(edges: T[]): T[] {
  return edges.map((e) => ({
    ...e,
    sourceHandle: e.sourceHandle ?? "r",
    targetHandle: e.targetHandle ?? "l",
    type: e.type ?? "smoothstep",
    style: e.style ?? { ...EDGE_STYLE },
    markerEnd: e.markerEnd ?? { ...EDGE_MARKER },
    zIndex: e.zIndex ?? EDGE_Z, // JT3: arrows above card bodies
  }));
}

/** PROMPT A memo schema: JeLine.label/memoPos/memoOpen (single text memo) →
 *  memos: [{kind:'text'|'calc', …}]. `label` stays ON the line (scenario-doc
 *  round-trip reads it) but pos/open move into the memo entry. No-op for
 *  migrated lines; non-JE nodes pass through untouched. */
export function migrateJeMemos<T extends { data?: Record<string, unknown> }>(nodes: T[]): T[] {
  return nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (d.kind !== "je") return n;
    const migrateLines = (lines: unknown): unknown => {
      if (!Array.isArray(lines)) return lines;
      return lines.map((l: Record<string, unknown>) => {
        if (l.memos || !l.label) return l;
        const { memoPos, memoOpen, ...rest } = l;
        return {
          ...rest,
          memos: [{ id: `${l.id}-m-text`, kind: "text", text: l.label, pos: memoPos, open: memoOpen }],
        };
      });
    };
    return { ...n, data: { ...d, lines: migrateLines(d.lines), ...(d.solution ? { solution: migrateLines(d.solution) } : {}) } } as T;
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
