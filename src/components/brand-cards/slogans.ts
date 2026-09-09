// THE SLOGANS — the lines Lee says on camera, in ONE place.
//
// Lee (2026-09-08): "I think main thing I'm wanting is more slides to use that captured the
// best stuff I've discussed recently." Then, on which ones: "do the three slogan slides. B to
// an A is the picture, yes. Others just text."
//
// THE WORDING IS EXACT. On the third one: "That slogan just fucking rocks… I will say it word
// for word in outros." So "YT" is never expanded to YouTube, "shorts" stays lowercase, and the
// full stop stays on all three. Because he says them out loud, the slide and the spoken line
// have to be the same words — which is the whole reason they live here rather than being typed
// into a slide, an outro script and a marketing page separately and drifting apart.
//
// Pure data: no React, no network. The slogan slide (plan.ts kind "slogan"), the Review deck's
// one-click inserts, the outro copy and anything later that wants these words all import this
// module without dragging a component onto their graph. TAGLINE lives here too — it was
// declared in BoltZoom.tsx until today and is re-exported from there, so nothing that already
// reads it from the brand card has to change.

/** The site tagline — the cold open's line, the outro's default, and slogan two. */
export const TAGLINE = "Cram what's on your exam.";

export type SloganId = "b-to-a" | "cram" | "yt-shorts";

export interface Slogan {
  id: SloganId;
  /** The words, verbatim. Never reworded, never paraphrased. */
  text: string;
  /** Lee wants a picture on this one ("B to an A is the picture, yes") — the insert selects
   *  the slide and lands the right column on the Illustrator so he can draw it there and then. */
  art: boolean;
  /** What the chip's tooltip says. */
  blurb: string;
}

export const SLOGANS: readonly Slogan[] = [
  { id: "b-to-a", text: "I'll take you from a B to an A.", art: true, blurb: "the promise — this one carries an illustration" },
  { id: "cram", text: TAGLINE, art: false, blurb: "the site tagline — text only" },
  { id: "yt-shorts", text: "Like YT shorts for exam prep.", art: false, blurb: "Lee says this one word for word in outros — text only" },
];

/** One slogan by id; undefined for anything else. A function DECLARATION, not an arrow const:
 *  this module is on the canvas render path (SloganCard → frame-view) and the TDZ ratchet
 *  (canvas/tdz-graph.test.ts) holds every module there to hoisted callables. */
export function slogan(id: string): Slogan | undefined {
  return SLOGANS.find((s) => s.id === id);
}

/** THE TYPE SIZE, as a fraction of the frame height. The slogan is the whole slide, so it is
 *  set to FILL it — the cold open's tagline is a caption under a wordmark (0.027 h) and this is
 *  four to six times that. Two bands, because a picture takes the top half of the frame:
 *  without one the words are alone and can be enormous; with one they sit under it in a strip
 *  a fifth of the frame tall (SloganCard's `sloganBand`) and step down far enough that even the
 *  longest of the three still fits in three lines there. The reference length is the longest of
 *  the three ("I'll take you from a B to an A." —
 *  31 characters); a shorter line grows a little, a long one Lee types himself shrinks, so
 *  every slogan lands at roughly the same number of lines in the safe column instead of
 *  overflowing the moment the words change. Pure and clamped: never bigger than the cap, never
 *  smaller than the floor. */
export function sloganSize(h: number, text: string, art: boolean): number {
  const cap = art ? 0.055 : 0.086;
  const floor = art ? 0.034 : 0.05;
  const n = Math.max(8, text.trim().length);
  const k = Math.min(1.18, Math.sqrt(31 / n));
  return Math.round(h * Math.max(floor, Math.min(cap, cap * k)));
}
