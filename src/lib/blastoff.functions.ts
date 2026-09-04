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
import { BLAST_FRAME_KINDS } from "@/components/blastoff/plan";

/** Scene JSON is the store — same door talkthrough.functions.ts uses. */
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
function rethrow(e: { code?: string; message: string }): never { throw new Error(e.message); }

const frameSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(BLAST_FRAME_KINDS),
  ceqId: z.string().max(130).optional(),
  text: z.string().max(4000).optional(),
  title: z.string().max(400).optional(),
  body: z.string().max(4000).optional(),
  exhibitRef: z.string().max(60).optional(),
  bankItemId: z.string().max(130).optional(),
  // THE REVIEW STEP (2026-09-03): a skipped card, and the teleprompter lines
  // Lee kept for the slide. Additive; old plans have neither.
  skipped: z.boolean().optional(),
  prompter: z.array(z.string().max(600)).max(40).optional(),
  bullets: z.array(z.string().max(300)).max(12).optional(),
  backdrop: z.enum(["zoom", "off"]).optional(),
});

export type BlastFrameRow = z.infer<typeof frameSchema>;

/** Read the stored plan for a set. null = never planned; the client generates. */
export const loadBlastPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ frames: BlastFrameRow[]; updatedAt: string } | null> => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");
    const deck = o.deck as { blastOff?: { frames?: unknown[]; updatedAt?: string } };
    const raw = deck.blastOff;
    if (!raw?.frames?.length) return null;
    const parsed = z.array(frameSchema).safeParse(raw.frames);
    // A malformed plan must not brick the route — regenerate rather than throw.
    if (!parsed.success) return null;
    return { frames: parsed.data, updatedAt: String(raw.updatedAt ?? "") };
  });

/** Write the plan back onto the deck. Whole-plan replace: the client owns the
 *  order, and a partial merge would fight the drag. */
export const saveBlastPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameSchema).min(1).max(400),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");

    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { decks?: { id: string; blastOff?: unknown }[] };
    const deck = (j.decks ?? []).find((d) => d.id === data.setId);
    if (!deck) throw new Error("set not found in its scene — nothing written");

    const updatedAt = new Date().toISOString();
    deck.blastOff = { frames: data.frames, updatedAt };
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, frames: data.frames.length, updatedAt };
  });
