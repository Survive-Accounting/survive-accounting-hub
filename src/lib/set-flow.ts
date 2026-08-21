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

/** Can a student enter this set at all? Free sets need a cram video OR questions (the CEQ
 *  release ships questions before videos); paid sets are "playable" and the surface gates them. */
export const isPlayable = (s: Pick<StudentSet, "playbackId" | "ceqCount" | "access">): boolean =>
  s.access === "paid" || !!s.playbackId || s.ceqCount > 0;

/** The stages THIS set actually has, in order. Cram leads WHEN its video exists (or the set is
 *  paid — its id is withheld, not absent); practice when the set has questions; review only when
 *  a review video actually shipped (hasReview) — never invented. A video-less free set starts at
 *  practice with the cram slot shown as "coming soon" by the surface. */
export const stagesOf = (s: Pick<StudentSet, "ceqCount" | "hasReview" | "playbackId" | "access">): SetStage[] => {
  const out: SetStage[] = [];
  if (s.playbackId || s.access === "paid") out.push("cram");
  if (s.ceqCount > 0) out.push("practice");
  if (s.hasReview) out.push("review");
  return out.length ? out : ["cram"];
};

/** Where a topic starts: Set 1 → Cram (the entry point unless saved progress says otherwise). */
export const firstEntry = (sets: StudentSet[]): FlowPos | null =>
  sets[0] ? { setId: sets[0].id, stage: stagesOf(sets[0])[0] } : null;

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
    if (isPlayable(s)) return { setId: s.id, stage: stagesOf(s)[0] };
  }
  return null;
}

/** 1-based "SET n OF m" numbers for the shell strip. */
export const setIndexOf = (sets: StudentSet[], setId: string): { n: number; of: number } => ({
  n: Math.max(0, sets.findIndex((s) => s.id === setId)) + 1,
  of: sets.length,
});
