// SET FILES (Frames Rename, overnight 2026-08-13) — the pure heart of "a SET is the
// openable working unit". One canvas_scenes row per set:
//
//   nodes_json = { setFile: true, schema_version: 5, decks: [theDeck],
//                  nodes: [member cards + chain-referenced memos], edges: [internal] }
//
// plus one WORKSPACE row ({ workspace: true }) holding the cross-set residue: scene
// settings, global clips, CEQ set factories, and memo nodes no set references (the
// memo library's unattached inventory) — so nothing is orphaned by per-set saves.
//
// The old multi-set scene stays behind as a RENAMED ARCHIVE row ({ archived: true }),
// bytes untouched — the rollback path and the "Open canvas view — experimental" target.
//
// Everything here is pure (no DB, no React) so the split/extract/merge laws are unit-
// testable; set-files.functions.ts is the thin server wrapper.

export interface SetNodeLike {
  id: string;
  type?: string;
  parentId?: string;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

export interface SetDeckLike {
  id: string;
  name: string;
  payloadType?: string;
  [k: string]: unknown;
}

export interface SetEdgeLike {
  id?: string;
  source: string;
  target: string;
  [k: string]: unknown;
}

export interface SceneJsonLike {
  schema_version?: number;
  setFile?: boolean;
  archived?: boolean;
  workspace?: boolean;
  nodes?: SetNodeLike[];
  edges?: SetEdgeLike[];
  decks?: SetDeckLike[];
  ceqSets?: unknown[];
  sceneSettings?: Record<string, unknown>;
}

export interface SetFileJson {
  setFile: true;
  schema_version: number;
  decks: [SetDeckLike];
  nodes: SetNodeLike[];
  edges: SetEdgeLike[];
}

const dataOf = (n: SetNodeLike): Record<string, unknown> => (n.data && typeof n.data === "object" ? (n.data as Record<string, unknown>) : {});

/** Every memo node id referenced by a card's choice chains (CeqChainItem.memoNodeId). */
export function chainMemoIds(card: SetNodeLike): Set<string> {
  const out = new Set<string>();
  const choices = dataOf(card).choices;
  if (!Array.isArray(choices)) return out;
  for (const c of choices) {
    const chain = (c as { chain?: { memoNodeId?: string }[] })?.chain;
    if (!Array.isArray(chain)) continue;
    for (const item of chain) if (item?.memoNodeId) out.add(item.memoNodeId);
  }
  return out;
}

/** A deck's member cards: ceq nodes whose data.deckId names it (the one membership
 *  law — same rule the Studio, outline, and exam1 seed all use). */
export function memberCards(deckId: string, nodes: SetNodeLike[]): SetNodeLike[] {
  return nodes.filter((n) => n.type === "ceq" && dataOf(n).deckId === deckId);
}

/** Extract ONE set's file JSON from a pooled document. Ids are copied verbatim —
 *  clip stacks (data.takes), stitch manifests (ceqId-keyed), and chains keep
 *  resolving. parentId is stripped (old-canvas frame membership; deckPos governs
 *  the Studio). Used by the split AND by every per-set save. */
export function extractSetJson(deck: SetDeckLike, nodes: SetNodeLike[], edges: SetEdgeLike[], schemaVersion = 5): SetFileJson {
  const cards = memberCards(deck.id, nodes);
  const wanted = new Set(cards.map((c) => c.id));
  const memoIds = new Set<string>();
  for (const c of cards) for (const id of chainMemoIds(c)) memoIds.add(id);
  const memos = nodes.filter((n) => memoIds.has(n.id));
  for (const m of memos) wanted.add(m.id);
  const own = [
    ...cards.map(({ parentId, ...rest }) => {
      void parentId;
      const d = dataOf(rest);
      const deckPos = d.deckPos as { x: number; y: number } | undefined;
      return { ...rest, position: deckPos ?? rest.position ?? { x: 0, y: 0 } };
    }),
    ...memos.map(({ parentId, ...rest }) => { void parentId; return rest; }),
  ];
  const internal = (edges ?? []).filter((e) => wanted.has(e.source) && wanted.has(e.target));
  return { setFile: true, schema_version: schemaVersion, decks: [deck], nodes: own, edges: internal };
}

export interface SplitPlan {
  setFiles: { name: string; json: SetFileJson }[];
  /** The legacy scene, marked archived — bytes otherwise untouched. */
  archiveJson: SceneJsonLike;
  workspaceJson: SceneJsonLike;
  /** Counts for the report. */
  stats: { sets: number; cards: number; memosCopied: number; orphanCards: number };
}

/** Split a legacy multi-set scene into per-set files + archive + workspace.
 *  Nothing is deleted: the archive keeps 100% of the original nodes. */
export function splitLibraryScene(scene: SceneJsonLike): SplitPlan {
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];
  const decks = (scene.decks ?? []).filter((d) => (d.payloadType ?? "cards") === "cards");
  const setFiles = decks.map((deck) => ({ name: deck.name || "Set", json: extractSetJson(deck, nodes, edges, scene.schema_version ?? 5) }));
  const claimed = new Set(setFiles.flatMap((f) => f.json.nodes.map((n) => n.id)));
  const orphanCards = nodes.filter((n) => n.type === "ceq" && !claimed.has(n.id)).length;
  const memosCopied = setFiles.reduce((a, f) => a + f.json.nodes.filter((n) => n.type === "memo").length, 0);
  // workspace: settings + factories + UNREFERENCED memo nodes (the library inventory)
  const looseMemos = nodes.filter((n) => n.type === "memo" && !claimed.has(n.id));
  const workspaceJson: SceneJsonLike = {
    workspace: true,
    schema_version: scene.schema_version ?? 5,
    nodes: looseMemos,
    edges: [],
    decks: [],
    ceqSets: scene.ceqSets ?? [],
    sceneSettings: scene.sceneSettings ?? {},
  };
  const archiveJson: SceneJsonLike = { ...scene, archived: true };
  return {
    setFiles,
    archiveJson,
    workspaceJson,
    stats: { sets: setFiles.length, cards: setFiles.reduce((a, f) => a + f.json.nodes.filter((n) => n.type === "ceq").length, 0), memosCopied, orphanCards },
  };
}

