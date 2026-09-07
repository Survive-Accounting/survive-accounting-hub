// THE MAP (a "cluster", internally) — the data behind an interactive teaching exhibit on the
// vertical film surface. Lee, 2026-09-07: "the 'cluster' idea is still my favorite direction.
// Where we can like see the entire cluster from birds eye view in the frame, but we can go swim
// around for it in the capture window… I want to be able to create these sorts of clusters with
// just brainstorming." Students will call it THE MAP ("View the map"); the code says cluster.
//
// A CLUSTER IS DATA, NOT A CANVAS. A playfield larger than the phone holds typed NODES (the
// equation with its arrows, the five account types, a journal entry, T-accounts, a trial balance
// — and a set card or a callout, so a map can carry the question it explains). EDGES are the
// posting arrows between them. SHOTS are the spacebar: each one is a camera position over the
// field plus what is revealed by then, so "progressive reveal" and "swim around" are the same
// mechanism, walked with space / shift+space inside one frame of the running order.
//
// The node kinds are the only vertical-specific part — accounting registers these; organic
// chemistry or finance register their own with a schema, a renderer and one paragraph the
// Teaching Assistant reads. Everything else here (field, camera, shots, reveal) is shared.
//
// Pure: types, the zod schema (the frame schema and the assistant's JSON both validate with it),
// and the camera / reveal helpers. No React, no network.
import { z } from "zod";

// ---------------------------------------------------------------- the phone and the field

/** The film surface — 1080 × 1920, the same V the stage uses (kept literal here so this module
 *  never imports the stage and stays pure). */
export const PHONE = { w: 1080, h: 1920 } as const;
/** A comfortable default playfield: two phones wide, two tall — room to swim without a map so
 *  large the bird's-eye view turns to dust. */
export const DEFAULT_FIELD = { w: 2160, h: 3840 } as const;

// ---------------------------------------------------------------- node kinds

export const CLUSTER_NODE_KINDS = ["equation", "accounts", "je", "taccount", "tb", "ceq", "callout", "note"] as const;
export type ClusterNodeKind = (typeof CLUSTER_NODE_KINDS)[number];

/** ↑ ↓ ↑↓ — (the Formula card's arrows lens; equation-derive's EqDir, spelled out here). */
export const EQ_DIRS = ["up", "down", "both", "none"] as const;
export type EqDir = (typeof EQ_DIRS)[number];
export const EQ_DIR_GLYPH: Record<EqDir, string> = { up: "↑", down: "↓", both: "↑↓", none: "—" };

const eqDir = z.enum(EQ_DIRS);

/** A = L + E with an arrow under each term, plus optional side terms (Rev ↑ → Equity ↑). */
const equationData = z.object({
  kind: z.literal("equation"),
  arrows: z.object({ assets: eqDir, liabilities: eqDir, equity: eqDir }),
  /** Side connections: "Rev" ↑, "Exp" ↓ — drawn beside the equation, linked to E. */
  extras: z.array(z.object({ label: z.string().max(24), dir: eqDir, links: z.enum(["assets", "liabilities", "equity"]).optional() })).max(4).optional(),
  /** A one-line caption under it ("Buy supplies on account"). */
  caption: z.string().max(160).optional(),
});

/** The five types of accounts (or any grouped list), revealed group by group or one by one. */
const accountsData = z.object({
  kind: z.literal("accounts"),
  groups: z.array(z.object({
    label: z.string().max(60),
    /** The account NAMES (the registry's labels), in the order to reveal them. */
    accounts: z.array(z.string().max(60)).max(24),
    note: z.string().max(160).optional(),
    /** Normal balance side, when the list is teaching that too. */
    normal: z.enum(["dr", "cr"]).optional(),
  })).min(1).max(8),
  revealBy: z.enum(["group", "account"]).default("group"),
});

/** A journal entry — the lab's JournalEntryExhibit shape (description, then each line's account,
 *  then its amount), revealed a piece at a time. */
const jeData = z.object({
  kind: z.literal("je"),
  description: z.string().max(200),
  lines: z.array(z.object({
    account: z.string().max(60),
    dr: z.number().nonnegative().optional(),
    cr: z.number().nonnegative().optional(),
    /** The rubric type chip (A / L / E / R / X) when the map is teaching types alongside. */
    type: z.enum(["A", "L", "E", "R", "X"]).optional(),
  })).min(1).max(8),
  /** The lab's scenario id when this entry came from the transaction bank (ledger-model). */
  scenarioId: z.string().max(80).optional(),
  badge: z.enum(["JE", "ADJ", "CL"]).optional(),
});

