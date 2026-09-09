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
