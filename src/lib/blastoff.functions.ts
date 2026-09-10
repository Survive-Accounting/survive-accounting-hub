// BLAST OFF — server side. The plan for a set is stored ON THE SET, as an
// additive `blastOff` field on the deck inside canvas_scenes.nodes_json. That
// is the same place the set's questions, layout and publications already live,
// so a plan travels with the set it films and needs no new table.
//
// Additive by construction: a set with no plan reads back as null and the
// client generates the default spine. Nothing a student sees is touched — a
// plan is production data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { frameSchema, type FrameRow } from "@/lib/blastoff-frame-schema";
import { BLAST_FRAME_KINDS } from "@/components/blastoff/plan";

/** Scene JSON is the store — same door talkthrough.functions.ts uses. */
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
function rethrow(e: { code?: string; message: string }): never { throw new Error(e.message); }

// The frame schema lives in blastoff-frame-schema.ts — shared with blastoff-sync.functions.ts.

export type BlastFrameRow = FrameRow;

/** Read the stored plan for a set. null = never planned; the client generates. */
export const loadBlastPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ frames: BlastFrameRow[]; updatedAt: string; layout?: "pass1" | "pass2" } | null> => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");
    const deck = o.deck as { blastOff?: { frames?: unknown[]; updatedAt?: string; layout?: unknown } };
    const raw = deck.blastOff;
    if (!raw?.frames?.length) return null;
    const parsed = z.array(frameSchema).safeParse(raw.frames);
    // A malformed plan must not brick the route — regenerate rather than throw.
    if (!parsed.success) return null;
    const layout = raw.layout === "pass2" ? "pass2" as const : raw.layout === "pass1" ? "pass1" as const : undefined;
    return { frames: parsed.data, updatedAt: String(raw.updatedAt ?? ""), ...(layout ? { layout } : {}) };
  });

/** EVERY SET WITH A SAVED PLAN, in one round trip — the "has this been through Review" signal
 *  for the stage chip (components/v3/set-stage.ts; 2026-09-06 audit: Post "has no idea what's
 *  actually finished"). A plan is stored on the deck, so this is one canvas_scenes read, the
 *  same loadDecksDeduped pass loadBlastPlan does for one set, minus the frame validation: a
 *  count is enough here, and a malformed plan still means someone reviewed. Admin-gated like
 *  the other cross-set reads (listPublishStatuses, productionBottleneckReport); the queue
 *  treats a rejection as "no signal", never as an error. */
/** One video inside a set's running order: the cuts split it, and each run can carry a name.
 *  A set with no cuts reports exactly one take, so Post treats every set the same way. */
export interface PlanTakeRow {
  name: string;
  /** The run's head frame id — what an offshoot's branchTakeHead points at. "" for an empty plan. */
  headId: string;
  /** Slides in this run (skipped ones excluded — a skipped slide is in no video). */
  frames: number;
  /** The set's own cards this run covers, in order. Post uses them to caption and to cover the
   *  right video rather than the whole set. */
  ceqIds: string[];
}

export const listBlastPlanSetIds = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ setId: string; frames: number; updatedAt: string | null; takes: PlanTakeRow[] }[]> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const out: { setId: string; frames: number; updatedAt: string | null; takes: PlanTakeRow[] }[] = [];
    // A raw frame, read defensively: this pass deliberately skips Zod (a malformed plan still
    // means someone reviewed) so nothing here may assume a shape.
    type Raw = { cutAfter?: unknown; takeName?: unknown; ceqId?: unknown; skipped?: unknown };
    for (const [setId, o] of owned) {
      const raw = (o.deck as { blastOff?: { frames?: unknown[]; updatedAt?: string } }).blastOff;
      const list = Array.isArray(raw?.frames) ? (raw.frames as Raw[]) : [];
      const frames = list.length;
      if (frames === 0) continue;
      // THE TAKES, computed the same way plan.ts's planTakes does — over the frames that will
      // actually be filmed, since a skipped slide is not part of any video.
      const takes: PlanTakeRow[] = [];
      let run: Raw[] = [];
      const push = () => {
        const head = run[0] as { takeName?: unknown } | undefined;
        takes.push({
          name: typeof head?.takeName === "string" ? head.takeName.trim().slice(0, 80) : "",
          headId: typeof (head as { id?: unknown } | undefined)?.id === "string" ? String((head as { id: string }).id) : "",
          frames: run.length,
          ceqIds: run.filter((r) => typeof r.ceqId === "string" && r.ceqId).map((r) => String(r.ceqId)),
        });
        run = [];
      };
      for (const fr of list) {
        if (fr?.skipped === true) continue;
        run.push(fr);
        if (fr?.cutAfter === true) push();
      }
      if (run.length || !takes.length) push();
      out.push({ setId, frames, updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null, takes });
    }
    return out;
  });

