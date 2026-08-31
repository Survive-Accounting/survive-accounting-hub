// WORDMARK GLYPHS — single-stroke letterforms for the drawn wordmark. Marker handwriting:
// rounded, slightly bouncy, one continuous stroke per path (a glyph may have more than one
// path — the t's crossbar, the i's dot — drawn in order).
//
// GEOMETRY: each glyph lives in its own box, y=0 at the TOP of the ascender band, baseline at
// y=100, descenders reach ~132. The x-height band is roughly y=46..100. `w` is the advance
// width; letters are laid out by summing advances plus tracking (see AnimatedWordmark).
//
// EDITING: these are hand-authored curves — tweak numbers and eyeball at /lab/brand. Every
// path starts where a marker would land and ends where it would lift, because the draw-on
// animation replays exactly this stroke order.
export type Glyph = { w: number; d: string[] };

export const GLYPHS: Record<string, Glyph> = {
  s: { w: 44, d: ["M 37,54 C 33,45 20,43 13,50 C 6,57 11,65 21,69 C 32,73 38,79 34,88 C 30,98 14,100 7,91"] },
  u: { w: 50, d: ["M 8,48 C 5,68 5,86 13,94 C 23,102 34,94 37,80 C 39,70 40,57 40,48 C 40,64 39,85 46,97"] },
  r: { w: 38, d: ["M 8,47 C 9,64 9,81 8,98 C 9,80 9,62 12,54 C 16,44 28,42 34,50"] },
  v: { w: 46, d: ["M 6,47 C 11,65 17,84 23,97 C 29,84 35,64 41,48"] },
  e: { w: 44, d: ["M 9,73 C 21,71 33,66 35,58 C 36,50 27,45 18,48 C 8,52 5,67 8,79 C 11,93 26,101 37,92"] },
  a: { w: 48, d: ["M 35,50 C 25,44 12,47 8,60 C 4,74 8,91 17,95 C 27,99 34,89 36,76 C 37,66 37,55 36,48 C 36,64 37,85 43,97"] },
  c: { w: 42, d: ["M 36,54 C 30,45 17,44 10,52 C 3,62 3,80 10,90 C 17,100 31,98 37,89"] },
  o: { w: 46, d: ["M 24,46 C 12,46 5,58 6,72 C 7,88 15,99 26,97 C 38,95 43,81 40,65 C 38,53 32,46 24,46"] },
  n: { w: 48, d: ["M 8,47 C 9,64 9,81 8,98 C 9,80 9,62 13,54 C 18,44 31,44 35,54 C 38,62 39,80 38,98"] },
  t: { w: 38, d: ["M 18,22 C 17,45 16,73 20,90 C 23,100 31,99 36,92", "M 4,52 C 15,49 26,48 35,49"] },
  i: { w: 20, d: ["M 9,50 C 8,66 8,83 11,97", "M 8,30 C 9,28 12,28 12,31 C 11,34 8,33 8,30"] },
  g: { w: 48, d: ["M 35,50 C 25,44 12,47 8,60 C 4,73 8,88 17,92 C 27,96 34,87 36,74 C 37,64 37,54 36,47 C 37,70 39,104 34,118 C 29,131 12,131 7,119"] },
};

/** Rough per-path draw cost so long strokes get more of the timeline than an i-dot. */
export const PATH_WEIGHT: Record<string, number[]> = Object.fromEntries(
  Object.entries(GLYPHS).map(([ch, g]) => [ch, g.d.map((d) => Math.max(1, Math.round(d.length / 24)))]),
);
