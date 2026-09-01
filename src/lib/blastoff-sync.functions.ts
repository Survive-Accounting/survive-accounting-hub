// BLAST OFF → THE SET. Materialises a blast-off running order as REAL canvas
// frames, so the thing Lee films is the thing the canvas has always filmed.
//
// WHY THIS EXISTS INSTEAD OF A SECOND RENDERER. /blast-off used to draw its own
// CEQ and its own "found on your exam". That was a second implementation of a
// machine the canvas already owns — identical frame geometry every flip, text
// highlight-to-yellow, spotlight, chains, reveal, the bolt cursor — and it was
// never going to catch up. So blast-off plans, the canvas films, and these
// frames are the handoff.
//
// SHAPE MATCHES CeqStudio.insertFrame EXACTLY: a non-CEQ frame is a `ceq` node
// carrying `noteOnly: true` + `frameMode`, which is why "the whole card system
// just works" on it. Nothing new is invented here.
//
// IDEMPOTENT: every generated frame has a derived id (`blast-<frameId>`), so
// re-syncing updates in place rather than piling up duplicates.
//
// LEE OWNS THE ORDER (his call, 2026-08-31): the plan's order is written to
// stageOrder for EVERY frame in the set, questions included. Re-running after a
// canvas reorder will pull it back to the plan — reorder in blast-off, or
// re-sync after changing the canvas, not both at once.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

const frameIn = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["intro", "foye", "ceq", "phrase", "cheat", "tip", "exhibit", "blank", "outro"]),
  ceqId: z.string().max(130).optional(),
  text: z.string().max(4000).optional(),
  title: z.string().max(400).optional(),
  body: z.string().max(4000).optional(),
  topic: z.string().max(300).optional(),
  tagline: z.string().max(300).optional(),
  canonical: z.string().max(600).optional(),
  variations: z.array(z.string().max(600)).max(8).optional(),
  exhibitRef: z.string().max(60).optional(),
});
type FrameIn = z.infer<typeof frameIn>;

/** Which canvas frameMode a plan frame becomes. Everything that is not the
 *  bookends is a NOTE frame — the canvas's own word for "a frame with no
 *  choices that is never counted". */
const modeFor = (k: FrameIn["kind"]): "intro" | "outro" | "note" =>
  k === "intro" ? "intro" : k === "outro" ? "outro" : "note";

/** The frame's on-card words. The canvas renders `prompt` as the stem, so this
 *  is what ends up on screen. */
function promptFor(f: FrameIn, setName: string, foye: { canonical: string; variations: string[] }): string {
  switch (f.kind) {
    case "intro": return f.topic?.trim() || setName;
    // A frame whose words are generated at RENDER time would land in the canvas
    // empty — the canvas cannot generate them. So they are resolved here, once,
    // and become real editable text on a real frame.
    case "outro": return f.tagline?.trim() || "Cram what's on your exam.";
    case "foye": return f.canonical?.trim() || foye.canonical;
    case "cheat": return [f.title?.trim(), f.body?.trim()].filter(Boolean).join(" — ");
    case "exhibit": return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
    default: return f.text?.trim() || "";
  }
}

/** FOUND ON YOUR EXAM is a callout with secondary stems — the canvas already
 *  draws exactly that (kicker + stem + indented grey bullets), which is the
 *  card Lee wanted rather than a redrawn one. */
function calloutFor(f: FrameIn, foye: { canonical: string; variations: string[] }): Record<string, unknown> | undefined {
  if (f.kind === "foye") {
    const stems = f.variations?.length ? f.variations : foye.variations;
    return { showTopic: true, extraStems: stems.slice(0, 6) };
  }
  // The outro's card is hidden — the frame is its staged brand elements.
  if (f.kind === "outro") return { hidden: true };
  return undefined;
}

export const syncBlastPlanToSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameIn).min(1).max(400),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; wrote: number; reordered: number; missingCeqs: number }> => {
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");

    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) throw new Error(error.message);

    const j = row.nodes_json as {
      nodes?: { id: string; type?: string; position?: { x: number; y: number }; data?: Record<string, unknown> }[];
      decks?: { id: string; name?: string }[];
    };
    j.nodes ??= [];
    const setName = (j.decks ?? []).find((d) => d.id === data.setId)?.name ?? "";

    // THE SET'S OWN QUESTIONS decide what "found on your exam" says — the same
    // generator the preview uses, resolved once here so the frame carries real
    // words instead of arriving blank.
    const stems = j.nodes
      .filter((n) => n.type === "ceq" && n.data?.deckId === data.setId && !n.data?.noteOnly && !n.data?.draft)
      .map((n) => String(n.data?.prompt ?? ""))
      .filter(Boolean);
    const { foundOnYourExam } = await import("@/components/blastoff/found-on-exam");
    const foye = foundOnYourExam(stems);

    let wrote = 0, reordered = 0, missingCeqs = 0;

    // Ten apart so Lee can still hand-insert something between two frames in the
    // canvas without a renumber.
    data.frames.forEach((f, i) => {
      const stageOrder = (i + 1) * 10;

      if (f.kind === "ceq") {
        const node = f.ceqId ? j.nodes!.find((n) => n.id === f.ceqId) : undefined;
        if (!node?.data) { missingCeqs++; return; }
        node.data.stageOrder = stageOrder;
        node.data.slotIndex = stageOrder;
        reordered++;
        return;
      }

      const nodeId = `blast-${f.id}`;
      const pos = { x: 520, y: 210 };
      const callout = calloutFor(f, foye);
      const dataObj: Record<string, unknown> = {
        kind: "ceq",
        title: setName,
        prompt: promptFor(f, setName, foye),
        // The canvas's own contract for a non-question frame.
        noteOnly: true,
        frameMode: modeFor(f.kind),
        choices: [],
        ...(callout ? { callout } : {}),
        deckId: data.setId,
        deckMember: true,
        tucked: true,
        stageOrder,
        slotIndex: stageOrder,
        deckCategory: "ceq:studio",
        deckPos: pos,
        // Provenance so a frame that came from blast-off is identifiable in the
        // canvas — and so a re-sync knows which frames it owns.
        provenance: "blast-off",
        blastKind: f.kind,
        ...(f.exhibitRef ? { blastExhibitRef: f.exhibitRef } : {}),
      };

      const existing = j.nodes!.find((n) => n.id === nodeId);
      if (existing) existing.data = { ...existing.data, ...dataObj };
      else j.nodes!.push({ id: nodeId, type: "ceq", position: pos, data: dataObj });
      wrote++;
    });

    // A frame Lee deleted in blast-off should leave the set too — but ONLY ones
    // blast-off created. Hand-authored frames are never touched.
    const keep = new Set(data.frames.filter((f) => f.kind !== "ceq").map((f) => `blast-${f.id}`));
    j.nodes = j.nodes!.filter((n) => {
      const d = n.data as { provenance?: string; deckId?: string } | undefined;
      if (d?.provenance !== "blast-off" || d?.deckId !== data.setId) return true;
      return keep.has(n.id);
    });

    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) throw new Error(up.error.message);
    return { ok: true as const, wrote, reordered, missingCeqs };
  });
