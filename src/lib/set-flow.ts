// SET FLOW (08-20) — the ONE stage model both student surfaces share.
//
// A topic is Sets[], and each set is the sequence Cram Blast → Practice → Review:
// see-what's-coming → try-it-yourself → watch-Lee-work-it. This module owns what a
// stage IS and what comes NEXT; the homepage player and /learn render it their own
// way but neither reimplements the walk. Client-safe (types + pure functions only).
import type { StudentSet } from "@/lib/student.functions";

export type SetStage = "cram" | "practice" | "review";

/** A student's position inside a topic — what "continue where you left off" needs. */
export interface FlowPos { setId: string; stage: SetStage }

/** The stages THIS set actually has, in order. Cram always leads; practice exists when the
 *  set has questions; review exists only when a review video actually shipped (hasReview) —
 *  never invented, so a review-less set flows Cram → Practice → next set gracefully. */
export const stagesOf = (s: Pick<StudentSet, "ceqCount" | "hasReview">): SetStage[] => [
  "cram",
  ...(s.ceqCount > 0 ? (["practice"] as const) : []),
  ...(s.hasReview ? (["review"] as const) : []),
];

/** Where a topic starts: Set 1 → Cram (the entry point unless saved progress says otherwise). */
export const firstEntry = (sets: StudentSet[]): FlowPos | null =>
  sets[0] ? { setId: sets[0].id, stage: "cram" } : null;

/** The step after (setId, stage): the set's next stage, else the NEXT set's Cram — each set
 *  begins with its own Cram Blast. Null = the topic is finished. Sets the current surface
 *  can't play (no cram video and no questions) are skipped rather than dead-ending. */
export function nextStep(sets: StudentSet[], setId: string, stage: SetStage): FlowPos | null {
  const i = sets.findIndex((s) => s.id === setId);
  if (i < 0) return null;
  const stages = stagesOf(sets[i]);
  const at = stages.indexOf(stage);
  if (at >= 0 && at + 1 < stages.length) return { setId, stage: stages[at + 1] };
  for (const s of sets.slice(i + 1)) {
    if (s.playbackId || s.ceqCount > 0 || s.access === "paid") return { setId: s.id, stage: "cram" };
  }
  return null;
}

/** 1-based "SET n OF m" numbers for the shell strip. */
export const setIndexOf = (sets: StudentSet[], setId: string): { n: number; of: number } => ({
  n: Math.max(0, sets.findIndex((s) => s.id === setId)) + 1,
  of: sets.length,
});
