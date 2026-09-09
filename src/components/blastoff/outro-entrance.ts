// THE OUTRO ENTRANCE — the bookend to the cold open's assembly.
//
// Lee, 2026-09-08, having just retired "Cram what's on your exam." from the cold open and kept
// it on the outro: "Cram what's on your exam is an outro card only for now. THAT is the slide
// that needs entrance animation too."
//
// The outro HAD a choreography already (SurviveOutro's reveal(progress, …) stack, and the white
// arrival flash — Lee, 2026-09-06: "the final transition to outro should be a white flash type
// emoji — like this came out of heaven"). It was simply never running: every reveal is a pure
// function of `progress`, `reveal` returns 1 when progress is undefined, and the deck's
// FrameView passes no progress. So on /film and /results the outro was a hard cut onto a
// finished card. That path stays exactly as it is — it is what an offline frame renderer and a
// pinned still need. This module is the LIVE path, and it works the way cold-open.ts does: one
// keyframe, per-piece delays, so the beats are data and the whole thing costs one <style>.
//
// THE SYMMETRY, and it is the point. The cold open assembles around the camera and the WORDMARK
// lands hard (the defibrillator). The outro assembles around the wordmark and the CTA PILL lands
// hard — same gesture, other end of the video, and the hard landing is on the thing being asked
// for. The chain lightning then has something to strike.
import { HARD_EASE, SOFT_EASE } from "@/components/brand-cards/cold-open";

/** The pieces, in the order they arrive. */
export const OUTRO_KEYS = ["wordmark", "tagline", "domain", "cta", "sub"] as const;
export type OutroKey = (typeof OUTRO_KEYS)[number];

export interface OutroBeat {
  key: OutroKey;
  /** ms from the top of the entrance. */
  atMs: number;
  durMs: number;
  /** The one hard landing: the CTA pill. */
  hard?: boolean;
}

/** Short — this is the last thing before the video ends, not a title sequence.
 *
 *  HALVED 2026-09-09. Lee: "outro slide animation can be much faster. The CTA button needs to
 *  arrive quicker." The whole video runs faster now (the cold open is 3 s, not 10), and the
 *  outro is the ask — a viewer who has decided to tap should not be waiting on a lockup to
 *  finish assembling before the button exists. */
export const OUTRO_ENTRANCE_MS = 1_150;
/** The white-out that marks the arrival, already fading before the wordmark reads. */
export const OUTRO_FLASH_MS = 220;
/** How far the lines travel, in stage px (V.h = 1920). Bigger than riseIn's 18 — that is a
 *  settle, this is an entrance. */
export const OUTRO_RISE_PX = 48;

/** The beat sheet. The hold between the domain and the pill survives the compression — the eye
 *  finishes the lockup and THEN the ask lands on its own beat, which is what makes it read as an
 *  ask rather than as the last line of a list. It is a breath now rather than a pause. */
export const OUTRO_BEATS: readonly OutroBeat[] = [
  { key: "wordmark", atMs: 0, durMs: 340 },
  { key: "tagline", atMs: 200, durMs: 300 },
  { key: "domain", atMs: 340, durMs: 260 },
  { key: "cta", atMs: 740, durMs: 340, hard: true },
  { key: "sub", atMs: 950, durMs: 200 },
];

export function outroBeat(key: OutroKey): OutroBeat {
  const b = OUTRO_BEATS.find((x) => x.key === key);
  if (!b) throw new Error(`outro-entrance: no beat "${key}"`);
  return b;
}

/** Nothing may finish after the entrance is over — the card has to be at rest before Lee's last
 *  word lands on it, and a piece still moving under a burned caption reads as a glitch. */
export function entranceEndsMs(): number {
  return Math.max(...OUTRO_BEATS.map((b) => b.atMs + b.durMs));
}

export const OUTRO_CLASS = "sa-oe";
export function outroClass(key: OutroKey): string { return `sa-oe-${key}`; }

/** The stylesheet. `rise` is the travel in the SAME px the stage is laid out in, so the caller
 *  hands in stage px and never a scaled value — the transform rides the stage's own scale.
 *
 *  `--sa-oe-o` is the RESTING opacity: the domain sits at 0.6 and the three words at 0.7, and a
 *  keyframe ending at a flat 1 would quietly brighten both the moment the entrance finished.
 *  Each piece declares its own; the default is 1. */
export function outroEntranceCss(rise: number = OUTRO_RISE_PX): string {
  const r = Math.max(0, Math.round(rise));
  const rule = (b: OutroBeat) =>
    `.${outroClass(b.key)} { animation-delay: ${b.atMs}ms; animation-duration: ${b.durMs}ms; animation-timing-function: ${b.hard ? HARD_EASE : SOFT_EASE}; }`;
  return `
@keyframes sa-oe-in { from { opacity: 0; transform: translate3d(0, var(--sa-oe-y, ${r}px), 0); } to { opacity: var(--sa-oe-o, 1); transform: translate3d(0, 0, 0); } }
@keyframes sa-oe-word { from { opacity: 0; transform: scale(0.94); } to { opacity: var(--sa-oe-o, 1); transform: scale(1); } }
@keyframes sa-oe-flash { from { opacity: 1; } to { opacity: 0; } }
.${OUTRO_CLASS} { animation-name: sa-oe-in; animation-fill-mode: both; will-change: transform, opacity; --sa-oe-y: ${r}px; }
.${outroClass("wordmark")} { animation-name: sa-oe-word; }
${OUTRO_BEATS.map(rule).join("\n")}
.sa-oe-flash { animation: sa-oe-flash ${OUTRO_FLASH_MS}ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .${OUTRO_CLASS} { --sa-oe-y: 0px; }
  .sa-oe-flash { animation: none; opacity: 0; }
}
`;
}
