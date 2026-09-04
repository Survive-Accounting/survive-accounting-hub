// TALKTHROUGH RESUME — idempotent resume for an interrupted generation pass.
//
// THE PROBLEM. Generation runs in the browser tab (serverless has no worker).
// Two lanes write to the board:
//   · MICRO EDITS — closing an edit stamp (reword / revise choices / anything
//     else) fires ONE draft for that stamp. A set's session can close a dozen.
//     Booth.tsx owns the firing.
//   · THE SYNTHESIS — End Session → Review, one call, one board (talkthrough-
//     review.ts).
// Close the tab mid-pass and the micro drafts that were in flight sit at
// `payload.state === "drafting"` forever — a lie the booth kept repeating
// ("✎ drafting…"), and re-running the whole pass would pay for and duplicate
// every draft that already landed.
//
// THE LAW HERE: PROGRESS IS DERIVED, NEVER COUNTED. The board items are the
// durable, synced record of what a pass produced, so "what is still owed" is
// computed from the store on every read — exactly like the sync queue
// (`syncedAt < updatedAt`). A stored counter can drift from the data; this
// cannot. The one thing the board cannot tell you is what Lee ASKED for, so
// only the pre-flight request rides on the session (TalkSession.generation).
//
// WHAT COUNTS AS DONE. A task whose board item exists and is not still
// "drafting" is done — INCLUDING a failed one. Retrying failures is out of
// scope by design (Lee dismisses and re-runs the whole pass); a resume that
// silently re-billed every failure would be the opposite of idempotent.
import {
  EDIT_STAMPS, canonicalStamp, segmentsInContext, sessionBoard, sessionSegments, sessionTags,
  type BoardItem, type TTDoc, type TalkSession, type TalkTag,
} from "./talkthrough";

export type GenTaskKind = "ceq_edit" | "synthesis";

/** done = the board already has it (or it failed, which stays failed) ·
 *  interrupted = an item exists but never got its result (a killed tab) ·
 *  pending = nothing was ever written for it. */
export type GenTaskStatus = "done" | "failed" | "interrupted" | "pending";

export interface GenTask {
  /** Stable within the session: the stamp's tag id, or "synthesis". */
  key: string;
  kind: GenTaskKind;
  sessionId: string;
  /** What the resume bar prints. */
  label: string;
  status: GenTaskStatus;
  /** The board item that already covers this task, if any. */
  item: BoardItem | null;
  // ---- ceq_edit only
  tagId?: string;
  ceqId?: string;
  ceqLabel?: string | null;
  stamp?: string;
  /** The verbatim words spoken inside the stamp's window — the instruction. */
  instruction?: string;
}

/** A task still owed work: never started, or started and interrupted. */
export const isResumable = (t: GenTask): boolean => t.status === "pending" || t.status === "interrupted";

// ------------------------------------------------------------- micro edits

const payloadOf = (b: BoardItem): Record<string, unknown> => (b.payload ?? {}) as Record<string, unknown>;
const strOf = (v: unknown): string => (typeof v === "string" ? v : "");

/** Does this board item already cover this stamp's draft?
 *
 *  Drafts fired from 2026-09-04 on carry `payload.tagId`, so the match is
 *  exact. Older drafts have no tagId — for those we fall back to {ceq, stamp},
 *  which can only ever OVER-match (two reword stamps on one question in one
 *  session look like one). Over-matching skips a draft; under-matching
 *  duplicates and re-bills one. Skipping is the safe side of that trade, and
 *  the stamp is still on the board for Lee to regenerate by hand. */
export function matchesEditTask(b: BoardItem, task: { tagId?: string; ceqId?: string; stamp?: string }): boolean {
  if (b.kind !== "ceq_edit" || b.archivedAt) return false;
  const p = payloadOf(b);
  const tagId = strOf(p.tagId);
  if (tagId) return !!task.tagId && tagId === task.tagId;
  return !!task.ceqId && strOf(p.ceqId) === task.ceqId && strOf(p.stamp) === (task.stamp ?? "");
}

export const findEditItem = (board: BoardItem[], task: { tagId?: string; ceqId?: string; stamp?: string }): BoardItem | null =>
  board.find((b) => matchesEditTask(b, task)) ?? null;

