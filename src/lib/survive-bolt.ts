// THE SURVIVE BOLT — the bolt Lee pictured, built as red + a blue echo.
//
// Lee (2026-09-05), with the reference image: "The red part of this bolt is
// perfect. Just add the blue to the left of it and white outline and then boil
// it … it'd be perfect if the blue just followed the red … and remove the
// white in the middle seam. Just colors for the seam."
//
// So the mark is ONE shape drawn twice: the RED bolt, and the same bolt slid a
// little down-left as the BLUE echo behind it. The keyline runs around the
// union only — the two fills are painted again on top of the strokes, so no
// white ever shows where red meets blue. The three options keep the red's
// proportions close to the picture and vary how the echo sits and how heavy
// the bolt is.
//
// The red bolt is three diagonal bands stacked with a step to the right at
// each join — the two jags on the right, the two notches on the left, a sharp
// tip at the bottom. Coordinates follow the old forge (top y = 4) so the bolt
// sits in the wordmark the way it always did. Deterministic; the boil is the
// only motion.
import { makeBoil, type BoltSpec } from "@/components/brand-cards/bolt-boil";

export interface SurviveBoltParams {
  /** Band thickness (the red's width across a band). */
  width: number;
  /** How far each band drifts left over its height (the lean of the strokes). */
  lean: number;
  /** The step to the right at each join — the size of the jags / notches. */
  step: number;
  /** The bottom band narrows into the tip by this fraction. */
  taper: number;
  /** How far the tip drops below the last band. */
  tip: number;
  /** The blue echo's offset: left and down, in the bolt's own units. */
  echoX: number;
  echoY: number;
  /** Hand-drawn wobble on every vertex (0 = ruler-straight). */
  handDrawn: number;
  seed: number;
  /** The keyline width the viewBox pads for. */
  outline: number;
}

export interface SurviveBoltGeom {
  /** The red bolt (also the silhouette the keyline follows on the right). */
  outerPts: [number, number][];
  /** The blue echo — the same ring, slid down-left. */
  seamPts: [number, number][];
  outer: string; seam: string; viewBox: string; ratio: number;
}

export const SURVIVE_BOLTS: { id: "pictured" | "tall" | "heavy"; name: string; blurb: string; params: SurviveBoltParams }[] = [
  { id: "pictured", name: "As pictured", blurb: "The red from the picture; the blue slides down-left along the bolt's own lean, so it follows every edge and never pools at the top.",
    params: { width: 24, lean: 26, step: 13, taper: 0.55, tip: 12, echoX: 9, echoY: 12, handDrawn: 0.6, seed: 7, outline: 8 } },
  { id: "tall", name: "Taller, leaner", blurb: "The same bolt stretched: thinner bands, a longer tip, a thinner blue echo. Reads sharper small — in the wordmark and as the cursor.",
    params: { width: 20, lean: 30, step: 12, taper: 0.6, tip: 16, echoX: 7, echoY: 10, handDrawn: 0.6, seed: 11, outline: 8 } },
  { id: "heavy", name: "Heavier", blurb: "Thicker bands, bigger jags, a wider blue echo — more poster, more sticker. The one to try at slide size.",
    params: { width: 28, lean: 24, step: 16, taper: 0.5, tip: 11, echoX: 12, echoY: 14, handDrawn: 0.7, seed: 3, outline: 8 } },
];

type Pt = [number, number];
const TY = 4;
const BAND_H = 44;
const TOP_R = 80;

// mulberry32 — the forge's PRNG, so a seed means the same thing here.
function prng(seed: number) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toPath(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
}

/** The red bolt's ring, clockwise from the top-left corner: three bands, two
 *  joins, a tapered tip. */
