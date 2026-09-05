// THE COLD OPEN's brain — pure helpers for BoltZoom.tsx.
//
// Lee (2026-09-03): "take our animated bolt and make like an infinite zoom of
// it … SHOW students I am pursuing this at many many campuses. SEC, and
// beyond." Second look: "the goal of this intro is to show students that I
// work with a lot of campuses … much more like the actual bolt we use in
// branding … the bolt in the survive just be static white … a slot machine
// that goes through all the course codes in power four … the scroller is too
// nauseating. It needs to be slower and just randomized a bit. Always start
// with Ole Miss. Do a good mix, not only one conference … give me 5 good
// variations … I will pick the best ones and cycle through them."
//
// Geometry and the campus mix live here so they are under test; the component
// only draws.
import { GENERATED_SCHOOLS, type GeneratedSchool } from "@/lib/schools.generated";

export const ZOOM = {
  /** copies of the bolt on screen at once */
  layers: 6,
  /** scale ratio between neighbouring layers */
  ratio: 1.6,
  /** the smallest layer's scale — the bolt at rest is ~phone-sized (see BoltZoom) */
  start: 0.09,
  /** one full pass, seconds — a layer's life from smallest to largest */
  period: 8,
} as const;

/** The six variants Lee picks from, cycled per video for variety. */
export const ZOOM_VARIANTS = [
  { id: "zoom", label: "Infinite zoom", blurb: "The brand bolt zooming in forever; static white bolt in the wordmark; course-code slot." },
  { id: "rain", label: "Bolt rain", blurb: "Small brand bolts drifting down at different depths; the wordmark holds still in front." },
  { id: "pulse", label: "Pulse", blurb: "One big bolt breathing behind the wordmark, echo rings rolling outward. Calm, classy." },
  { id: "wall", label: "Campus wall", blurb: "A wall of course codes drifting behind, one lighting up at a time — the expansion look." },
  { id: "board", label: "Departure board", blurb: "A split-flap line of course codes flipping under the wordmark; bolt outlines drifting." },
  { id: "aurora", label: "Aurora + live bolt", blurb: "The boiling coloured bolt stays in the wordmark; soft brand-colour aurora and bolt confetti behind." },
] as const;
export type ZoomVariant = (typeof ZOOM_VARIANTS)[number]["id"];
export function isZoomVariant(v: unknown): v is ZoomVariant { return typeof v === "string" && ZOOM_VARIANTS.some((z) => z.id === v); }

export interface ZoomLayer {
  /** 0..layers-1 */
  index: number;
  /** negative animation delay: where in the loop this layer starts */
  delaySec: number;
  /** a small per-layer twist, scaled by psych (0 → none) */
  tiltDeg: number;
}

/** The layers, staggered evenly through one period so they sit at geometric
 *  spacing. The largest ratio^layers is how far "into" the bolt the loop goes. */
export function zoomLayers(psych = 0.1, n: number = ZOOM.layers): ZoomLayer[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    delaySec: -((index / n) * ZOOM.period) || 0,
    tiltDeg: Math.round(((index % 2 ? 1 : -1) * 14 * psych) * 10) / 10,
  }));
}

/** The keyframes' scale at each step: start · ratio^j — exponential in time, so
 *  the zoom reads as constant speed instead of slowing as it grows. */
export function zoomScales(n: number = ZOOM.layers): number[] {
  return Array.from({ length: n + 1 }, (_, j) => +(ZOOM.start * Math.pow(ZOOM.ratio, j)).toFixed(4));
}

/** The CSS keyframes for one pass: exponential scale, fade in at the smallest,
 *  fade out at the largest. Percent → transform/opacity. */
export function zoomKeyframes(n: number = ZOOM.layers): string {
  const scales = zoomScales(n);
  return scales.map((s, j) => {
    const pct = Math.round((j / n) * 1000) / 10;
    const opacity = j === 0 ? 0 : j === n ? 0 : 1;
    return `${pct}% { transform: scale(${s}); opacity: ${opacity}; }`;
  }).join("\n");
}

// ---- THE CAMPUS MIX ---------------------------------------------------------

export interface CampusLine { name: string; code: string | null; conference: string }
export const POWER_FOUR = ["SEC", "Big Ten", "Big 12", "ACC"] as const;

/** Deterministic shuffle (mulberry32) so a seed always gives the same mix —
 *  what a frame-by-frame renderer needs, and what keeps two windows in step. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let a = (seed >>> 0) || 1;
  const rand = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** THE FOUR LEADS (Lee, 2026-09-05: "Ole Miss LSU Tennessee MS State then randomized power
 *  four after that" — the same sequence as the homepage bolt's CURATED_CAMPUS_ORDER, so the
 *  slide scroller and the home page read as one system). Matched by name, not id, the same
 *  defensive style as the rest of this mix — a school's own id spelling can drift, its name
 *  in the seed data does not. */
const LEAD_PATTERNS: readonly RegExp[] = [
  /ole miss|university of mississippi$|^mississippi$/i,
  /^lsu$|louisiana state/i,
  /^tennessee$/i,
  /mississippi state/i,
];
function leadRank(s: GeneratedSchool): number {
  return LEAD_PATTERNS.findIndex((re) => re.test(s.name));
}

/** Ole Miss, LSU, Tennessee, Mississippi State — in that order — then the rest of the Power
 *  Four dealt round-robin across the four conferences (each conference shuffled by the seed),
 *  so no stretch is all one league. */
export function campusMix(schools: readonly GeneratedSchool[] = GENERATED_SCHOOLS, seed = 7): CampusLine[] {
  const line = (s: GeneratedSchool): CampusLine => ({ name: s.name, code: s.courseCode, conference: s.conference });
  const leads = schools
    .filter((s) => leadRank(s) >= 0)
    .sort((a, b) => leadRank(a) - leadRank(b));
  const leadSet = new Set(leads);
  const pools = POWER_FOUR.map((conf, k) => seededShuffle(schools.filter((s) => s.conference === conf && !leadSet.has(s)), seed + k * 101));
  const out: CampusLine[] = leads.map(line);
  const longest = Math.max(0, ...pools.map((p) => p.length));
  for (let i = 0; i < longest; i++) for (const p of pools) if (p[i]) out.push(line(p[i]));
  return out;
}

/** "Ole Miss · ACCY 201" — or just the name when the campus has no code yet. */
export function campusText(c: CampusLine): string { return c.code ? `${c.name} · ${c.code}` : c.name; }

/** Timing (seconds). The banner is deliberately slow — "too nauseating" at 48. */
export const SLOT_SECONDS = 1.4;
export const BANNER_SECONDS = 110;

/** Colour drift amplitude in degrees for a psych level (0..1): 10% ≈ ±12°. */
export function driftDegrees(psych: number): number { return Math.round(Math.max(0, Math.min(1, psych)) * 120); }
