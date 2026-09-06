// THE FILM SUMMARY — Lee, 2026-09-05: "film is just capture in window button. Wouldn't hurt if
// it had a estimate range of video length based on how many slides, etc. Just a summary of
// total slides... # of Q's, # of memorize this, # of cheat code, # of deep idea, # of
// illustration, and total production cost." A pre-flight readout for the menu before Lee
// commits to a take, not a page of its own — pure counting + a rough estimate, no network.
import { filmFrames, type BlastFrame } from "./plan";

export interface SlideCounts {
  total: number; questions: number; memorizeThis: number; cheatCode: number; deeperIdea: number; illustrations: number;
}

/** Counts what actually films (filmFrames — skipped slides never make the cut, same rule the
 *  capture and the question counter already use). */
export function slideCounts(frames: readonly BlastFrame[]): SlideCounts {
  const film = filmFrames(frames);
  return {
    total: film.length,
    questions: film.filter((f) => f.kind === "ceq").length,
    memorizeThis: film.filter((f) => f.kind === "phrase").length,
    cheatCode: film.filter((f) => f.kind === "cheat").length,
    deeperIdea: film.filter((f) => f.kind === "tip").length,
    illustrations: film.filter((f) => !!f.illustration?.assetUrl).length,
  };
}

/** A RANGE, not a promise (Lee's own word) — until the production timer has logged enough real
 *  Blast Offs to calibrate a seconds-per-slide figure from actual footage, this is a plain
 *  heuristic: a spoken CEQ or insert slide reads short-form-fast, roughly 8–18s each on camera. */
export function estimatedLengthSeconds(counts: SlideCounts): { lowSeconds: number; highSeconds: number } {
  return { lowSeconds: counts.total * 8, highSeconds: counts.total * 18 };
}

/** "0:48–1:48" — the range, in minutes:seconds, for the summary line. */
export function fmtRange(range: { lowSeconds: number; highSeconds: number }): string {
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${mmss(range.lowSeconds)}–${mmss(range.highSeconds)}`;
}
