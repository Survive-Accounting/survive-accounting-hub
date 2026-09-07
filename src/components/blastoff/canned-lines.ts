// CANNED INTRO/OUTRO LINES (2026-09-06). Lee: "I want to use these in the teleprompter as
// canned intros/outros... help me ensure I don't use one back to back or too often. Just light
// warnings if I select one." And: "teleprompter really only needs to generate for non
// intro/outro slides... just suggest the intro/outro for me to use and if I want to then I'll
// change it. Much faster to have AI pick it versus me pick it."
//
// So these never go through the AI rehearsal-brief pipeline (rehearsal-brief.ts) at all — they're
// a fixed short list Lee wrote himself, picked for him (weighted, recency-aware), with a light,
// non-blocking warning if the pick repeats too soon or too often. He can always override via the
// dropdown; the warning updates live off whatever is currently selected, not just the auto-pick.
//
// "Intro is two slides too... wordmark and slogan then one with topic name" — one spoken line
// covers BOTH the "open" and "intro" frame kinds (RehearsalReview writes the same text to both,
// so the prompter panel keeps reading correctly whichever of the two is up when the take rolls).
// Usage is still logged ONCE per commit, keyed by slot ("intro"/"outro"/"bio"), not per frame.
//
// BIO joined the same system 2026-09-06 ("can the bio slide too... same process as above. Also,
// I'm planning to try the bio in different places.") — the picker keys off frame.kind === "bio"
// wherever that frame actually sits in the running order, so moving it around never breaks this.
export type CannedSlot = "intro" | "outro" | "bio";

export interface CannedLine {
  id: string;
  slot: CannedSlot;
  /** A short name for the dropdown — never spoken, never filmed. */
  title: string;
  text: string;
  /** Relative pick weight. Default 1. Lee's "Standard" outro is weighted 3 — used about 3x as
   *  often as an unweighted line, not "3 times then rotate." */
  weight?: number;
}

export const CANNED_LINES: readonly CannedLine[] = [
  { id: "intro-easy-points", slot: "intro", title: "Easy Points", text: "A lot of students I tutor miss this on the exam, and it's easy points. I'm Lee, and I want to help you with that." },
  { id: "intro-ten-years", slot: "intro", title: "Ten Years", text: "I've tutored this course for ten years. These are questions students miss all the time — I want to help you not miss them." },
  { id: "intro-boring-but", slot: "intro", title: "Boring But", text: "Most students think this is boring. It's also on your exam. I'll try to make it interesting, but mainly I want to make sure you get all the points." },
  { id: "intro-memorize-this", slot: "intro", title: "Memorize This", text: "If you've got an intro accounting exam coming up, here's what you need to memorize." },
  { id: "outro-standard", slot: "outro", title: "Standard", text: "Hope this helped. Thanks for using Survive.", weight: 3 },
  { id: "outro-more-like-this", slot: "outro", title: "More Like This", text: "That's it. A lot more like this at surviveaccounting.com." },
  { id: "outro-exam1-free", slot: "outro", title: "Exam 1 Free", text: "Exam 1 is completely free. Go get it — surviveaccounting.com." },
  { id: "bio-ten-years", slot: "bio", title: "Ten Years", text: "I've tutored this for 10 years." },
  { id: "bio-1000-students", slot: "bio", title: "1000 Students", text: "I've tutored over 1000 students." },
  { id: "bio-love-helping", slot: "bio", title: "Love Helping", text: "I love helping students in this course." },
  // The fourth bio (2026-09-06, the v5 style workshop, docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md:
  // "no retirements. The bio wants a fourth: 'I taught this course.' Shorter than the others and
  // it lands differently.")
  { id: "bio-taught-this-course", slot: "bio", title: "Taught This Course", text: "I taught this course." },
];

export function cannedLinesFor(slot: CannedSlot, lines: readonly CannedLine[] = CANNED_LINES): CannedLine[] {
  return lines.filter((l) => l.slot === slot);
}

/** WEIGHTED, RECENCY-AWARE PICK. Excludes the single most-recently-used line for this slot from
 *  the pool when there's another option — the actual "not back to back" mechanism, not just a
 *  warning after the fact. `recentLineIds` is newest-first. `rng` defaults to Math.random but
 *  takes an injectable [0,1) source so this is deterministically testable. */
export function pickCannedLine(lines: readonly CannedLine[], slot: CannedSlot, recentLineIds: readonly string[], rng: () => number = Math.random): CannedLine | null {
  const pool = cannedLinesFor(slot, lines);
  if (pool.length === 0) return null;
  const lastId = recentLineIds[0];
  const withoutLast = pool.length > 1 ? pool.filter((l) => l.id !== lastId) : pool;
  const candidates = withoutLast.length > 0 ? withoutLast : pool;
  const total = candidates.reduce((s, l) => s + Math.max(0, l.weight ?? 1), 0);
  if (total <= 0) return candidates[0];
  let r = rng() * total;
  for (const l of candidates) {
    r -= Math.max(0, l.weight ?? 1);
    if (r <= 0) return l;
  }
  return candidates[candidates.length - 1];
}

/** Light, non-blocking heads-up text for whatever is CURRENTLY selected (auto-picked or
 *  hand-picked from the dropdown) — recomputed live, not just once at suggestion time, so
 *  overriding back to a recent line still warns. `recentLineIds` is newest-first. */
export function cannedWarnings(selectedId: string, recentLineIds: readonly string[]): string[] {
  const warnings: string[] = [];
  if (recentLineIds[0] === selectedId) warnings.push("Same as last video.");
  const window = recentLineIds.slice(0, 6);
  const count = window.filter((id) => id === selectedId).length;
  if (window.length >= 3 && count / window.length >= 0.5) warnings.push(`Used ${count} of your last ${window.length}.`);
  return warnings;
}
