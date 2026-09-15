// THE TEASER — the callouts, stacked, revealed one at a time.
//
// Lee, 2026-09-13: "I'm making a bit of a teaser slide... I want one that lets me put in the
// callouts stacked on one another. Common Exam Question! · Cheat Codes · Memorize This · Tricky
// Question · Deeper Idea. Let me reveal these one at a time via click."
//
// The lines are his words (frame.bullets), one chip each, defaulting to that list. Each line takes
// the colour of the callout it names — matched by its words, so "Cheat Codes" is the cheat-code
// green whatever the plural — and a line that names none is gold. On film the chips come in one per
// click (or space); shift+click takes one back; ` puts them all away. Everywhere else — the
// Editor, the thumbnails — the slide is at rest with every chip showing.
//
// Pure: no React.
import type { BlastFrame, BlastFrameKind } from "./plan";

export const TEASER_DEFAULT: readonly string[] = ["Common Exam Question!", "Cheat Codes", "Memorize This", "Tricky Question", "Deeper Idea"];
export const TEASER_MAX = 8;

/** The chips, in order: his lines, else the default list. Blank lines are dropped. */
export function teaserItems(frame: Pick<BlastFrame, "bullets">): string[] {
  const own = (frame.bullets ?? []).map((b) => b.replace(/\t/g, "").trim()).filter(Boolean);
  return (own.length ? own : [...TEASER_DEFAULT]).slice(0, TEASER_MAX);
}

/** Which callout a line names, by its words — for its colour. Null = none (gold). */
export function teaserKindOf(line: string): BlastFrameKind | null {
  const t = line.toLowerCase();
  if (/exam question|common exam|found on your exam/.test(t)) return "found";
  if (/cheat/.test(t)) return "cheat";
  if (/memori[sz]e/.test(t)) return "phrase";
  if (/tricky|trick question/.test(t)) return "tricky";
  if (/deep(er)?\b|go deeper|think like an accountant/.test(t)) return "tip";
  if (/ask yourself/.test(t)) return "ask";
  return null;
}

/** The film walk: step 0 is the empty stack, step N shows N chips. */
export const teaserSteps = (frame: Pick<BlastFrame, "bullets">): number => teaserItems(frame).length + 1;

/** How many chips show at this step — all of them when nothing is walking the slide. */
export function teaserShown(frame: Pick<BlastFrame, "bullets">, step: number | null | undefined): number {
  const n = teaserItems(frame).length;
  if (step === null || step === undefined) return n;
  return Math.max(0, Math.min(n, Math.floor(step)));
}
