// SNIPPET PAYLOAD (pure) — build/spawn a personal clip-bin snippet (PROMPT 2).
// A snippet is a portable cluster of canvas cards + their RELATIVE layout +
// internal state. Building normalizes the selection to its own top-left and
// drops parentId (so it can be re-homed anywhere); spawning assigns fresh node
// ids (reusing the Prompt 1 cloneNodeSet), re-parents into the drop target, and
// offsets to the drop point. Reuses the deep-copy machinery so bindings carry
// over and deck membership never does.
import { cloneNodeSet, type CloneEdge, type CloneNode } from "./duplicate-frame";

/** DnD payload key: dragging a snippet row from the palette onto the canvas. */
export const SNIPPET_DND_MIME = "application/x-sa-snippet";

/** Versioned so a future shape change can migrate old rows. */
export interface SnippetPayload {
  v: 1;
  nodes: CloneNode[];
  edges: CloneEdge[];
}

const DECK_FIELDS = ["deckId", "deckMember", "tucked", "stageOrder", "slotIndex", "deckLessonId", "deckPos", "deckCategory", "minimized", "staged", "faceDown"] as const;

/** Strip transient (_-prefixed) keys + deck membership from a data payload. */
function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith("_")) out[k] = v;
  for (const f of DECK_FIELDS) delete out[f];
  return out;
}

/** Build a portable snippet from selected nodes whose `position` is ABSOLUTE
 *  (the caller flattens parent offsets first). Normalizes to the cluster's
 *  top-left, drops parentId, deep-clones + cleans data, and keeps only the edges
 *  wholly inside the selection. Never mutates the inputs. */
export function buildSnippetPayload(nodes: CloneNode[], edges: CloneEdge[]): SnippetPayload {
  if (nodes.length === 0) return { v: 1, nodes: [], edges: [] };
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const ids = new Set(nodes.map((n) => n.id));
  const outNodes: CloneNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position.x - minX, y: n.position.y - minY }, // cluster-local
    ...(n.width != null ? { width: n.width } : {}),
    ...(n.height != null ? { height: n.height } : {}),
    data: cleanData(structuredClone(n.data)),
    // NOTE: parentId intentionally omitted — the snippet is re-parented on spawn.
  }));
  const outEdges: CloneEdge[] = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => { const c = structuredClone(e); delete (c as { selected?: unknown }).selected; return c; });
  return { v: 1, nodes: outNodes, edges: outEdges };
}

/** Spawn a snippet: fresh node ids (cloneNodeSet, deck stripped, bindings kept),
 *  offset the cluster to `at` (in the target parent's local coords), and parent
 *  every node to `parentId` (undefined = loose on the canvas). `mkId(kind)` mints
 *  a new id. `zFor(node)` optionally stamps a z-index so the cluster lands on top. */
export function spawnSnippet(
  payload: SnippetPayload,
  mkId: (kind: string) => string,
  at: { x: number; y: number },
  parentId?: string,
  zFor?: (n: CloneNode) => number | undefined,
): { nodes: CloneNode[]; edges: CloneEdge[] } {
  const { nodes, edges } = cloneNodeSet(payload.nodes ?? [], payload.edges ?? [], mkId, { stripDeck: true });
  const placed = nodes.map((n) => {
    const z = zFor?.(n);
    return {
      ...n,
      position: { x: n.position.x + at.x, y: n.position.y + at.y },
      ...(parentId ? { parentId } : {}),
      ...(z != null ? { zIndex: z } : {}),
    } as CloneNode;
  });
  return { nodes: placed, edges };
}
