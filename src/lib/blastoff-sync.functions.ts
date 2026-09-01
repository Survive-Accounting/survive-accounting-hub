// BLAST OFF → THE SET. Writes a blast-off running order onto the set as real
// canvas frames, so the thing Lee films is the thing the canvas has always
// filmed.
//
// WHY THIS EXISTS INSTEAD OF A SECOND RENDERER. /blast-off used to draw its own
// CEQ card and its own "found on your exam". That was a second implementation of
// a machine the canvas already owns — identical frame geometry every flip,
// highlight-to-yellow, the spotlight rig, chains, reveal, the bolt cursor — and
// it was never going to catch up. Blast off plans; the canvas films.
//
// WHAT CHANGED 2026-08-31 (the duplicate-bookends bug). The first version
// invented an intro / found-on-your-exam / outro per set and renumbered ONLY the
// frames it knew about. But sets already ship authored intro and outro cards
// (note-only CEQ nodes like `ceq-e1s-1-3-intro`), and those kept their original
// stageOrder of 0 and 9 — so they sorted AHEAD of the generated pair and the
// spine read: note, note, intro, note, Q1… two mystery cards, then a duplicate
// intro. Fixed by inverting the rule:
//
//   THE PLAN IS THE WHOLE RUNNING ORDER. Every frame in the set is renumbered
//   from it — the set's own cards included — so what Lee arranged is exactly
//   what the canvas shows. Nothing is generated; nothing is duplicated.
//
// SHAPE MATCHES CeqStudio.insertFrame EXACTLY: a non-question frame is a `ceq`
// node carrying `noteOnly: true` + `frameMode: "note"`, which is why the whole
// card system just works on it. Inserts become REAL callout cards using the
// canvas's own callout kinds, not new card types.
//
// IDEMPOTENT: every inserted frame has a derived id (`blast-<frameId>`), so
// re-syncing updates in place rather than piling up duplicates.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { INSERT_CALLOUT } from "@/components/blastoff/plan";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

const frameIn = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["ceq", "phrase", "cheat", "tip", "exhibit", "blank"]),
  ceqId: z.string().max(130).optional(),
  text: z.string().max(4000).optional(),
  title: z.string().max(400).optional(),
  body: z.string().max(4000).optional(),
  exhibitRef: z.string().max(60).optional(),
  bankItemId: z.string().max(130).optional(),
});
type FrameIn = z.infer<typeof frameIn>;

// The insert → callout-kind mapping is SHARED with the Blast Off preview
// (components/blastoff/plan), so the card Lee arranged is the card that lands.

/** The frame's on-card words — the canvas renders `prompt` as the stem. */
function promptFor(f: FrameIn): string {
  if (f.kind === "cheat") return [f.title?.trim(), f.body?.trim()].filter(Boolean).join(" — ");
  if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
  return f.text?.trim() ?? "";
}

/** Ten apart, so Lee can still hand-insert a frame between two in the canvas
 *  without forcing a renumber of everything after it. */
const orderAt = (i: number) => (i + 1) * 10;

export const syncBlastPlanToSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameIn).min(1).max(400),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; wrote: number; reordered: number; missing: number; parked: number }> => {
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

    let wrote = 0, reordered = 0, missing = 0;
    const planned = new Set<string>();

    data.frames.forEach((f, i) => {
      const stageOrder = orderAt(i);

      // A card the set already owns: renumber it in place. Its content, its
      // choices, its layout and its authoring history are none of our business.
      if (f.kind === "ceq") {
        const node = f.ceqId ? j.nodes!.find((n) => n.id === f.ceqId) : undefined;
        if (!node?.data) { missing++; return; }
        node.data.stageOrder = stageOrder;
        node.data.slotIndex = stageOrder;
        planned.add(node.id);
        reordered++;
        return;
      }

      // A card Lee inserted here: upsert it as a real note frame.
      const nodeId = `blast-${f.id}`;
      const pos = { x: 520, y: 210 };
      const kindTag = INSERT_CALLOUT[f.kind];
      const callout: Record<string, unknown> | undefined =
        f.kind === "blank" ? { hidden: true } : kindTag ? { kind: kindTag, showTopic: true } : undefined;

      const dataObj: Record<string, unknown> = {
        kind: "ceq",
        title: setName,
        prompt: promptFor(f),
        noteOnly: true,          // the canvas's own contract for a non-question frame
        frameMode: "note",
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
      planned.add(nodeId);
      wrote++;
    });

    // ANYTHING THE PLAN DID NOT MENTION (drafts, mostly) is parked AFTER the
    // running order rather than left interleaved with it — a draft sitting at
    // stageOrder 3 would otherwise land in the middle of the take.
    let parked = 0;
    const tail = j.nodes!
      .filter((n) => n.data?.deckId === data.setId && !planned.has(n.id))
      .sort((a, b) => Number(a.data?.stageOrder ?? 0) - Number(b.data?.stageOrder ?? 0));
    tail.forEach((n, k) => {
      n.data!.stageOrder = orderAt(data.frames.length + k);
      n.data!.slotIndex = n.data!.stageOrder;
      parked++;
    });

    // A frame Lee deleted in blast-off should leave the set too — but ONLY ones
    // blast-off created. Hand-authored frames are never touched. This is also
    // what clears the generated intro/foye/outro cards the old version wrote.
    j.nodes = j.nodes!.filter((n) => {
      const d = n.data as { provenance?: string; deckId?: string } | undefined;
      if (d?.provenance !== "blast-off" || d?.deckId !== data.setId) return true;
      return planned.has(n.id);
    });

    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) throw new Error(up.error.message);
    return { ok: true as const, wrote, reordered, missing, parked };
  });
