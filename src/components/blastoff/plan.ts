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

/** EVERY frame kind, as one list. The Zod schema in blastoff.functions.ts is
 *  derived from this rather than retyped — the spine kinds were once added to
 *  the type and not the schema, and every set with a real spine failed to load. */
export const BLAST_FRAME_KINDS = [
  "intro", "bio", "outro",                                 // the standard spine
  "ceq",                                                   // a card the set owns
  "phrase", "cheat", "tip", "exhibit", "blank",            // what Lee inserts
] as const;

export type BlastFrameKind = (typeof BLAST_FRAME_KINDS)[number];

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
  /** THE REVIEW STEP (Lee, 2026-09-03: "quickly remove a CEQ slide"). A card
   *  the set owns cannot leave the plan — reconcile would put it straight
   *  back — so removing it here SKIPS it: it stays in the list, greyed, and
   *  film mode walks past it. Un-skip to film it again. Inserts are simply
   *  removed. */
  skipped?: boolean;
  /** BULLETS under the callout (Lee, 2026-09-03: "Memorize this / Internal
   *  Users / Management / Budgets, costs, forecasts…"). The main phrase is
   *  highlighted; these sit under it. Empty lines are ignored at render. */
  bullets?: string[];
  /** THE TELEPROMPTER COLUMN (Lee, 2026-09-03: "a third slide to the right
   *  of the current one … the teleprompter … THESE SUGGESTED PHRASES ARE
   *  ME"). The lines Lee kept for this slide — his own transcript words,
   *  proofread — shown beside the slide in film mode. */
  prompter?: string[];
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

/** THE STANDARD SPINE. Every Blast Off opens the same way and closes the same
 *  way — intro, then the set, then the bio slot, then the sign-off. Lee, on
 *  finding them missing: "We want to have the same standardized frames set up
 *  for each blast-off."
 *
 *  These are GUARANTEED, not pinned: reconcile puts a missing one back at its
 *  canonical spot, but never drags one Lee has deliberately moved. And they
 *  cannot be deleted — a Blast Off without a sign-off is a mistake, not a
 *  choice. The bio slot is deliberately its own frame rather than part of the
 *  outro: same position every video means it can later hold the chapter ask or
 *  the rep ask instead, filmed once and dropped in at the edit. */
export const STANDARD_KINDS = ["intro", "bio", "outro"] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

export const isStandard = (k: BlastFrameKind): k is StandardKind =>
  (STANDARD_KINDS as readonly string[]).includes(k);

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
  intro: "Intro",
  bio: "Bio slot",
  outro: "Outro",
  ceq: "Set card",
  // Lee's 09-03 standard kinds, one to one with the canvas callouts.
  phrase: "Memorize this",
  cheat: "Cheat code",
  tip: "Deeper idea",
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
    frames: [
      { id: newFrameId("intro"), kind: "intro" as const },
      ...filmable(ceqs).map((c) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId: c.id })),
      { id: newFrameId("bio"), kind: "bio" as const },
      { id: newFrameId("outro"), kind: "outro" as const },
    ],
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

  // THE SPINE IS GUARANTEED. A plan written before these existed, or one where a
  // frame was lost, gets the missing piece back at its canonical spot — the
  // intro leading, the bio and sign-off closing. One that Lee already moved is
  // left exactly where he put it.
  if (!frames.some((f) => f.kind === "intro")) frames.unshift({ id: newFrameId("intro"), kind: "intro" });
  if (!frames.some((f) => f.kind === "bio")) frames.push({ id: newFrameId("bio"), kind: "bio" });
  if (!frames.some((f) => f.kind === "outro")) frames.push({ id: newFrameId("outro"), kind: "outro" });

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

// ---- THE REVIEW STEP's verbs (2026-09-03) ----------------------------------

/** "Remove" as Lee means it: an insert goes; a card the set owns is SKIPPED
 *  (kept in the list, greyed, not filmed). The spine — intro, bio, outro —
 *  can be skipped too: a rip that opens on a cheat code is his call. */
export function dropFrame(frames: readonly BlastFrame[], id: string): BlastFrame[] {
  const f = frames.find((x) => x.id === id);
  if (!f) return [...frames];
  if (isInsert(f.kind)) return removeFrame(frames, id);
  return frames.map((x) => (x.id === id ? { ...x, skipped: true } : x));
}

/** Skip ↔ film again. */
export const toggleSkip = (frames: readonly BlastFrame[], id: string): BlastFrame[] =>
  frames.map((x) => (x.id === id ? { ...x, skipped: !x.skipped } : x));

/** A copy right after the original, with its own id. A duplicated CEQ frame
 *  films the same card twice (a callback, a recap) — the set is untouched. */
export function duplicateFrame(frames: readonly BlastFrame[], id: string): BlastFrame[] {
  const i = frames.findIndex((x) => x.id === id);
  if (i < 0) return [...frames];
  const src = frames[i];
  const copy: BlastFrame = { ...src, id: newFrameId(src.kind), prompter: src.prompter ? [...src.prompter] : undefined };
  return insertFrame(frames, copy, i);
}

/** What actually films: every frame that is not skipped. Capture, the
 *  question counter and the send-to-film handoff all read THIS, never the
 *  raw list, so a skipped card can never sneak into a take. */
export const filmFrames = (frames: readonly BlastFrame[]): BlastFrame[] => frames.filter((f) => !f.skipped);

/** Write one frame's fields; the rest of the plan is untouched. */
export const patchFrame = (frames: readonly BlastFrame[], id: string, patch: Partial<BlastFrame>): BlastFrame[] =>
  frames.map((x) => (x.id === id ? { ...x, ...patch } : x));

/** THE DETOUR CARD'S WORDS. An insert films as a dark card between the bright
 *  CEQ cards, and the thing that makes it read at short-form speed is ONE
 *  highlighted key phrase: a cheat code's rule, a phrase itself. Lee's own
 *  ==marks== win when he typed any; otherwise the phrase is marked here, once,
 *  so the Blast Off preview and the frame the sync writes cannot disagree.
 *  A tip stays plain — it is an aside, not a rule. */
export function insertStem(f: BlastFrame): string {
  const mark = (s: string): string => (s.includes("==") ? s : `==${s}==`);
  if (f.kind === "cheat") {
    const title = f.title?.trim() ?? "";
    const body = f.body?.trim() ?? "";
    return [title ? mark(title) : "", body].filter(Boolean).join("\n");
  }
  // A deeper idea highlights its main phrase too now (Lee, 2026-09-03: "main
  // phrase can be highlighted" for all three kinds, with bullets under it).
  if (f.kind === "phrase" || f.kind === "tip") { const t = f.text?.trim() ?? ""; return t ? mark(t) : ""; }
  if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
  return f.text?.trim() ?? "";
}

/** The bullets that actually render: trimmed, blanks dropped. */
export const frameBullets = (f: BlastFrame): string[] => (f.bullets ?? []).map((b) => b.trim()).filter(Boolean);

/** How many real takes this plan is — what Lee is about to talk through. */
export const frameCount = (plan: BlastPlan): number => filmFrames(plan.frames).length;
