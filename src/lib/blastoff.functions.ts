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
