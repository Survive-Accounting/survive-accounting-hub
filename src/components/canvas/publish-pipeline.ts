// PUBLISH PIPELINE (pure) — the take-board decisions behind "Publish lesson":
// which frame is the INTRO, which frames form the BODY (and in what order), which
// keeper take each body frame ships, what's MISSING, the next version number, the
// Mux passthrough, and whether the keepers' video settings drifted. No I/O — the
// server function feeds it plain data and acts on the result.
import { courseCode, lessonCode } from "./take-naming";
import type { Beat } from "./types";

/** Column order = the space-walk order (Hook · Teach · Model · Check). */
export const BODY_BEAT_ORDER: Beat[] = ["hook", "teach", "model_practice", "check"];

export interface PubFrame {
  id: string;
  beat: Beat;
  subIndex: number;
  /** Marked as the lesson's INTRO (Hook f1 by convention). */
  introTake?: boolean;
  title?: string;
}

export interface PubTake {
  frameId: string;
  keeper: boolean;
  muxPlaybackId: string | null;
  status: string; // "ready" required to ship
  /** Stored resolution for the drift check (from Mux asset metadata). */
  dim?: { w: number; h: number } | null;
}

/** The INTRO frame: the one flagged `introTake`, else Hook subIndex 0 (Hook f1)
 *  by convention. Null only when the lesson has no Hook and nothing flagged. */
export function introFrame(frames: PubFrame[]): PubFrame | null {
  const flagged = frames.find((f) => f.introTake);
  if (flagged) return flagged;
  return frames.filter((f) => f.beat === "hook").sort((a, b) => a.subIndex - b.subIndex)[0] ?? null;
}

/** BODY frames: everything EXCEPT the intro, in column-major order (the order the
 *  lesson is performed / the order they concat). */
export function bodyFrames(frames: PubFrame[], introId: string | null): PubFrame[] {
  return frames
    .filter((f) => f.id !== introId)
    .sort((a, b) => BODY_BEAT_ORDER.indexOf(a.beat) - BODY_BEAT_ORDER.indexOf(b.beat) || a.subIndex - b.subIndex);
}

/** A frame's shipping keeper: the KEEPER take that is ready with a playback id. */
export function keeperOf(takes: PubTake[]): PubTake | null {
  return takes.find((t) => t.keeper && t.status === "ready" && !!t.muxPlaybackId) ?? null;
}

/** Split the body frames into the keepers that will concat and the frames still
 *  MISSING a shippable keeper (so Publish can fail loud, naming them). */
export function collectKeepers(
  frames: PubFrame[],
  keeperByFrame: (frameId: string) => PubTake | null,
): { keepers: { frame: PubFrame; take: PubTake }[]; missing: PubFrame[] } {
  const keepers: { frame: PubFrame; take: PubTake }[] = [];
  const missing: PubFrame[] = [];
  for (const f of frames) {
    const t = keeperByFrame(f.id);
    if (t) keepers.push({ frame: f, take: t });
    else missing.push(f);
  }
  return { keepers, missing };
}

/** Next version = one past the highest existing (RE-PUBLISH bumps, keeps priors). */
export function nextVersion(existing: number[]): number {
  return (existing.length ? Math.max(...existing) : 0) + 1;
}

/** The published lesson's Mux passthrough: "{COURSE}-{LESSON}-v{n}". */
export function lessonPassthrough(course: string | null | undefined, lessonLabel: string | null | undefined, version: number): string {
  return `${courseCode(course)}-${lessonCode(lessonLabel)}-v${version}`;
}

/** Did the keepers' stored video settings drift? (concat/normalize wants one
 *  resolution — a mismatch means a take was recorded with different OBS settings.)
 *  Returns the distinct "WxH" strings seen; length > 1 ⇒ drift. */
export function resolutionSet(dims: (({ w: number; h: number } | null | undefined))[]): string[] {
  return [...new Set(dims.filter(Boolean).map((d) => `${d!.w}x${d!.h}`))];
}
export function hasDrift(dims: (({ w: number; h: number } | null | undefined))[]): boolean {
  return resolutionSet(dims).length > 1;
}

/** Human list of the frames still missing a keeper (for the fail-loud message). */
export function missingLabel(missing: PubFrame[]): string {
  return missing.map((f) => f.title?.trim() || `${f.beat} f${f.subIndex + 1}`).join(", ");
}
