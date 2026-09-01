// THE BLAST OFF PLAN — the ordered list of frames Lee films for one set.
//
// WHAT A PLAN IS (corrected 2026-08-31): the set's OWN frames, in the order
// they will be filmed, plus whatever Lee inserted between them.
//
// The first version of this file invented an intro, a "found on your exam" and
// an outro for every set, and filtered the set's note-only cards OUT. That was
// wrong twice over: the sets ALREADY ship authored intro/outro cards (they are
// note-only CEQ nodes, e.g. `ceq-e1s-1-3-intro`), so every sync wrote a second
// pair of bookends that duplicated them and sorted ahead of the questions.
// Lee's verdict on the generated ones: "forget found on your exam, it's wrong."
//
// So: nothing here is generated any more. A frame is either a card the set
// already owns (kind "ceq" — questions AND authored notes alike, referenced by
// its canvas node id) or a card Lee inserted here (phrase / cheat / tip /
// exhibit / blank). The canvas is the renderer; this is only the running order.
//
// Pure: no React, no network. The route renders what these functions return.

export type BlastFrameKind = "ceq" | "phrase" | "cheat" | "tip" | "exhibit" | "blank";

export interface BlastFrame {
  id: string;
  kind: BlastFrameKind;
  /** kind "ceq" — the canvas node id of the set's own card (question or note). */
  ceqId?: string;
  /** phrase / tip / blank body. */
  text?: string;
  /** cheat code. */
  title?: string;
  body?: string;
  /** exhibit frame — which shipped exhibit. */
  exhibitRef?: string;
  /** Talkthrough bank item this came from, when picked rather than typed. */
  bankItemId?: string;
}

export interface BlastPlan {
  frames: BlastFrame[];
  updatedAt: string;
}

/** Frames Lee inserted here, as opposed to cards the set already owns. Only
 *  these can be deleted from a plan — removing a card the set owns would mean
 *  not filming it, which is a set edit, not a running-order edit. */
export const INSERT_KINDS: readonly BlastFrameKind[] = ["phrase", "cheat", "tip", "exhibit", "blank"];

export const isInsert = (k: BlastFrameKind): boolean => INSERT_KINDS.includes(k);

/** Inserts become the canvas's OWN callout kinds — a cheat-code frame is the same
 *  card the canvas has always drawn for a cheat code. ONE mapping, imported by both
 *  the Blast Off preview and the sync that writes the frame, so what Lee arranges
 *  and what the canvas renders cannot drift apart. "blank" is deliberately absent:
 *  it is a bare frame (callout hidden), not a kind of callout. */
export const INSERT_CALLOUT: Partial<Record<BlastFrameKind, string>> = {
  cheat: "cheat-code",
  phrase: "memorize-this",
  tip: "deeper-idea",
};

export const FRAME_LABEL: Record<BlastFrameKind, string> = {
  ceq: "Set card",
  phrase: "Phrase",
  cheat: "Cheat code",
  tip: "Tip / Trick",
  exhibit: "Exhibit",
  blank: "Blank",
};

let seq = 0;
export const newFrameId = (kind: BlastFrameKind): string =>
  `bf-${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** A card the set owns, as the bank hands it over — already in stageOrder. */
export interface PlanCeq { id: string; label: string; stem: string; noteOnly?: boolean; draft?: boolean }

/** Cards that belong in a running order: everything the set owns except drafts,
 *  which are unfinished and must never reach a take. Note-only cards DO belong —
 *  they are the set's own intro, outro and breath frames. */
const filmable = (ceqs: readonly PlanCeq[]): PlanCeq[] => ceqs.filter((c) => !c.draft);

/** The spine a set films if Lee changes nothing: its own cards, bank order. */
export function generatePlan(ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  return {
    frames: filmable(ceqs).map((c) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId: c.id })),
    updatedAt: now.toISOString(),
  };
}

/** RECONCILE a stored plan against the set as it is NOW.
 *  · a card added to the set appears, next to its bank neighbour, so it gets filmed
 *  · a card removed from the set drops out, so Lee never films a ghost
 *  · everything Lee inserted or reordered is preserved exactly where he put it
 *
 *  A new card lands after the card that precedes it in BANK order rather than at
 *  the end, so a question added in the middle of a set does not jump behind the
 *  set's own outro.
 */
export function reconcilePlan(plan: BlastPlan | null | undefined, ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  if (!plan?.frames?.length) return generatePlan(ceqs, now);
  const bank = filmable(ceqs);
  const live = new Set(bank.map((c) => c.id));

  // Drop refs to cards the set no longer has; keep every insert untouched.
  const frames = plan.frames.filter((f) => f.kind !== "ceq" || (f.ceqId != null && live.has(f.ceqId)));
  const have = new Set(frames.filter((f) => f.kind === "ceq").map((f) => f.ceqId));

  bank.forEach((c, bankIdx) => {
    if (have.has(c.id)) return;
    // Nearest earlier bank card that IS already placed decides where this goes.
    let anchor = -1;
    for (let b = bankIdx - 1; b >= 0 && anchor < 0; b--) {
      const prev = bank[b].id;
      if (have.has(prev)) anchor = frames.findIndex((f) => f.kind === "ceq" && f.ceqId === prev);
    }
    frames.splice(anchor + 1, 0, { id: newFrameId("ceq"), kind: "ceq", ceqId: c.id });
    have.add(c.id);
  });

  return { frames, updatedAt: now.toISOString() };
}

/** Move a frame one step. Everything is movable now — the set's own intro is
 *  just a card, and if Lee wants a cheat code to open the rip that is his call. */
export function moveFrame(frames: readonly BlastFrame[], from: number, to: number): BlastFrame[] {
  const next = [...frames];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(to, next.length - 1));
  if (target === from) return next;
  const [f] = next.splice(from, 1);
  next.splice(target, 0, f);
  return next;
}

/** Drop a new frame in after `afterIndex`. */
export function insertFrame(frames: readonly BlastFrame[], frame: BlastFrame, afterIndex: number): BlastFrame[] {
  const next = [...frames];
  next.splice(Math.max(0, Math.min(afterIndex + 1, next.length)), 0, frame);
  return next;
}

/** Remove an inserted frame. A card the set owns cannot be removed from here —
 *  it stays, because the set still has it and it still has to be filmed. */
export const removeFrame = (frames: readonly BlastFrame[], id: string): BlastFrame[] =>
  frames.filter((f) => (f.id === id ? !isInsert(f.kind) : true));

/** How many real takes this plan is — what Lee is about to talk through. */
export const frameCount = (plan: BlastPlan): number => plan.frames.length;