export function redBolt(p: SurviveBoltParams): Pt[] {
  const w = Math.max(10, p.width), lean = p.lean, step = p.step;
  // Each band: top-left x, top-right x; the next band starts `step` to the right
  // of where this one ends (after the lean), which cuts the jag and the notch.
  const bands: { y0: number; y1: number; L0: number; R0: number; L1: number; R1: number }[] = [];
  let L = TOP_R - w;
  for (let k = 0; k < 3; k++) {
    const y0 = TY + k * BAND_H, y1 = y0 + BAND_H;
    const R0 = L + w;
    const L1 = L - lean, R1 = R0 - lean;
    bands.push({ y0, y1, L0: L, R0, L1, R1 });
    L = L1 + step;
  }
  const b0 = bands[0], b1 = bands[1], b2 = bands[2];
  // The bottom band narrows into the tip: its foot is `taper` of the width.
  const footW = w * (1 - p.taper);
  const footL = b2.L1 + (w - footW) * 0.35, footR = footL + footW;
  const tipPt: Pt = [footL + footW * 0.35 - p.lean * 0.18, b2.y1 + p.tip];
  return [
    [b0.L0, b0.y0], [b0.R0, b0.y0],            // the top edge
    [b0.R1, b0.y1], [b1.R0, b1.y0],            // down the right, the first jag
    [b1.R1, b1.y1], [b2.R0, b2.y0],            // the second jag
    [footR, b2.y1], tipPt, [footL, b2.y1],     // the tip
    [b2.L0, b2.y0], [b1.L1, b1.y1],            // up the left, the second notch
    [b1.L0, b1.y0], [b0.L1, b0.y1],            // the first notch, back to the top
  ];
}

export function forgeSurviveBolt(p: SurviveBoltParams): SurviveBoltGeom {
  const rnd = prng(p.seed);
  const wob = (amp: number) => (amp === 0 ? 0 : (rnd() * 2 - 1) * amp);
  const red = redBolt(p);
  const top = red[1], tip = red[7];
  // The hand-drawn wobble — every vertex but the top tip and the bottom tip, so
  // the bolt stays pinned as the "i" (the boil does the same).
  const shaken = red.map((q) => (q === top || q === tip) ? q : [q[0] + wob(p.handDrawn * 1.6), q[1] + wob(p.handDrawn * 1.2)] as Pt);
  // The echo is the SAME ring slid down-left — it follows every edge.
  const echo = shaken.map(([x, y]) => [x - p.echoX, y + p.echoY] as Pt);
  const all = [...shaken, ...echo];
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const pad = p.outline / 2 + 2;
  const vx = Math.min(...xs) - pad, vy = Math.min(...ys) - pad;
  const vw = Math.max(...xs) - vx + pad, vh = Math.max(...ys) - vy + pad;
  const r1 = (v: number) => Math.round(v * 100) / 100;
  return { outerPts: shaken, seamPts: echo, outer: toPath(shaken), seam: toPath(echo), viewBox: `${r1(vx)} ${r1(vy)} ${r1(vw)} ${r1(vh)}`, ratio: vw / vh };
}

/** The BoltSpec the boil cards, the wordmark and the cold open render: an
 *  "echo" spec — outer = the red bolt, seam = the blue echo behind it. */
export function surviveBoltSpec(p: SurviveBoltParams, colours?: { red?: string; blue?: string; cream?: string }): BoltSpec {
  const g = forgeSurviveBolt(p);
  return { frames: makeBoil(g.outerPts, g.seamPts, p.outline).map((f) => ({ ...f, echo: true })), viewBox: g.viewBox, ratio: g.ratio, red: colours?.red ?? "#C62828", blue: colours?.blue ?? "#1565C0", cream: colours?.cream ?? "#FFFFFF" };
}

/** What a sitewide swap pastes: the red ring as BOLT_OUTER, the echo as
 *  BOLT_RIGHT (drawn BEHIND, echo mode), the viewBox, and the points. */
export function surviveBoltExport(p: SurviveBoltParams): { mode: "echo"; BOLT_OUTER: string; BOLT_RIGHT: string; BOLT_VIEWBOX: string; outerPts: Pt[]; seamPts: Pt[] } {
  const g = forgeSurviveBolt(p);
  return { mode: "echo", BOLT_OUTER: g.outer, BOLT_RIGHT: g.seam, BOLT_VIEWBOX: g.viewBox, outerPts: g.outerPts, seamPts: g.seamPts };
}
