// THE CRAM PATH AND ITS OFFSHOOTS — which lane a set is on.
//
// Lee, 2026-09-09, after his first three shorts: "I think they'll perform better if I keep
// sticking to the cram path and I tell them up front this is a cram video not a teaching video…
// but the one for Equity I was like hey this is a teaching video more than a cram. I think I just
// need to always be cram, but if you want to learn more about this I will teach you about it —
// hit this link… I'm focusing on cram videos most of the time but I love to make teaching videos
// too, that's how you go from a B to an A."
//
// So a set is on one of three lanes:
//   cram      the main path — short, fast, "this is what's on the exam". THE DEFAULT.
//   offshoot  the teaching / go-deeper video that hangs off a cram set. More examples, more
//             thought, still under three minutes. Saved for after the cram path is finished.
//   pitch     a video that sells something (chapters, campus reps) hanging off a cram set.
//
// ABSENT MEANS CRAM. That is the invariant every reader relies on, and it is why this is safe to
// add to a live bank: no deck carries the field today, so nothing changes until Lee marks a set.
// The map draws pitches on the LEFT, the cram path down the MIDDLE, offshoots on the RIGHT —
// his own picture of it.
//
// NOT the strategy board's lane (lib/strategy.ts ShortLane), which is an AUDIENCE (reps, chairs,
// students). Same word, different axis; they never meet.
//
// Pure and dependency-free: types.ts imports the type, so this module must stay clean.

export const DECK_LANES = ["cram", "offshoot", "pitch"] as const;
export type DeckLane = (typeof DECK_LANES)[number];

/** A branch lane hangs off a cram set; cram hangs off nothing. */
export const BRANCH_LANES: readonly DeckLane[] = ["offshoot", "pitch"];

export function isDeckLane(v: unknown): v is DeckLane {
  return typeof v === "string" && (DECK_LANES as readonly string[]).includes(v);
}

/** The lane of a deck (or anything shaped like one). Absent, null, misspelt, a number — all read
 *  as "cram", because the whole bank is the cram path until Lee says otherwise. */
export function laneOf(d: { lane?: unknown } | null | undefined): DeckLane {
  return d && isDeckLane(d.lane) ? d.lane : "cram";
}

/** True when this lane hangs off a parent — the two that need a `branchFrom`. */
export function isBranchLane(lane: DeckLane): boolean {
  return lane !== "cram";
}

/** What Lee sees. The student-facing word for an offshoot is never "offshoot" — see
 *  OFFSHOOT_STUDENT_LABEL below. */
export const LANE_LABEL: Record<DeckLane, string> = {
  cram: "Cram path",
  offshoot: "Offshoot",
  pitch: "Pitch",
};

/** The short uppercase chip on a queue row. Cram gets none — it is the default and a chip on
 *  every row would say nothing. */
export function laneChip(lane: DeckLane): string | null {
  return lane === "cram" ? null : lane.toUpperCase();
}

/** One line under the picker, per lane, in Lee's terms. */
export const LANE_HINT: Record<DeckLane, string> = {
  cram: "The main path. Short and fast — what's on the exam, nothing else.",
  offshoot: "The teaching video that hangs off a cram set. More examples, more thought, still under three minutes.",
  pitch: "A video that sells something — chapters, campus reps — hanging off a cram set.",
};

/** What a student is offered, if an offshoot ever reaches them. Lee: "that's how you go from a B
 *  to an A" — never the token. */
export const OFFSHOOT_STUDENT_LABEL = "Take it to an A";

/** Where a branch may hang: a cram set in the same topic, never itself, never another branch (one
 *  level deep by construction). Returns the reason it cannot, or null when it can. */
export function branchProblem(
  child: { id: string },
  parentId: string,
  topicSets: readonly { id: string; lane?: unknown }[],
): string | null {
  if (!parentId) return "Pick the cram set this hangs off.";
  if (parentId === child.id) return "A set cannot hang off itself.";
  const parent = topicSets.find((s) => s.id === parentId);
  if (!parent) return "That set is not in this topic.";
  if (laneOf(parent) !== "cram") return "It can only hang off a set on the cram path.";
  return null;
}
