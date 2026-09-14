// BREATHERS — recap beats between videos in a set's sequence (Lee, 2026-09-14).
//
// "A breather is a consolidation moment, not a pause. It restates the single most important thing
// from the video just watched." 2–3 seconds, then on to the next video; a tap skips it. Authored per
// SEQUENCE (the set's posted videos, in order) and stored on the set's deck — never on the video, so
// a video in two sequences doesn't drag its breather along. Nothing is created by default: Lee
// writes them in the authoring view (/v3/breathers) and turns each one live when it's ready.

export const BREATHER_HEADING = "You just learned";
export const BREATHER_BODY_MAX = 140;
/** On screen this long, then the next video. Never 5: past ~3 s it reads as an ad break. */
export const BREATHER_MS = 2600;
/** Soft rules: no run of more than 5 videos without one; never two within 2 videos of each other. */
export const MAX_RUN = 5;
export const MIN_GAP = 2;

export interface Breather {
  id: string;
  /** The publish key of the video it follows (setId, setId#2, …). */
  afterPubKey: string;
  heading: string;
  body: string;
  /** Only live breathers reach students. */
  live: boolean;
  updatedAt: string;
}

/** What a student's player gets: the part index it follows, and the words. */
export interface StudentBreather { afterIndex: number; heading: string; body: string }

export function newBreather(afterPubKey: string, now = new Date()): Breather {
  return { id: `br-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, afterPubKey, heading: BREATHER_HEADING, body: "", live: false, updatedAt: now.toISOString() };
}

/** "3 of 14" — the video just watched, in the sequence. */
export function breatherPosition(afterIndex: number, videoCount: number): string {
  return `${afterIndex + 1} of ${videoCount}`;
}

export interface BreatherWarning { kind: "long_run" | "too_close" | "too_long" | "empty"; message: string; breatherId?: string }

/** The soft warnings for a sequence. `order` is the videos' publish keys in order; a breather after
 *  the last video (nothing follows it) never shows and says so. */
export function breatherWarnings(order: readonly string[], breathers: readonly Breather[]): BreatherWarning[] {
  const out: BreatherWarning[] = [];
  const idx = breathers
    .map((b) => ({ b, i: order.indexOf(b.afterPubKey) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  for (const { b, i } of idx) {
    if (!b.body.trim()) out.push({ kind: "empty", breatherId: b.id, message: `The breather after video ${i + 1} has no text yet — it won't show until it does.` });
    if (b.body.trim().length > BREATHER_BODY_MAX) out.push({ kind: "too_long", breatherId: b.id, message: `The breather after video ${i + 1} is ${b.body.trim().length} characters — keep it under ${BREATHER_BODY_MAX} so it fits.` });
    if (i === order.length - 1) out.push({ kind: "too_close", breatherId: b.id, message: `The breather after the last video never shows — nothing follows it.` });
  }
  for (let k = 1; k < idx.length; k++) {
    if (idx[k].i - idx[k - 1].i < MIN_GAP) out.push({ kind: "too_close", breatherId: idx[k].b.id, message: `Breathers after videos ${idx[k - 1].i + 1} and ${idx[k].i + 1} are within ${MIN_GAP} videos of each other.` });
  }
  // Runs: videos between breathers (and from the start / to the end).
  const cuts = [-1, ...idx.map((x) => x.i), order.length - 1];
  for (let k = 1; k < cuts.length; k++) {
    const run = cuts[k] - cuts[k - 1];
    if (run > MAX_RUN) out.push({ kind: "long_run", message: `Videos ${cuts[k - 1] + 2}–${cuts[k] + 1} run ${run} in a row with no breather (aim for ${MAX_RUN} or fewer).` });
  }
  return out;
}

/** The live breathers a player shows, as part indexes. Empty text never ships. */
export function studentBreathers(order: readonly string[], breathers: readonly Breather[] | null | undefined): StudentBreather[] {
  return (breathers ?? [])
    .filter((b) => b.live && b.body.trim())
    .map((b) => ({ afterIndex: order.indexOf(b.afterPubKey), heading: b.heading.trim() || BREATHER_HEADING, body: b.body.trim() }))
    .filter((b) => b.afterIndex >= 0 && b.afterIndex < order.length - 1)
    .sort((a, b) => a.afterIndex - b.afterIndex);
}

/** Move a breather to follow another video (the authoring view's drag or arrows). */
export function moveBreather(breathers: readonly Breather[], id: string, afterPubKey: string, now = new Date()): Breather[] {
  return breathers.map((b) => (b.id === id ? { ...b, afterPubKey, updatedAt: now.toISOString() } : b));
}
