// CHAIN LIGHTNING — the outro CTA's brain: the red, the composition, and the bolts.
// Pure helpers for ChainLightning.tsx / SurviveOutro.tsx, so the geometry is under test
// and the components only draw.
//
// Lee (2026-09-07): "The outro slide needs a big red CTA button that's composed nicely
// underneath the surviveaccounting.com. I'm thinking it can say under it too like
// 'Videos * Practice Exams * Quizzes'. The button can have a hover effect and also a
// really badass spotlight effect, like where I'm hitting it with chain lightning or
// something. The bolt blasts chain lightning into the Button and it gets bigger and has
// like lightning pulsing through it. Make it exciting like oh this is what I want to
// cram with. This is legit, etc."
//
// Function declarations throughout, never module-scope arrows — the outro sits on the
// canvas render path (BlastOffNodes) and canvas/tdz-graph.test.ts forbids new ones.

/** THE RED (2026-09-07). The house had no red until this button — the bolt went blue on
 *  09-04 and the callout reds (#C62828 tutor, #C22B45 distractor) were chosen for cream
 *  paper, where they go maroon on black. This one is a warm signal red: brighter than
 *  those, tilted a touch toward orange so it sits next to the gold (#FCA311) as a
 *  neighbour on the wheel rather than fighting it, and far enough from crimson that it
 *  never reads pink beside the cream. Against the blue bolt it is the red/blue the brand
 *  wore before the one-hue mark — the one place that pairing is welcome back. ONE name,
 *  one place; the pill's own shade steps are derived, not picked. */
export const CTA_RED = "#E63B2D";
/** The lower lip of the pill — the same hue, darkened, so the button has a little form. */
export const CTA_RED_DEEP = "#B8261C";
/** The upper highlight of the pill. */
export const CTA_RED_LIT = "#F5574A";
/** The arc's outer glow: deeper-idea sky for a regular spotlight, brand gold for the super. */
export const ARC_BLUE = "#7DD3FC";
export const ARC_GOLD = "#FCA311";
/** The bolt's core — cream-white, hotter than the brand cream. */
export const ARC_CORE = "#FFFBF2";

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** mulberry32 — a tiny seeded PRNG, so a strike is the same shape every render and
 *  every capture (the boil's own rule: never per-render random). */
export function seeded(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** ONE BOLT: a jagged polyline from `from` to `to`. Both ends land exactly; the interior
 *  is a random walk across the line, pulled back toward it each step and enveloped by a
 *  half-sine so it leaves and arrives clean. `jag` is the largest sideways excursion as a
 *  fraction of the bolt's length (0 = a straight line). Deterministic in `seed`. */
export function lightningPath(from: Pt, to: Pt, seed: number, jag = 0.18, segments = 12): Pt[] {
  const rnd = seeded(seed);
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || segments < 2) return [{ ...from }, { ...to }];
  const nx = -dy / len, ny = dx / len; // the unit normal — sideways
  const pts: Pt[] = [{ ...from }];
  let drift = 0;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    drift = clamp(drift * 0.55 + (rnd() * 2 - 1), -1, 1);
    const env = Math.sin(Math.PI * t);
    const off = drift * jag * len * env;
    // a little jitter ALONG the line too, so the vertices are not evenly spaced
    const along = t + (rnd() - 0.5) * (0.5 / segments);
    pts.push({ x: from.x + dx * along + nx * off, y: from.y + dy * along + ny * off });
  }
  pts.push({ ...to });
  return pts;
}

/** The length of a polyline. */
export function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/** THE FORKS: `count` secondary branches leaving the trunk at one of its interior vertices
 *  (never the strike point itself — the bottom quarter is left alone so the impact reads
 *  as one hit), 26°–54° off the trunk's remaining direction, a quarter to a half of the
 *  distance still to go, and jaggier than the trunk. Each branch starts ON a trunk vertex. */