/** SET THE LANE (docs/DESIGN-CRAM-MAP.md, 2026-09-09). Lee: "it'll be fun to reengineer the
 *  topics and figure out what is core to cramming and what is more of an offshoot."
 *
 *  The same read-modify-write saveBlastPlan does — the deck lives inside canvas_scenes.nodes_json
 *  and there is no other door to it. "cram" DELETES both fields rather than writing lane:"cram",
 *  so a bank nobody has marked stays byte-identical to one that could not be marked, and putting
 *  a set back on the path leaves no trace.
 *
 *  A branch must hang off a cram set in its own topic. That is checked HERE, not just in the UI:
 *  a two-level tree would break every reader's "one level deep" assumption, and the map draws
 *  what the data says. */
export const setDeckLane = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    lane: z.enum(["cram", "offshoot", "pitch"]),
    branchFrom: z.string().max(120).optional(),
    branchTakeHead: z.string().max(120).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; lane: string; branchFrom: string | null }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");

    const branch = data.lane !== "cram";
    if (branch) {
      // THE PARENT RULE, enforced on the server. The parent must exist, be in the same topic,
      // not be this set, and be on the cram path itself.
      const parentId = (data.branchFrom ?? "").trim();
      if (!parentId) throw new Error("An offshoot or pitch has to hang off a cram set — none was named.");
      if (parentId === data.setId) throw new Error("A set cannot hang off itself.");
      const parent = owned.get(parentId);
      if (!parent) throw new Error("That parent set does not exist.");
      const mine = (o.deck as { topicId?: string | null }).topicId ?? null;
      const theirs = (parent.deck as { topicId?: string | null }).topicId ?? null;
      if (mine !== theirs) throw new Error("It can only hang off a set in the same topic.");
      const { laneOf } = await import("@/lib/deck-lane");
      if (laneOf(parent.deck as { lane?: unknown }) !== "cram") throw new Error("It can only hang off a set on the cram path.");
    }

    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { decks?: { id: string; lane?: string; branchFrom?: string }[] };
    const deck = (j.decks ?? []).find((d) => d.id === data.setId);
    if (!deck) throw new Error("set not found in its scene — nothing written");

    if (branch) {
      deck.lane = data.lane; deck.branchFrom = (data.branchFrom ?? "").trim();
      const dk = deck as { branchTakeHead?: string };
      if (data.branchTakeHead !== undefined) { if (data.branchTakeHead) dk.branchTakeHead = data.branchTakeHead; else delete dk.branchTakeHead; }
    } else { delete deck.lane; delete deck.branchFrom; delete (deck as { branchTakeHead?: string }).branchTakeHead; }

    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, lane: data.lane, branchFrom: branch ? (data.branchFrom ?? "").trim() : null };
  });


// ── THE MAP'S WRITERS (docs/DESIGN-CRAM-MAP.md; 2026-09-10) ─────────────────────────────────────
// Lee: "set this up in a UI where I can play with it myself. I want to start arranging the
// offshoots in particular orders, connect them to the right splits, and this way I'll know what
// order of production I'm making the videos today."