/** One T-account. `posts` may be given, or derived by the renderer from the je nodes that
 *  point at it with a "post" edge — `fromNodes` names those. */
const tAccountData = z.object({
  kind: z.literal("taccount"),
  account: z.string().max(60),
  /** Normal side — which side the balance sits on. */
  normal: z.enum(["dr", "cr"]),
  opening: z.number().optional(),
  posts: z.array(z.object({ label: z.string().max(60), amount: z.number().nonnegative(), dr: z.boolean() })).max(16).optional(),
  fromNodes: z.array(z.string().max(80)).max(8).optional(),
});

/** A trial balance — rows may be given or derived from the taccount nodes in `fromNodes`. */
const tbData = z.object({
  kind: z.literal("tb"),
  title: z.string().max(80).optional(),
  rows: z.array(z.object({ account: z.string().max(60), dr: z.number().nonnegative().optional(), cr: z.number().nonnegative().optional() })).max(24).optional(),
  fromNodes: z.array(z.string().max(80)).max(24).optional(),
});

/** A set card, by id — the question this map explains. */
const ceqData = z.object({ kind: z.literal("ceq"), ceqId: z.string().max(120) });

/** A callout, exactly the Editor's kinds. */
const calloutData = z.object({
  kind: z.literal("callout"),
  calloutKind: z.enum(["cheat", "phrase", "tip"]),
  title: z.string().max(120),
  text: z.string().max(400).optional(),
  bullets: z.array(z.string().max(200)).max(8).optional(),
});

/** A short note on the field — a label, an aside. */
const noteData = z.object({ kind: z.literal("note"), text: z.string().max(240) });

export const clusterNodeDataSchema = z.discriminatedUnion("kind", [equationData, accountsData, jeData, tAccountData, tbData, ceqData, calloutData, noteData]);
export type ClusterNodeData = z.infer<typeof clusterNodeDataSchema>;

export const clusterNodeSchema = z.object({
  id: z.string().min(1).max(80),
  /** Top-left on the field, and size, in field pixels (the phone is 1080 wide). */
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  title: z.string().max(120).optional(),
  data: clusterNodeDataSchema,
});
export type ClusterNode = z.infer<typeof clusterNodeSchema>;

export const CLUSTER_EDGE_KINDS = ["arrow", "post", "link"] as const;
export const clusterEdgeSchema = z.object({
  from: z.string().max(80), to: z.string().max(80),
  kind: z.enum(CLUSTER_EDGE_KINDS).default("arrow"),
  label: z.string().max(60).optional(),
});
export type ClusterEdge = z.infer<typeof clusterEdgeSchema>;

/** Where the 9:16 camera sits: its CENTRE on the field, and zoom (1 = one field pixel per phone
 *  pixel; 0.5 = the camera sees twice as much). */
export const cameraSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number().min(0.05).max(8) });
export type ClusterCamera = z.infer<typeof cameraSchema>;

/** One press of the spacebar. `reveal` lists what is VISIBLE by this shot: node ids, or
 *  "nodeId#k" to reveal the first k pieces of a node that reveals in steps (an entry's pieces,
 *  a list's groups). Cumulative in practice — defaultShots builds them that way. */
export const clusterShotSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().max(80).optional(),
  camera: cameraSchema,
  reveal: z.array(z.string().max(90)).max(64),
  /** What Lee means to say here — the prompter line for this shot. */
  note: z.string().max(300).optional(),
});
export type ClusterShot = z.infer<typeof clusterShotSchema>;

export const clusterSpecSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(80),
  title: z.string().max(120),
  field: z.object({ w: z.number().positive().max(20000), h: z.number().positive().max(20000) }),
  nodes: z.array(clusterNodeSchema).max(40),
  edges: z.array(clusterEdgeSchema).max(80).default([]),
  shots: z.array(clusterShotSchema).max(64),
});
export type ClusterSpec = z.infer<typeof clusterSpecSchema>;

// ---------------------------------------------------------------- helpers