export function lightningBranches(main: Pt[], seed: number, count = 3, jag = 0.24): Pt[][] {
  const out: Pt[][] = [];
  const n = main.length;
  if (n < 3 || count <= 0) return out;
  const rnd = seeded(seed * 7919 + 17);
  const end = main[n - 1];
  for (let b = 0; b < count; b++) {
    const i = 1 + Math.floor(rnd() * Math.max(1, Math.floor((n - 2) * 0.75)));
    const p = main[Math.min(i, n - 2)];
    const dirX = end.x - p.x, dirY = end.y - p.y;
    const dl = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / dl, uy = dirY / dl;
    const ang = (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.5);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const len = dl * (0.25 + rnd() * 0.25);
    const tip = { x: p.x + (ux * cos - uy * sin) * len, y: p.y + (ux * sin + uy * cos) * len };
    out.push(lightningPath(p, tip, seed * 31 + b * 101 + 7, jag, 5));
  }
  return out;
}

export interface Bolt {
  path: Pt[];
  branches: Pt[][];
  /** when this bolt fires, ms after the strike begins — chain lightning arrives in a volley */
  delayMs: number;
  /** the core stroke, stage px */
  width: number;
}

/** THE VOLLEY: `bolts` trunks from the bolt-as-"i" (its lower point, the tip nearest the
 *  button) into the button's top edge, landing spread across its middle — the first one
 *  dead centre and heaviest, the rest staggered ~90 ms apart and thinner, each with its
 *  own forks. The super throws more. */
export function chainBolts(from: Rect, to: Rect, seed: number, opts: { bolts?: number; branches?: number; jag?: number } = {}): Bolt[] {
  const bolts = Math.max(1, opts.bolts ?? 3);
  const branches = opts.branches ?? 3;
  const jag = opts.jag ?? 0.16;
  const rnd = seeded(seed * 13 + 5);
  const out: Bolt[] = [];
  for (let i = 0; i < bolts; i++) {
    // the first bolt is the strike; later ones scatter across the pill's top
    const spread = i === 0 ? 0 : (rnd() * 2 - 1) * 0.36;
    const src: Pt = { x: from.x + from.w * (0.5 + (i === 0 ? 0 : (rnd() - 0.5) * 0.3)), y: from.y + from.h * 0.96 };
    const dst: Pt = { x: to.x + to.w * (0.5 + spread), y: to.y + to.h * 0.08 };
    const path = lightningPath(src, dst, seed * 977 + i * 389, jag * (i === 0 ? 1 : 1.35), 12);
    out.push({
      path,
      branches: lightningBranches(path, seed * 53 + i * 11, i === 0 ? branches : Math.max(1, branches - 1)),
      delayMs: i === 0 ? 0 : 70 + i * 90,
      width: i === 0 ? 4 : 2.4,
    });
  }
  return out;
}

export interface Tick {
  pts: Pt[];
  delayMs: number;
  periodMs: number;
}

/** A point on the pill's perimeter at t∈[0,1) with its outward normal. t runs: top edge
 *  left→right, right cap, bottom edge right→left, left cap. */
export function pillPoint(r: Rect, t: number): { p: Pt; n: Pt } {
  const rad = r.h / 2;
  const flat = Math.max(0, r.w - 2 * rad);
  const arc = Math.PI * rad;
  const total = 2 * flat + 2 * arc;
  let d = ((t % 1) + 1) % 1 * total;
  if (d < flat) return { p: { x: r.x + rad + d, y: r.y }, n: { x: 0, y: -1 } };
  d -= flat;
  if (d < arc) { const a = -Math.PI / 2 + d / rad; const cx = r.x + r.w - rad, cy = r.y + rad; return { p: { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }, n: { x: Math.cos(a), y: Math.sin(a) } }; }
  d -= arc;
  if (d < flat) return { p: { x: r.x + r.w - rad - d, y: r.y + r.h }, n: { x: 0, y: 1 } };
  d -= flat;
  const a = Math.PI / 2 + d / rad; const cx = r.x + rad, cy = r.y + rad;
  return { p: { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }, n: { x: Math.cos(a), y: Math.sin(a) } };
}

