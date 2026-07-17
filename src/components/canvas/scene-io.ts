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

/** schema_version 4 → 5: FRAME GRID. Flat frames (beat tag + `order` index) become
 *  grid cells (beat COLUMN + subIndex ROW). Group each lesson's frames by beat
 *  ("none" → hook), order within a beat by the old `order`, assign subIndex 0..n.
 *  Idempotent: a scene where every frame already has a numeric subIndex is left
 *  untouched, so v5 scenes re-open cleanly. */
export function migrateFrameGrid<T extends { type?: string; parentId?: string; data?: Record<string, unknown> }>(nodes: T[]): T[] {
  const frames = nodes.filter((n) => n.type === "frame");
  if (frames.length === 0 || frames.every((f) => typeof (f.data as { subIndex?: number } | undefined)?.subIndex === "number")) return nodes;
  const BEATS = ["hook", "teach", "model_practice", "check"];
  const beatOf = (f: T) => { const b = (f.data as { beat?: string } | undefined)?.beat; return b && BEATS.includes(b) ? b : "hook"; };
  const orderOf = (f: T) => { const o = (f.data as { order?: number } | undefined)?.order; return typeof o === "number" ? o : Number.POSITIVE_INFINITY; };
  const cols = new Map<string, T[]>();
  for (const f of frames) { const k = `${f.parentId}::${beatOf(f)}`; (cols.get(k) ?? cols.set(k, []).get(k)!).push(f); }
  const sub = new Map<T, number>();
  for (const [, list] of cols) { list.sort((a, b) => orderOf(a) - orderOf(b)); list.forEach((f, i) => sub.set(f, i)); }
  return nodes.map((n) => (sub.has(n) ? { ...n, data: { ...n.data, beat: beatOf(n), subIndex: sub.get(n) } } : n));
}

/** FRAMES SHIP LOCKED (item 2): migrate existing scenes so every frame whose
 *  posLock is unset becomes locked on load (they kept getting dragged). A frame
 *  the author explicitly unlocked keeps posLock:false and is left alone. */
export function migrateFrameLocks<T extends { type?: string; data?: Record<string, unknown> }>(nodes: T[]): T[] {
  let changed = false;
  const out = nodes.map((n) => {
    if (n.type !== "frame" || (n.data as { posLock?: boolean } | undefined)?.posLock !== undefined) return n;
    changed = true;
    return { ...n, data: { ...n.data, posLock: true } };
  });
  return changed ? out : nodes;
}

/** LEGEND V2: pre-V2 cards stored `facts: string[]`; V2 renders ordered STORY
 *  SLIPS. Convert each fact → a slip (visible, i.e. hidden:false) on load so old
 *  Pacioli/company cards keep their text and gain the space-walk reveal. Runs
 *  only when `slips` is absent (idempotent). */
let _slipSeq = 0;
export function migrateLegendSlips<T extends { data?: Record<string, unknown> }>(nodes: T[]): T[] {
  let changed = false;
  const out = nodes.map((n) => {
    const d = n.data as (Record<string, unknown> & { kind?: string; slips?: unknown; facts?: unknown }) | undefined;
    if (!d || d.kind !== "legend" || Array.isArray(d.slips)) return n;
    changed = true;
    const facts = Array.isArray(d.facts) ? (d.facts as unknown[]).map(String) : [];
    const src = facts.length ? facts : [""];
    const slips = src.map((text) => ({ id: `slip-${Date.now().toString(36)}-${_slipSeq++}`, text, hidden: false }));
    return { ...n, data: { ...d, slips } };
  });
  return changed ? out : nodes;
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