const LANE_META_SCHEMA = z.object({
  setId: z.string().min(1).max(120),
  name: z.string().min(1).max(120).optional(),
  blurb: z.string().max(400).optional(),
  branchOrder: z.number().int().min(0).max(999).optional(),
  /** "" clears it — the offshoot hangs off the set as a whole again. */
  branchTakeHead: z.string().max(120).optional(),
  parked: z.boolean().optional(),
});

/** Rename, describe, reorder, re-attach, or park a set — one read-modify-write, only the named
 *  fields touched. The head-frame check is real: an id the parent's plan does not have is refused,
 *  because a dangling pointer would draw the offshoot under "hanging off nothing" and Lee would
 *  think he lost it. */
export const updateDeckMeta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LANE_META_SCHEMA.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");

    if (data.branchTakeHead) {
      const parentId = (o.deck as { branchFrom?: string }).branchFrom;
      if (!parentId) throw new Error("This set hangs off nothing — set its lane first.");
      const parent = owned.get(parentId);
      const frames = (parent?.deck as { blastOff?: { frames?: { id?: unknown; skipped?: unknown }[] } } | undefined)?.blastOff?.frames ?? [];
      if (!frames.some((f) => f?.id === data.branchTakeHead && f?.skipped !== true)) throw new Error("That split is not in the parent's plan any more.");
    }

    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { decks?: Record<string, unknown>[] };
    const deck = (j.decks ?? []).find((d) => d.id === data.setId);
    if (!deck) throw new Error("set not found in its scene — nothing written");

    if (data.name !== undefined) deck.name = data.name.trim();
    if (data.blurb !== undefined) { const b = data.blurb.trim(); if (b) deck.blurb = b; else delete deck.blurb; }
    if (data.branchOrder !== undefined) deck.branchOrder = data.branchOrder;
    if (data.branchTakeHead !== undefined) { if (data.branchTakeHead) deck.branchTakeHead = data.branchTakeHead; else delete deck.branchTakeHead; }
    if (data.parked !== undefined) deck.parked = data.parked;
    deck.updatedAt = new Date().toISOString();

    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const };
  });

/** REORDER SIBLINGS IN ONE CALL. A nudge on the map rewrites every sibling's branchOrder so the
 *  arrangement is explicit from then on (lane-map.ts nudgeOrder) — six updateDeckMeta calls, each
 *  reloading the whole bank, took longer than the click felt like it should and could interleave
 *  with the next click. One load, one write per scene, done. Ids not found are skipped, not
 *  fatal: a sibling parked between the click and the write is not a reason to lose the rest. */
export const setBranchOrders = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    orders: z.array(z.object({ setId: z.string().min(1).max(120), branchOrder: z.number().int().min(0).max(999) })).min(1).max(60),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; written: number }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    // Group by scene: a scene holds one branch deck today, but the write is per scene regardless.
    const byScene = new Map<string, { setId: string; branchOrder: number }[]>();
    for (const o of data.orders) {
      const own = owned.get(o.setId);
      if (!own) continue;
      const list = byScene.get(own.sceneId) ?? [];
      list.push(o);
      byScene.set(own.sceneId, list);
    }
    let written = 0;
    const now = new Date().toISOString();
    for (const [sceneId, list] of byScene) {
      const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
      if (error) rethrow(error);
      const j = row.nodes_json as { decks?: Record<string, unknown>[] };
      for (const o of list) {
        const deck = (j.decks ?? []).find((d) => d.id === o.setId);
        if (!deck) continue;
        deck.branchOrder = o.branchOrder;
        deck.updatedAt = now;
        written += 1;
      }
      const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
      if (up.error) rethrow(up.error);
    }
    return { ok: true as const, written };
  });

/** MINT AN OFFSHOOT OR A PITCH off a cram set: a new scene holding one zero-card deck in the
 *  parent's topic, on the given lane, hanging off the parent (and one of its splits, when named),
 *  with the standard spine and the blurb as its one slide — exactly what blastOffStrategyShort
 *  mints for a strategy short, so Brainstorm / Editor / Film / Post all work on it from the first
 *  second. Zero cards means student.functions.ts drops it from /learn until it has content, which
 *  is the right default for a video that does not exist yet. */