/** THE EDGE ARCS: small three-point sparks standing off the pill's rim while it is lit,
 *  each flickering on its own clock. Spread evenly round the rim with a seeded nudge so
 *  they do not read as a dotted border. */
export function edgeTicks(btn: Rect, seed: number, count = 8): Tick[] {
  const rnd = seeded(seed * 4099 + 3);
  const L = btn.h * 0.22;
  const out: Tick[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5 + (rnd() - 0.5) * 0.6) / count;
    const { p, n } = pillPoint(btn, t);
    const tx = -n.y, ty = n.x; // the tangent
    const side = rnd() < 0.5 ? -1 : 1;
    const l = L * (0.7 + rnd() * 0.6);
    out.push({
      pts: [
        { x: p.x, y: p.y },
        { x: p.x + n.x * l * 0.5 + tx * side * l * 0.35, y: p.y + n.y * l * 0.5 + ty * side * l * 0.35 },
        { x: p.x + n.x * l, y: p.y + n.y * l },
      ],
      delayMs: Math.round(rnd() * 900),
      periodMs: Math.round(700 + rnd() * 700),
    });
  }
  return out;
}

/** "x,y x,y …" for an SVG polyline, two decimals. */
export function polyline(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export interface CtaLayout {
  /** the column's top (the outro's upper-third band) */
  top: number;
  /** the wordmark's cap-height — the loudest thing on screen */
  word: number;
  tagGap: number; tagSize: number; tagLine: number;
  domainGap: number; domainSize: number;
  buttonGap: number; buttonH: number; buttonFont: number; buttonPadX: number; buttonMinW: number;
  subGap: number; subSize: number;
  /** how much the pill grows on impact */
  grow: number;
  /** absolute y of each row's top edge */
  wordTop: number; tagTop: number; domainTop: number; buttonTop: number; subTop: number;
  /** the column's bottom edge at rest, and the grown pill's bottom edge */
  bottom: number; grownButtonBottom: number;
  /** where the campus banner strip starts (CampusBanner's own .745h) */
  bannerTop: number;
}

/** THE COMPOSITION, as one tested fact (2026-09-07): wordmark → tagline → domain → the red
 *  pill → the three words, every gap a fraction of the wordmark's cap-height so the column
 *  reads the same at 1080×1920 and in the small preview. Everything sits in the upper
 *  half: the pill, even grown, clears the campus banner strip (.745h) by a wide margin,
 *  and YouTube's end-screen overlay eats the bottom 40% of a vertical frame anyway. */
export function ctaLayout(V: { w: number; h: number }): CtaLayout {
  const top = Math.round(V.h * 0.30);
  const word = Math.round(V.h * 0.099);
  const tagGap = Math.round(word * 0.23), tagSize = Math.round(word * 0.30), tagLine = Math.round(tagSize * 1.15);
  const domainGap = Math.round(word * 0.137), domainSize = Math.round(word * 0.19);
  const buttonGap = Math.round(word * 0.29), buttonH = Math.round(word * 0.70), buttonFont = Math.round(word * 0.27), buttonPadX = Math.round(word * 0.40);
  const buttonMinW = Math.round(V.w * 0.52);
  const subGap = Math.round(word * 0.165), subSize = Math.round(word * 0.15);
  const grow = 1.12;
  const wordTop = top;
  const tagTop = wordTop + word + tagGap;
  const domainTop = tagTop + tagLine + domainGap;
  const buttonTop = domainTop + domainSize + buttonGap;
  const subTop = buttonTop + buttonH + subGap;
  const bottom = subTop + subSize;
  const grownButtonBottom = buttonTop + buttonH / 2 + (buttonH * grow) / 2;
  return {
    top, word, tagGap, tagSize, tagLine, domainGap, domainSize, buttonGap, buttonH, buttonFont, buttonPadX, buttonMinW, subGap, subSize, grow,
    wordTop, tagTop, domainTop, buttonTop, subTop, bottom, grownButtonBottom,
    bannerTop: Math.round(V.h * 0.745),
  };
}
