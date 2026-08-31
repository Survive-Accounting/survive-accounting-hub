// THE BLAST OFF PLAN — the ordered list of frames Lee films for one set.
//
// The plan is mostly DERIVED: a set already knows its questions, so a fresh
// plan is intro → found-on-your-exam → the questions in bank order → outro.
// What gets STORED is only what Lee changed — the inserts he dropped in, the
// order he dragged them into, and any text he overrode. That way adding a
// question to a set shows up in the plan instead of silently going unfilmed.
//
// Pure: no React, no network. The route renders what these functions return.

export type BlastFrameKind =
  | "intro" | "foye" | "ceq" | "phrase" | "cheat" | "tip" | "exhibit" | "blank" | "outro";

export interface BlastFrame {
  id: string;
  kind: BlastFrameKind;
  /** kind "ceq" — which question this frame is. */
  ceqId?: string;
  /** phrase / tip / blank body. */
  text?: string;
  /** cheat code. */
  title?: string;
  body?: string;
  /** intro / outro / foye overrides. Absent = generated. */
  topic?: string;
  tagline?: string;
  canonical?: string;
  variations?: string[];
  /** exhibit frame — which shipped exhibit. */
  exhibitRef?: string;
  /** Talkthrough bank item this came from, when picked rather than typed. */
  bankItemId?: string;
}

export interface BlastPlan {
  frames: BlastFrame[];
  updatedAt: string;
}

/** Frames that are content Lee inserted, as opposed to the set's own spine. */
export const INSERT_KINDS: readonly BlastFrameKind[] = ["phrase", "cheat", "tip", "exhibit", "blank"];

export const FRAME_LABEL: Record<BlastFrameKind, string> = {
  intro: "Intro",
  foye: "Found on your exam",
  ceq: "Question",
  phrase: "Phrase",
  cheat: "Cheat code",
  tip: "Tip / Trick",
  exhibit: "Exhibit",
  blank: "Blank",
  outro: "Outro",
};

let seq = 0;
export const newFrameId = (kind: BlastFrameKind): string =>
  `bf-${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export interface PlanCeq { id: string; label: string; stem: string; noteOnly?: boolean; draft?: boolean }

/** The spine a set films if Lee changes nothing. Note-only and draft cards are
 *  not questions, so they never become question frames. */
export function generatePlan(ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  const real = ceqs.filter((c) => !c.noteOnly && !c.draft);
  return {
    frames: [
      { id: newFrameId("intro"), kind: "intro" },
      { id: newFrameId("foye"), kind: "foye" },
      ...real.map((c) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId: c.id })),
      { id: newFrameId("outro"), kind: "outro" },
    ],
    updatedAt: now.toISOString(),
  };
}

/** RECONCILE a stored plan against the set as it is NOW.
 *  · a question added to the bank appears (before the outro), so it gets filmed
 *  · a question removed from the bank drops out, so Lee never films a ghost
 *  · everything Lee inserted, reordered or overrode is preserved exactly
 *  · the intro leads and the outro closes — always, even if a plan got mangled
 */
export function reconcilePlan(plan: BlastPlan | null | undefined, ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  if (!plan?.frames?.length) return generatePlan(ceqs, now);
  const live = new Set(ceqs.filter((c) => !c.noteOnly && !c.draft).map((c) => c.id));

  const kept = plan.frames.filter((f) => f.kind !== "ceq" || (f.ceqId != null && live.has(f.ceqId)));
  const have = new Set(kept.filter((f) => f.kind === "ceq").map((f) => f.ceqId));
  const missing = ceqs
    .filter((c) => !c.noteOnly && !c.draft && !have.has(c.id))
    .map((c) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId: c.id }));

  const body = kept.filter((f) => f.kind !== "intro" && f.kind !== "outro");
  const intro = kept.find((f) => f.kind === "intro") ?? { id: newFrameId("intro"), kind: "intro" as const };
  const outro = kept.find((f) => f.kind === "outro") ?? { id: newFrameId("outro"), kind: "outro" as const };

  return { frames: [intro, ...body, ...missing, outro], updatedAt: now.toISOString() };
}

/** Move a frame. The intro stays first and the outro stays last — a Blast Off
 *  that opens on a cheat code is a mistake, not a choice. */
export function moveFrame(frames: readonly BlastFrame[], from: number, to: number): BlastFrame[] {
  const next = [...frames];
  if (from < 0 || from >= next.length) return next;
  const f = next[from];
  if (f.kind === "intro" || f.kind === "outro") return next;
  const lo = next.findIndex((x) => x.kind !== "intro");
  const hi = next.length - (next[next.length - 1]?.kind === "outro" ? 1 : 0);
  const target = Math.max(lo, Math.min(to, hi - 1));
  next.splice(from, 1);
  next.splice(target > from ? target : target, 0, f);
  return next;
}

/** Drop a new frame in after `afterIndex` (clamped inside the intro/outro). */
export function insertFrame(frames: readonly BlastFrame[], frame: BlastFrame, afterIndex: number): BlastFrame[] {
  const next = [...frames];
  const lo = next.findIndex((x) => x.kind !== "intro");
  const hi = next.length - (next[next.length - 1]?.kind === "outro" ? 1 : 0);
  const at = Math.max(lo, Math.min(afterIndex + 1, hi));
  next.splice(at, 0, frame);
  return next;
}

export const removeFrame = (frames: readonly BlastFrame[], id: string): BlastFrame[] =>
  frames.filter((f) => f.id === id ? f.kind === "intro" || f.kind === "outro" : true);

/** How many real takes this plan is — what Lee is about to talk through. */
export const frameCount = (plan: BlastPlan): number => plan.frames.length;