export interface PoolDoc {
  nodes: SetNodeLike[];
  edges: SetEdgeLike[];
  decks: SetDeckLike[];
  ceqSets: unknown[];
  sceneSettings: Record<string, unknown>;
}

/** Merge set files (+ the workspace row) into one in-memory document. Rows must be
 *  sorted OLDEST-updated first: node dedupe is last-write-wins, so the newest row's
 *  copy of a shared memo survives. */
export function mergePool(rows: { json: SceneJsonLike }[]): PoolDoc {
  const nodeById = new Map<string, SetNodeLike>();
  const edgeByKey = new Map<string, SetEdgeLike>();
  const decks: SetDeckLike[] = [];
  let ceqSets: unknown[] = [];
  let sceneSettings: Record<string, unknown> = {};
  for (const { json } of rows) {
    for (const n of json.nodes ?? []) nodeById.set(n.id, n);
    for (const e of json.edges ?? []) edgeByKey.set(e.id ?? `${e.source}→${e.target}`, e);
    for (const d of json.decks ?? []) if (!decks.some((x) => x.id === d.id)) decks.push(d);
    if (json.workspace) {
      if (Array.isArray(json.ceqSets)) ceqSets = json.ceqSets;
      if (json.sceneSettings) sceneSettings = json.sceneSettings;
    }
  }
  return { nodes: [...nodeById.values()], edges: [...edgeByKey.values()], decks, ceqSets, sceneSettings };
}

/** Cheap stable content hash for dirty-set detection (djb2 over the JSON). The pool
 *  saver extracts every set each autosave and only writes rows whose hash moved. */
export function setHash(json: SetFileJson | SceneJsonLike): string {
  const s = JSON.stringify(json);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}
