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

import { frameSchema } from "@/lib/blastoff-frame-schema";

import { BIO_CARD, bioCallout } from "@/components/blastoff/bio-card";
import { verticalCardSpot } from "@/components/blastoff/film-spot";
import { BLAST_FRAME_KINDS, INSERT_CALLOUT, backdropFor, insertStem } from "@/components/blastoff/plan";
import { blankCard } from "@/components/canvas/templates";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

// ONE schema with blastoff.functions.ts — see blastoff-frame-schema.ts.
const frameIn = frameSchema;
type FrameIn = z.infer<typeof frameIn>;

// The insert → callout-kind mapping is SHARED with the Blast Off preview
// (components/blastoff/plan), so the card Lee arranged is the card that lands.

/** The frame's on-card words. The standard spine's cards are HIDDEN — their
 *  content is the vertical frame staged on them — so for those this is only the
 *  label Lee reads in the spine. */
function promptFor(f: FrameIn, setName = ""): string {
  if (f.kind === "open") return "Survive — cold open";
  if (f.kind === "intro") return f.text?.trim() || setName;
  if (f.kind === "bio") return BIO_CARD.title;
  if (f.kind === "outro") return f.text?.trim() || "Cram what's on your exam.";
  if (f.kind === "bolt") return "Bolt detour";
  if (f.kind === "ad") return `Ad — ${f.ad ?? "greek"}`;
  // Inserts carry their ==key phrase== marked — the detour card highlights it.
  return insertStem(f);
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
export interface StageSpec { kind: string; w: number; h: number }

/** THE STANDARD SPINE'S FRAMES. The vertical 9:16 cards, at the size the Add
 *  menu uses for them (stage-elements.tsx: 540x960 — half of a 1080x1920
 *  capture). The bio is its own frame so the slot can later be re-cut as the
 *  chapter ask or the rep ask without reshooting the sign-off. */
export const STANDARD_STAGE: Record<string, StageSpec> = {
  open: { kind: "blastopen", w: 540, h: 960 },
  intro: { kind: "blastintro", w: 540, h: 960 },
  bio: { kind: "blastbio", w: 540, h: 960 },
  outro: { kind: "blastoutro", w: 540, h: 960 },
};

export const EXHIBIT_STAGE: Record<string, StageSpec> = {
  cycle: { kind: "cycle", w: 900, h: 560 },
  users: { kind: "users", w: 960, h: 560 },
  standards: { kind: "standards", w: 960, h: 540 },
  basis: { kind: "basis", w: 960, h: 560 },
  careers: { kind: "careers", w: 1000, h: 600 },
  classification: { kind: "classification", w: 1100, h: 620 },
};

/** Where stageCardData drops a new element: centred on the stage, nudged up so it
 *  does not bury the choices. Same arithmetic, so the result lands identically. */
export const stagePos = (w: number, h: number, fw: number = STAGE_W, fh: number = STAGE_H) => ({
  x: Math.round((fw - w) / 2),
  // Centred, nudged up so it does not bury the choices — unless it IS the
  // whole frame, in which case it sits at the top-left corner exactly.
  y: w >= fw && h >= fh ? 0 : Math.round((fh - h) / 2) - 60,
});

/** The staged-exhibit node itself. Pure, and exported so the shape is under test
 *  rather than asserted about — a wrong `stage.ceqId` would silently strand the
 *  exhibit on no frame at all, which stays invisible until Lee is on camera. */
/** THE INSERTS THAT ARE WHOLE SLIDES (2026-09-04): the bolt detour stages the
 *  open element bare; an ad stages the ad element. Full-frame like the spine. */
export const INSERT_STAGE: Record<string, StageSpec> = {
  bolt: { kind: "blastopen", w: 540, h: 960 },
  ad: { kind: "blastad", w: 540, h: 960 },
};

export function stagedElementNode(frameNodeId: string, frameId: string, spec: StageSpec, extra: Record<string, unknown> = {}, frame: { w: number; h: number } = { w: STAGE_W, h: STAGE_H }) {
  const at = stagePos(spec.w, spec.h, frame.w, frame.h);
  const card = blankCard(spec.kind as never) as unknown as Record<string, unknown>;
  return {
    id: `blast-el-${frameId}`,
    type: spec.kind,
    position: at,
    data: {
      ...card,
      ...extra,
      // The element's box is the spec's — a spine card handed a full-frame
      // spec fills the frame; blankCard's 540×960 default would not.
      w: spec.w, h: spec.h,
      // THE ATTACHMENT. `stage.ceqId` is how CeqStudio.stagedHere finds an
      // element's frame — not ReactFlow parenting, which is a protected zone.
      stage: { ceqId: frameNodeId, x: at.x, y: at.y, scale: 1 },
      provenance: EL_PROVENANCE,
      blastFrameId: frameId,
    } as Record<string, unknown>,
  };
}

/** An exhibit, by its registry id. Null for an id we do not ship, so a stale
 *  plan stages nothing rather than a broken node. */
export function stagedExhibitNode(frameNodeId: string, frameId: string, exhibitRef: string) {
  const ex = EXHIBIT_STAGE[exhibitRef];
  return ex ? stagedElementNode(frameNodeId, frameId, ex) : null;
}

/** Ten apart, so Lee can still hand-insert a frame between two in the canvas
 *  without forcing a renumber of everything after it. */
const orderAt = (i: number) => (i + 1) * 10;

export const syncBlastPlanToSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frames: z.array(frameIn).min(1).max(400),
    // THE FRAMES ARE THE SLIDES (Lee, 2026-09-03): v3 films vertical, so the
    // spine cards fill a 900×1600 frame edge to edge instead of sitting as a
    // 540×960 card at the landscape stage's centre.
    vertical: z.boolean().default(true),
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
    const deckRow = (j.decks ?? []).find((d) => d.id === data.setId) as ({ id: string; name?: string; world?: string; layoutV?: Record<string, unknown> } | undefined);
    const setName = deckRow?.name ?? "";
    // The set's vertical baseline follows the same spot, so a card added later
    // deals where the rest of the rip sits.
    if (deckRow) deckRow.layoutV = { ...(deckRow.layoutV ?? {}), card: verticalCardSpot() };
    // THE BACKDROP (Lee, 2026-09-03: "when filming in the capture mode, I lost
    // the background"). The film frame paints deck.world and a set with none
    // is flat near-black. A set arriving from Blast Off gets the calm default
    // if it has no world yet; View ▸ World in the studio changes it per set.
    if (deckRow && !deckRow.world) {
      const { DEFAULT_WORLD } = await import("@/components/canvas/worlds");
      deckRow.world = DEFAULT_WORLD;
    }

    let wrote = 0, reordered = 0, missing = 0, staged = 0;
    const planned = new Set<string>();   // frame nodes the plan accounts for
    const stagedEls = new Set<string>(); // element nodes staged onto those frames

    // THE BACKDROP RULE, resolved against the set: which frames keep the bolt
    // zoom running (quietly behind the intro, inside the wordmark on the
    // opening summary) — see backdropFor in blastoff/plan.ts.
    const noteOnlyOf = (ceqId: string): boolean => !!(j.nodes!.find((n) => n.id === ceqId)?.data as { noteOnly?: boolean } | undefined)?.noteOnly;
    const openVariant = data.frames.find((f) => f.kind === "open")?.variant ?? "zoom";

    data.frames.forEach((f, i) => {
      const stageOrder = orderAt(i);
      const bd = backdropFor(data.frames, i, noteOnlyOf);
      const filmBackdrop = bd === "backdrop" || bd === "knockout" ? bd : undefined;

      // A card the set already owns: renumber it in place. Its content, its
      // choices, its layout and its authoring history are none of our business.
      // SKIPPED IN REVIEW (2026-09-03): the card keeps its place and gets
      // data.filmSkip — the studio's walk and student practice leave it out;
      // un-skipping on the review deck and sending again clears it.
      if (f.kind === "ceq") {
        const node = f.ceqId ? j.nodes!.find((n) => n.id === f.ceqId) : undefined;
        if (!node?.data) { missing++; return; }
        node.data.stageOrder = stageOrder;
        node.data.slotIndex = stageOrder;
        if (f.skipped) node.data.filmSkip = true; else delete node.data.filmSkip;
        if (filmBackdrop) { node.data.filmBackdrop = filmBackdrop; node.data.filmVariant = openVariant; } else { delete node.data.filmBackdrop; delete node.data.filmVariant; }
        if (f.banner === "on") node.data.filmBanner = true; else delete node.data.filmBanner;
        // THE VERTICAL SPOT (2026-09-03): every card of the rip sits centred on
        // the 9:16 frame, dealt big — replacing any spot saved in a landscape
        // session. Landscape geometry (data.geom) is left alone.
        node.data.geomV = { ...((node.data.geomV as Record<string, unknown> | undefined) ?? {}), card: verticalCardSpot(typeof node.data.cardW === "number" ? node.data.cardW : undefined) };
        planned.add(node.id);
        reordered++;
        return;
      }
      // A skipped insert is simply not written (and, being unplanned, is removed below).
      if (f.skipped) return;

      // A card Lee inserted here: upsert it as a real note frame.
      const nodeId = `blast-${f.id}`;
      const pos = { x: 520, y: 210 };
      const kindTag = INSERT_CALLOUT[f.kind];
      // WHAT THIS FRAME STAGES. The standard spine stages its vertical 9:16 card;
      // an exhibit frame stages the exhibit. Either way the frame's own callout is
      // HIDDEN — the staged element is the content, and a second card underneath
      // it reading "Exhibit: cycle" or "Bio" would just be in the shot.
      // THE BIO IS A CARD NOW (2026-09-03), not a staged 9:16 brand frame: the
      // tutor callout in the detour format. STANDARD_STAGE.bio stays for the
      // Add menu and old scenes; a re-send removes the old staged bio element
      // (unplanned blast-off provenance is deleted below).
      const spec: StageSpec | undefined =
        f.kind === "bio" ? undefined : STANDARD_STAGE[f.kind] ?? INSERT_STAGE[f.kind] ?? (f.kind === "exhibit" && f.exhibitRef ? EXHIBIT_STAGE[f.exhibitRef] : undefined);
      // BULLETS (2026-09-03) ride as the callout's extra stems — the canvas
      // card already draws those under the main phrase, in film and in study.
      const bullets = (f.bullets ?? []).map((b) => b.trim()).filter(Boolean);
      const callout: Record<string, unknown> | undefined =
        // showTopic false (Lee, 2026-09-03: "it says Memorize This AND Found
        // on your exam") — a detour card carries its kind label, nothing else.
        f.kind === "bio" ? (bioCallout() as Record<string, unknown>)
        : f.kind === "blank" || spec ? { hidden: true } : kindTag ? { kind: kindTag, showTopic: false, detour: true, ...(bullets.length ? { extraStems: bullets } : {}) } : undefined;

      const dataObj: Record<string, unknown> = {
        kind: "ceq",
        title: setName,
        prompt: promptFor(f, setName),
        noteOnly: true,          // the canvas's own contract for a non-question frame
        // The bookends are the canvas's own intro/outro frame modes; everything
        // else — bio included — is a note, which is the canvas's word for "a frame
        // with no choices that the question counter never counts".
        frameMode: f.kind === "intro" ? "intro" : f.kind === "outro" ? "outro" : "note",
        choices: [],
        ...(callout ? { callout } : {}),
        // The tutor card is a bit bigger than a detour card.
        ...(f.kind === "bio" ? { cardW: BIO_CARD.cardW } : {}),
        // Centred on the vertical frame, like every other card of the rip.
        geomV: { card: verticalCardSpot(f.kind === "bio" ? BIO_CARD.cardW : undefined) },
        ...(filmBackdrop ? { filmBackdrop, filmVariant: openVariant } : {}),
        ...(f.banner === "on" ? { filmBanner: true } : {}),
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

      // STAGE THE FRAME'S OWN CARD onto it — the vertical intro/bio/outro, or
      // the exhibit.
      if (spec) {
        const elId = `blast-el-${f.id}`;
        const el = j.nodes!.find((n) => n.id === elId);
        stagedEls.add(elId);
        const spine = !!STANDARD_STAGE[f.kind] || !!INSERT_STAGE[f.kind];
        // THE SPINE FILLS THE VERTICAL FRAME (2026-09-03): the open / intro /
        // outro cards are the whole slide — 900×1600 at (0,0) — and are re-stamped
        // on every send so an old landscape placement never lingers. Exhibits
        // stay Lee's: once staged, a re-sync does not move or resize them.
        const frame = data.vertical ? { w: 900, h: 1600 } : { w: STAGE_W, h: STAGE_H };
        const specHere: StageSpec = spine && data.vertical ? { ...spec, w: frame.w, h: frame.h } : spec;
        if (el && el.type === spec.kind && !spine) { staged++; return; }
        // The intro card names the set it is about to blast off on; the cold open
        // carries its look; the rest carry their own copy in the frame component.
        // The intro over the cold open's backdrop goes transparent — the
        // backdrop is its ground; alone it keeps its navy.
        const extra = f.kind === "intro" ? { topic: f.text?.trim() || setName, tutor: "Lee Ingram", tutorLine: f.title?.trim() || undefined, domain: f.url?.trim() || undefined, banner: f.banner !== "off", transparent: filmBackdrop === "backdrop" }
          : f.kind === "open" ? { psych: f.psych ?? 0.1, variant: f.variant ?? "zoom", banner: f.banner !== "off", tagline: f.text?.trim() || undefined, domain: f.url?.trim() || undefined }
          : f.kind === "bolt" ? { bare: true, psych: f.psych ?? 0.1, variant: f.variant ?? "zoom", banner: false }
          : f.kind === "ad" ? { ad: f.ad ?? "greek", label: f.text, headline: f.title, lines: f.bullets, url: f.url }
          : {};
        const made = stagedElementNode(nodeId, f.id, specHere, extra, frame);
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