/** The status an existing draft implies. A synthesis-minted ceq_edit has
 *  state "ready"; anything unrecognised is treated as landed, because an item
 *  on the board is content Lee can see and act on. */
export function statusOfEditItem(item: BoardItem | null): GenTaskStatus {
  if (!item) return "pending";
  const state = strOf(payloadOf(item).state);
  if (state === "drafting") return "interrupted";
  if (state === "error") return "failed";
  return "done";
}

/** Is this tag a CLOSED edit-stamp context — i.e. one micro draft's worth of
 *  work? Open contexts are excluded: Lee is still talking inside them. */
export function isClosedEditStamp(t: TalkTag): boolean {
  if (t.archivedAt || t.source !== "tap" || t.starred || !t.endedAt) return false;
  const stamp = canonicalStamp(t.tag);
  if (!stamp || !(EDIT_STAMPS as readonly string[]).includes(stamp)) return false;
  // Exhibit talk anchors to `exhibit:<id>` — there is no CEQ to edit there.
  return !!t.focusedCeqId && !t.focusedCeqId.startsWith("exhibit:");
}

/** Every micro-edit task this session implies, in stamp order, each carrying
 *  the board item that already covers it (if any) and therefore its status. */
export function editTasksFor(doc: TTDoc, sessionId: string): GenTask[] {
  const segs = sessionSegments(doc, sessionId);
  const board = sessionBoard(doc, sessionId);
  const out: GenTask[] = [];
  for (const t of sessionTags(doc, sessionId)) {
    if (!isClosedEditStamp(t)) continue;
    const instruction = segmentsInContext(segs, t).map((s) => s.text.trim()).filter(Boolean).join(" ");
    if (!instruction) continue; // nothing said inside the stamp — nothing to draft
    const stamp = canonicalStamp(t.tag)!;
    const key = { tagId: t.id, ceqId: t.focusedCeqId!, stamp };
    const item = findEditItem(board, key);
    out.push({
      key: t.id, kind: "ceq_edit", sessionId, ...key,
      ceqLabel: t.focusedCeqLabel ?? null,
      instruction,
      label: `edit · ${t.focusedCeqLabel ?? t.focusedCeqId}`,
      status: statusOfEditItem(item),
      item,
    });
  }
  return out;
}

// -------------------------------------------------------------- synthesis

/** The End Session pass, as a task — only once Lee has actually asked for it.
 *  A script item on the board means it landed, whatever the session says (the
 *  board is the truth; `generation` is only the request). */
export function synthesisTaskFor(doc: TTDoc, session: TalkSession): GenTask | null {
  const g = session.generation;
  if (!g?.requestedAt) return null;
  const board = sessionBoard(doc, session.id);
  const landed = board.some((b) => b.kind === "script");
  const base = {
    key: "synthesis", kind: "synthesis" as const, sessionId: session.id,
    label: "the review board", item: null,
  };
  if (landed || g.completedAt) return { ...base, status: "done" };
  if (g.error) return { ...base, status: "failed" };
  return { ...base, status: "interrupted" };
}

// ------------------------------------------------------------------- plan

export interface GenerationPlan {
  tasks: GenTask[];
  total: number;
  /** done + failed — everything that will not be run again. */
  completed: number;
  /** The tasks a resume would actually run. */
  resumable: GenTask[];
  failed: number;
}

/** Everything this session's generation owes, derived from the store alone. */
export function generationPlan(doc: TTDoc, session: TalkSession): GenerationPlan {
  const tasks = editTasksFor(doc, session.id);
  const synth = synthesisTaskFor(doc, session);
  if (synth) tasks.push(synth);
  const resumable = tasks.filter(isResumable);
  return {
    tasks,
    total: tasks.length,
    completed: tasks.length - resumable.length,
    resumable,
    failed: tasks.filter((t) => t.status === "failed").length,
  };
}

/** The line the Booth prints: "3/8 done · 5 to go". Never invents a total. */
export function progressLabel(plan: GenerationPlan): string {
  if (!plan.total) return "nothing to generate yet";
  const tail = plan.resumable.length ? ` · ${plan.resumable.length} to go` : "";
  const failed = plan.failed ? ` · ${plan.failed} failed` : "";
  return `${plan.completed}/${plan.total} done${tail}${failed}`;
}
