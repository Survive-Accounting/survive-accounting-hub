// SPLIT A SET — the server side of the knife (components/blastoff/split-set.ts is the pure
// side). The ticked cards MOVE out of the parent into new sibling sets under the same topic.
//
// Lee, 2026-09-09: "The splitting has to be ruthless… if it needs to be split, it could be that
// the way we do that is just to edit five videos at once and then push them to filming and
// then film five back to back. So for a quick example, with the initial free videos for easy
// points, I'm doing what type of account is this? and I wanna split it into a short for assets,
// one for liabilities, one for equity, one for revenue, one for expense."
//
// A Blast Off plan is one per set, so five Shorts from one 31-card set means five sets — and
// until today the only way to make them was by hand in the canvas. This is that tool.
//
// HOW A SET IS BUILT, and therefore how one is split. A set is a deck object inside a scene's
// nodes_json (`decks[]`) plus the `ceq` nodes in that scene whose data.deckId is the deck's id;
// the bank reads per-set scenes first (student.functions loadDecksDeduped). So each piece gets
// its own scene with its own deck — the exact shape blastOffStrategyShort mints — and its cards
// are the parent's nodes MOVED across: same node ids (ids are global and nothing else may reuse
// them — chains and practice_events point at them), data.deckId rewritten to the new deck,
// stageOrder renumbered in the piece's order, and data.splitFrom naming the parent so the cut
// is always traceable.
//
// MOVED, NOT COPIED. Copying would put the same question on the student path twice — once in
// the parent, once in the piece. What is not ticked stays in the parent; a parent left with no
// filmable card is parked so it never renders empty, and reported. Nothing is deleted.
//
// PLACEMENT. Siblings, in order, right after the parent: sortOrder = parent + k/(n+1), which
// sorts correctly (loadBoothBank orders by sortOrder) without renumbering anything else.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { splitProblem } from "@/components/blastoff/split-set";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
function rethrow(e: { code?: string; message: string }): never { throw new Error(e.message); }
const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
const deckId = (): string => `deck-${Date.now().toString(36)}-p${Math.random().toString(36).slice(2, 6)}`;

type Deck = { id: string; name?: string; payloadType?: string; status?: string; parked?: boolean; access?: string; topicId?: string | null; courseId?: string | null; sortOrder?: number; lessonId?: string | null; splitInto?: string[] };
type Node = { id: string; type?: string; data?: Record<string, unknown> };

export interface SplitResult {
  pieces: { deckId: string; name: string; path: string; cards: number }[];
  /** True when every filmable card left the parent and it was parked. */
  parentParked: boolean;
  parentPath: string;
}

export const splitSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    pieces: z.array(z.object({ name: z.string().trim().min(1).max(120), ceqIds: z.array(z.string().min(1).max(200)).min(1).max(60) })).min(2).max(12),
  }).parse(d))
  .handler(async ({ data }): Promise<SplitResult> => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("that set is not in the bank");
    const parent = o.deck as Deck;
    if (parent.status !== "live" || parent.parked) throw new Error("only a live set can be split");

    // The same law the panel applied, re-checked against the live scene — a card ticked in a
    // stale tab may have been moved by an earlier split.
    const parentIds = (o.nodes as Node[]).map((n) => n.id);
    const problem = splitProblem(parentIds, data.pieces);
    if (problem) throw new Error(problem);
    const filmable = (n: Node) => !n.data?.noteOnly && !n.data?.draft;
    for (const p of data.pieces) for (const id of p.ceqIds) {
      const n = (o.nodes as Node[]).find((x) => x.id === id);
      if (n && !filmable(n)) throw new Error(`"${String(n.data?.prompt ?? id).slice(0, 40)}" is a note or a draft — it stays with the set`);
    }

    const { data: ch, error: chErr } = await db.from("chapters").select("id,chapter_name").eq("id", parent.topicId ?? "").maybeSingle();
    if (chErr) rethrow(chErr);
    const topicName = String(ch?.chapter_name ?? "More");
    const path = (setName: string) => `/v3/${slugOf(topicName)}/${slugOf(setName)}/blast-off`;

    // Read the parent scene FRESH — the dedupe above read a cached copy — and take the nodes
    // from the row we are about to write, not from the cache.
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { nodes?: Node[]; decks?: Deck[] };
    const nodes = j.nodes ?? [];
    const liveParent = (j.decks ?? []).find((d) => d.id === parent.id);
    if (!liveParent) throw new Error("the set vanished from its scene — refresh and retry");

    const now = new Date().toISOString();
    const base = typeof liveParent.sortOrder === "number" ? liveParent.sortOrder : 0;
    const n = data.pieces.length;
    const made: SplitResult["pieces"] = [];
    const moving = new Set<string>();

    for (let k = 0; k < n; k++) {
      const piece = data.pieces[k];
      const id = deckId();
      const deck: Deck & Record<string, unknown> = {
        id, name: piece.name, payloadType: "cards", filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true,
        createdAt: now, updatedAt: now,
        status: "live", parked: false, access: liveParent.access ?? "free",
        topicId: liveParent.topicId ?? null, courseId: liveParent.courseId ?? null,
        sortOrder: base + (k + 1) / (n + 1),
        splitFrom: parent.id,
      };
      const cards: Node[] = piece.ceqIds.map((cid, i) => {
        const src = nodes.find((x) => x.id === cid);
        if (!src) throw new Error(`card ${cid} is not in the set any more — refresh and retry`);
        moving.add(cid);
        return { ...src, data: { ...(src.data ?? {}), deckId: id, stageOrder: i, splitFrom: parent.id, splitAt: now } };
      });
      const { error: e2 } = await db.from("canvas_scenes").insert({
        name: `${topicName} · ${piece.name}`,
        chapter_id: liveParent.topicId ?? null,
        nodes_json: { nodes: cards, edges: [], zones: [], decks: [deck], splitFrom: parent.id },
        viewport_json: { x: 0, y: 0, zoom: 1 },
      });
      if (e2) rethrow(e2);
      made.push({ deckId: id, name: piece.name, path: path(piece.name), cards: cards.length });
    }

    // The parent keeps what was not ticked. With no filmable card left it is parked, not
    // deleted — an empty set on the student path is a broken-looking page, and nothing is lost.
    j.nodes = nodes.filter((x) => !moving.has(x.id));
    const remaining = j.nodes.filter((x) => x.type === "ceq" && x.data?.deckId === parent.id && filmable(x)).length;
    liveParent.splitInto = [...(liveParent.splitInto ?? []), ...made.map((m) => m.deckId)];
    (liveParent as Record<string, unknown>).updatedAt = now;
    const parentParked = remaining === 0;
    if (parentParked) { liveParent.parked = true; liveParent.status = "archived"; }
    const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: now }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);

    return { pieces: made, parentParked, parentPath: path(String(parent.name ?? "")) };
  });