export const mintBranch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    parentId: z.string().min(1).max(120),
    lane: z.enum(["offshoot", "pitch"]),
    name: z.string().min(1).max(120),
    blurb: z.string().max(400).optional(),
    branchTakeHead: z.string().max(120).optional(),
    branchOrder: z.number().int().min(0).max(999).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ deckId: string; created: boolean }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const { laneOf } = await import("@/lib/deck-lane");
    const owned = await loadDecksDeduped(db as never);
    const parent = owned.get(data.parentId);
    if (!parent) throw new Error("parent set not found");
    const pd = parent.deck as { topicId?: string | null; courseId?: string | null; lane?: unknown; blastOff?: { frames?: { id?: unknown; skipped?: unknown }[] } };
    if (laneOf(pd) !== "cram") throw new Error("A branch can only hang off a set on the cram path.");
    if (data.branchTakeHead) {
      const frames = pd.blastOff?.frames ?? [];
      if (!frames.some((f) => f?.id === data.branchTakeHead && f?.skipped !== true)) throw new Error("That split is not in the parent's plan.");
    }

    // IDEMPOTENT ON NAME + PARENT: the seed script runs more than once, and a double-click on the
    // map must not mint twins. A second, different offshoot with the same name is a rename away.
    const name = data.name.trim();
    for (const o of owned.values()) {
      const d = o.deck as { id: string; name?: string; branchFrom?: string; parked?: boolean };
      if (d.branchFrom === data.parentId && (d.name ?? "").trim().toLowerCase() === name.toLowerCase() && d.parked !== true) {
        return { deckId: d.id, created: false };
      }
    }

    const now = new Date().toISOString();
    const id = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const { planFramesForShort } = await import("./strategy.functions");
    const frames = planFramesForShort({ title: name, context: {}, body: data.blurb ?? "" });
    const deck = {
      id, name, payloadType: "cards", filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true,
      createdAt: now, updatedAt: now,
      status: "live", parked: false, access: "free",
      topicId: pd.topicId ?? null, courseId: pd.courseId ?? null,
      lane: data.lane, branchFrom: data.parentId,
      ...(data.branchTakeHead ? { branchTakeHead: data.branchTakeHead } : {}),
      ...(data.branchOrder != null ? { branchOrder: data.branchOrder } : {}),
      ...(data.blurb?.trim() ? { blurb: data.blurb.trim() } : {}),
      blastOff: { frames, updatedAt: now, layout: "pass2" },
    };
    const parentName = String((parent.deck as { name?: string }).name ?? "");
    const { error } = await db.from("canvas_scenes").insert({
      name: `${data.lane === "pitch" ? "Pitch" : "Offshoot"} · ${name} · off ${parentName}`,
      chapter_id: pd.topicId ?? null,
      nodes_json: { nodes: [], edges: [], zones: [], decks: [deck], branch: true },
      viewport_json: { x: 0, y: 0, zoom: 1 },
    });
    if (error) rethrow(error);
    return { deckId: id, created: true };
  });


/** Write the plan back onto the deck. Whole-plan replace: the client owns the
 *  order, and a partial merge would fight the drag. */
export const saveBlastPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameSchema).min(1).max(400),
    layout: z.enum(["pass1", "pass2"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");

    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { decks?: { id: string; blastOff?: { frames?: unknown; updatedAt?: string; layout?: unknown } }[] };
    const deck = (j.decks ?? []).find((d) => d.id === data.setId);
    if (!deck) throw new Error("set not found in its scene — nothing written");

    const updatedAt = new Date().toISOString();
    // The template rides with the plan; a save that does not name it keeps the one stored.
    const layout = data.layout ?? (deck.blastOff?.layout === "pass2" ? "pass2" : deck.blastOff?.layout === "pass1" ? "pass1" : undefined);
    deck.blastOff = { frames: data.frames, updatedAt, ...(layout ? { layout } : {}) };
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, frames: data.frames.length, updatedAt };
  });