export const newClusterId = (): string => `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function emptyCluster(title = "Untitled map"): ClusterSpec {
  return { version: 1, id: newClusterId(), title, field: { ...DEFAULT_FIELD }, nodes: [], edges: [], shots: [] };
}

/** How many pieces a node reveals in steps (for "nodeId#k"): an entry = description + account +
 *  amount per line (the lab's jePieces); a list = its groups (or every account); everything
 *  else is one piece. */
export function nodeSteps(node: ClusterNode): number {
  const d = node.data;
  if (d.kind === "je") return 1 + d.lines.length * 2;
  if (d.kind === "accounts") return d.revealBy === "account" ? d.groups.reduce((n, g) => n + g.accounts.length, 0) : d.groups.length;
  return 1;
}

/** The camera that frames one node in the phone with `pad` field-pixels of air, never zooming
 *  in past 1 (a small node stays small — it doesn't balloon to fill the screen). */
export function fitCamera(node: Pick<ClusterNode, "x" | "y" | "w" | "h">, pad = 120, phone = PHONE): ClusterCamera {
  const zoom = Math.min(1, phone.w / (node.w + pad * 2), phone.h / (node.h + pad * 2));
  return { x: node.x + node.w / 2, y: node.y + node.h / 2, zoom: round3(zoom) };
}

/** The camera that shows the whole field — the bird's-eye. */
export function overviewCamera(field: { w: number; h: number }, phone = PHONE): ClusterCamera {
  return { x: field.w / 2, y: field.h / 2, zoom: round3(Math.min(phone.w / field.w, phone.h / field.h)) };
}

/** The visible rectangle of the field for a camera, in field pixels. */
export function cameraRect(cam: ClusterCamera, phone = PHONE): { x: number; y: number; w: number; h: number } {
  const w = phone.w / cam.zoom, h = phone.h / cam.zoom;
  return { x: cam.x - w / 2, y: cam.y - h / 2, w, h };
}

/** One shot per node, in node order, each revealing everything before it plus this node whole,
 *  framed on the node. The assistant usually writes finer shots; this is the fallback and the
 *  "just show it" default when a map has none. */
export function defaultShots(spec: ClusterSpec): ClusterShot[] {
  const seen: string[] = [];
  return spec.nodes.map((n, i) => {
    seen.push(n.id);
    return { id: `shot-${i + 1}`, label: n.title ?? n.data.kind, camera: fitCamera(n), reveal: [...seen] };
  });
}

export const shotsOf = (spec: ClusterSpec): ClusterShot[] => (spec.shots.length ? spec.shots : defaultShots(spec));

/** What is visible at shot `i`: every node id revealed, and for stepwise nodes how many pieces.
 *  Cumulative: a reveal entry in any earlier shot still counts. */
export function visibleAt(spec: ClusterSpec, i: number): { nodes: Set<string>; steps: Map<string, number> } {
  const shots = shotsOf(spec);
  const nodes = new Set<string>();
  const steps = new Map<string, number>();
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  for (let k = 0; k <= Math.min(i, shots.length - 1); k++) {
    for (const r of shots[k].reveal) {
      const m = /^(.+?)#(\d+)$/.exec(r);
      const id = m ? m[1] : r;
      if (!byId.has(id)) continue;
      nodes.add(id);
      const node = byId.get(id)!;
      const want = m ? Number(m[2]) : nodeSteps(node);
      steps.set(id, Math.max(steps.get(id) ?? 0, Math.min(want, nodeSteps(node))));
    }
  }
  return { nodes, steps };
}

/** The shot's camera, or the overview when a map has no shots at all. */
export function cameraAt(spec: ClusterSpec, i: number): ClusterCamera {
  const shots = shotsOf(spec);
  if (!shots.length) return overviewCamera(spec.field);
  return shots[Math.max(0, Math.min(i, shots.length - 1))].camera;
}

/** Validate anything (the assistant's JSON, a stored frame) into a spec, or null with the
 *  first problem in words. */
export function parseClusterSpec(raw: unknown): { spec: ClusterSpec; error: null } | { spec: null; error: string } {
  const r = clusterSpecSchema.safeParse(raw);
  if (r.success) {
    const ids = new Set(r.data.nodes.map((n) => n.id));
    if (ids.size !== r.data.nodes.length) return { spec: null, error: "two nodes share an id" };
    for (const e of r.data.edges) if (!ids.has(e.from) || !ids.has(e.to)) return { spec: null, error: `edge ${e.from} → ${e.to} names a node that isn't there` };
    return { spec: r.data, error: null };
  }
  const first = r.error.issues[0];
  return { spec: null, error: `${first.path.join(".") || "spec"}: ${first.message}` };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
