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
import { blankCard } from "@/components/canvas/templates";

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

// ---------------------------------------------------------- staged exhibits
//
// AN EXHIBIT FRAME CARRIES THE EXHIBIT, not a card that names it. Until now the
// frame landed as a note reading "Exhibit: cycle" and Lee still had to drop the
// real element on by hand — the one manual step left in the handoff.
//
// HOW AN ELEMENT BELONGS TO A FRAME. Not by ReactFlow parenting: staged elements
// carry `data.stage = { ceqId, x, y, scale }` and the studio finds them with
// `nodes.filter(n => n.data.stage.ceqId === qId)` (CeqStudio.stagedHere). That
// matters — element/frame PARENT membership is a protected zone and off limits,
// but the stage is a plain data reference and creating one here reuses the
// existing contract rather than inventing a second way to attach something.
//
// The shape below mirrors CeqStudio.stageCardData exactly — same centring maths
// on the 1600x900 stage, same `blankCard(kind)` factory the Add menu calls, same
// sizes as stage-elements.tsx — so a staged exhibit is indistinguishable from one
// Lee added by hand, and stays fully draggable and editable.

/** Staged elements this sync owns. Distinct from the frames' "blast-off" tag so
 *  the two cleanups never touch each other's nodes. */
const EL_PROVENANCE = "blast-off-el";

/** The stage a frame's elements are placed on — CeqPreviewer's frameW/frameH. */
export const STAGE_W = 1600, STAGE_H = 900;

/** Exhibit id (EXHIBIT_REGISTRY) → the canvas node kind and the size the Add menu
 *  uses for it. Sizes copied from stage-elements.tsx; the ids happen to equal the
 *  kinds, but they are spelled out rather than assumed. */
export const EXHIBIT_STAGE: Record<string, { kind: string; w: number; h: number }> = {
  cycle: { kind: "cycle", w: 900, h: 560 },
  users: { kind: "users", w: 960, h: 560 },
  standards: { kind: "standards", w: 960, h: 540 },
  basis: { kind: "basis", w: 960, h: 560 },
  careers: { kind: "careers", w: 1000, h: 600 },
  classification: { kind: "classification", w: 1100, h: 620 },
};

/** Where stageCardData drops a new element: centred on the stage, nudged up so it
 *  does not bury the choices. Same arithmetic, so the result lands identically. */
export const stagePos = (w: number, h: number) => ({
  x: Math.round((STAGE_W - w) / 2),
  y: Math.round((STAGE_H - h) / 2) - 60,
});

/** The staged-exhibit node itself. Pure, and exported so the shape is under test
 *  rather than asserted about — a wrong `stage.ceqId` would silently strand the
 *  exhibit on no frame at all, which stays invisible until Lee is on camera. */
export function stagedExhibitNode(frameNodeId: string, frameId: string, exhibitRef: string) {
  const ex = EXHIBIT_STAGE[exhibitRef];
  if (!ex) return null;
  const at = stagePos(ex.w, ex.h);
  const card = blankCard(ex.kind as never) as unknown as Record<string, unknown>;
  return {
    id: `blast-el-${frameId}`,
    type: ex.kind,
    position: at,
    data: {
      ...card,
      // THE ATTACHMENT. `stage.ceqId` is how CeqStudio.stagedHere finds an
      // element's frame — not ReactFlow parenting, which is a protected zone.
      stage: { ceqId: frameNodeId, x: at.x, y: at.y, scale: 1 },
      provenance: EL_PROVENANCE,
      blastFrameId: frameId,
    } as Record<string, unknown>,
  };
}

/** Ten apart, so Lee can still hand-insert a frame between two in the canvas
 *  without forcing a renumber of everything after it. */
const orderAt = (i: number) => (i + 1) * 10;

export const syncBlastPlanToSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameIn).min(1).max(400),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; wrote: number; reordered: number; missing: number; parked: number; staged: number }> => {
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

    let wrote = 0, reordered = 0, missing = 0, staged = 0;
    const planned = new Set<string>();   // frame nodes the plan accounts for
    const stagedEls = new Set<string>(); // element nodes staged onto those frames

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
      // An exhibit frame's content IS the exhibit, so its card is hidden — a
      // second card reading "Exhibit: cycle" would just be in the shot.
      const ex = f.kind === "exhibit" && f.exhibitRef ? EXHIBIT_STAGE[f.exhibitRef] : undefined;
      const callout: Record<string, unknown> | undefined =
        f.kind === "blank" || ex ? { hidden: true } : kindTag ? { kind: kindTag, showTopic: true } : undefined;

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

      // STAGE THE EXHIBIT ITSELF onto that frame.
      if (ex) {
        const elId = `blast-el-${f.id}`;
        const el = j.nodes!.find((n) => n.id === elId);
        stagedEls.add(elId);
        // ONCE. After it exists it is Lee's — he drags it, resizes it, edits its
        // steps, and a re-sync must not undo any of that. The only thing that
        // rebuilds it is the exhibit being swapped for a different one.
        if (el && el.type === ex.kind) { staged++; return; }
        const made = stagedExhibitNode(nodeId, f.id, f.exhibitRef!);
        if (!made) return;
        if (el) { el.type = made.type; el.position = made.position; el.data = made.data; }
        else j.nodes!.push(made);
        staged++;
      }
    });

    // ANYTHING THE PLAN DID NOT MENTION (drafts, mostly) is parked AFTER the
    // running order rather than left interleaved with it — a draft sitting at
    // stageOrder 3 would otherwise land in the middle of the take.
    let parked = 0;
    const tail = j.nodes!
      .filter((n) => n.data?.deckId === data.setId && !planned.has(n.id) && !stagedEls.has(n.id))
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
      const d = n.data as { provenance?: string; deckId?: string; stage?: { ceqId?: string } } | undefined;
      // An exhibit we staged goes when its frame goes — and ONLY then. An element
      // Lee added by hand has no provenance of ours and is never touched.
      if (d?.provenance === EL_PROVENANCE) return stagedEls.has(n.id) || !d.stage?.ceqId?.startsWith("blast-");
      if (d?.provenance !== "blast-off" || d?.deckId !== data.setId) return true;
      return planned.has(n.id);
    });

    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) throw new Error(up.error.message);
    return { ok: true as const, wrote, reordered, missing, parked, staged };
  });
