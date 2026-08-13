// VISUAL WORLDS (pure core) — reusable 16:9 background presets that give a frame
// a sense of PLACE without ever competing with the teaching cards. Everything
// here is data + deterministic geometry (no React, no DOM): the presets, a
// seeded RNG so a given (preset, seed) always lays its stars the same way, and
// the clamps that keep intensity/motion in a tasteful band.
//
// DESIGN RULES baked into every preset (Lee's spec):
//  • deep navy / blue-violet, muted; NO bright focal center, NO legible text,
//    NO prominent characters — the cards must dominate.
//  • default intensity 25–35%; slow, optional motion; respect reduced-motion.
//  • deterministic seed per preset so previews are stable and re-openable.
//  • the World is ATMOSPHERE, never a "hero visual".
//
// This rides in the scene JSON on the frame (additive `world*` fields) — no DB
// migration. See [[spotlight-pill-flame-batch]] siblings for the pattern.

export type WorldId =
  | "deep-space"
  | "orbital-grid"
  | "distant-nebula"
  | "blueprint-cosmos"
  | "twin-planets"
  | "horizon-glow"
  | "signal-field"
  | "quiet-void";

/** Normalized rectangle inside the 16:9 frame (0..1 on each axis). */
export interface WorldRect { x: number; y: number; w: number; h: number }

export type WorldScrim = "none" | "bottom" | "radial" | "vignette";
export type WorldWireframe = "none" | "grid" | "orbit" | "geometry" | "horizon" | "signal";

export interface WorldPreset {
  id: WorldId;
  name: string;
  blurb: string;
  /** Default background strength, 0..1 — always in the muted 0.25–0.35 band. */
  defaultIntensity: number;
  /** How lively the (optional) motion is, 0..1. 0 = truly still. */
  motionIntensity: number;
  /** Where the eye is gently drawn (normalized) — deliberately OFF-center so the
   *  middle stays clean for cards. */
  focalPoint: { x: number; y: number };
  /** Calm regions where a card reads well over this world. */
  landingZones: WorldRect[];
  /** Busier regions to keep clear of important content. */
  avoidZones: WorldRect[];
  /** Frame beats/types this world flatters (advisory only). */
  recommendedFrameTypes: string[];
  /** Optional darkening to guarantee card contrast. */
  scrim: WorldScrim;
  /** Muted palette — base fill, soft glow, faint accent. */
  palette: { base: string; base2: string; glow: string; accent: string };
  /** Base star count at intensity 1 (scaled down by intensity when rendered). */
  stars: number;
  /** The faint geometry layer. */
  wireframe: WorldWireframe;
}

/** The eight worlds. Palettes are all deep navy / blue-violet; none has a bright
 *  center or readable content. Intensities sit in the 0.25–0.35 band. */
export const WORLDS: WorldPreset[] = [
  {
    id: "deep-space", name: "Deep Space", blurb: "Sparse stars on deep navy — the calm default.",
    defaultIntensity: 0.3, motionIntensity: 0.15,
    focalPoint: { x: 0.82, y: 0.22 },
    landingZones: [{ x: 0.08, y: 0.2, w: 0.6, h: 0.6 }],
    avoidZones: [{ x: 0.7, y: 0.05, w: 0.28, h: 0.35 }],
    recommendedFrameTypes: ["hook", "stage", "quiet"],
    scrim: "vignette",
    palette: { base: "#070B18", base2: "#0C1230", glow: "#1B2A5B", accent: "#3E5AA8" },
    stars: 90, wireframe: "none",
  },
  {
    id: "orbital-grid", name: "Orbital Grid", blurb: "A faint perspective grid receding into the dark.",
    defaultIntensity: 0.28, motionIntensity: 0.1,
    focalPoint: { x: 0.5, y: 0.9 },
    landingZones: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.5 }],
    avoidZones: [{ x: 0.0, y: 0.75, w: 1.0, h: 0.25 }],
    recommendedFrameTypes: ["teach", "diagram", "worked_model"],
    scrim: "bottom",
    palette: { base: "#060A16", base2: "#0A1030", glow: "#182653", accent: "#3D63C9" },
    stars: 40, wireframe: "grid",
  },
  {
    id: "distant-nebula", name: "Distant Nebula", blurb: "A soft off-corner cloud, barely there.",
    defaultIntensity: 0.32, motionIntensity: 0.2,
    focalPoint: { x: 0.2, y: 0.78 },
    landingZones: [{ x: 0.35, y: 0.12, w: 0.6, h: 0.6 }],
    avoidZones: [{ x: 0.02, y: 0.5, w: 0.4, h: 0.45 }],
    recommendedFrameTypes: ["hook", "real_world", "stage"],
    scrim: "radial",
    palette: { base: "#080A1C", base2: "#141034", glow: "#3A2A6B", accent: "#6E4BB0" },
    stars: 70, wireframe: "none",
  },
  {
    id: "blueprint-cosmos", name: "Blueprint Cosmos", blurb: "Faint wireframe geometry — a technical hush.",
    defaultIntensity: 0.26, motionIntensity: 0.08,
    focalPoint: { x: 0.85, y: 0.8 },
    landingZones: [{ x: 0.08, y: 0.1, w: 0.7, h: 0.7 }],
    avoidZones: [{ x: 0.62, y: 0.55, w: 0.36, h: 0.4 }],
    recommendedFrameTypes: ["diagram", "worked_model", "statement"],
    scrim: "vignette",
    palette: { base: "#050A14", base2: "#081428", glow: "#123048", accent: "#2E76A8" },
    stars: 30, wireframe: "geometry",
  },
  {
    id: "twin-planets", name: "Twin Planets", blurb: "Two dim discs low in a corner — depth, not spectacle.",
    defaultIntensity: 0.3, motionIntensity: 0.12,
    focalPoint: { x: 0.85, y: 0.75 },
    landingZones: [{ x: 0.06, y: 0.1, w: 0.62, h: 0.75 }],
    avoidZones: [{ x: 0.62, y: 0.45, w: 0.36, h: 0.5 }],
    recommendedFrameTypes: ["hook", "stage", "real_world"],
    scrim: "radial",
    palette: { base: "#070A1A", base2: "#0E1230", glow: "#26305F", accent: "#4C63B0" },
    stars: 55, wireframe: "orbit",
  },
  {
    id: "horizon-glow", name: "Horizon Glow", blurb: "A low band of light along the bottom edge.",
    defaultIntensity: 0.33, motionIntensity: 0.18,
    focalPoint: { x: 0.5, y: 0.95 },
    landingZones: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.55 }],
    avoidZones: [{ x: 0.0, y: 0.78, w: 1.0, h: 0.22 }],
    recommendedFrameTypes: ["stage", "statement", "cram"],
    scrim: "bottom",
    palette: { base: "#070915", base2: "#0C1330", glow: "#2A2C66", accent: "#5866C4" },
    stars: 45, wireframe: "horizon",
  },
  {
    id: "signal-field", name: "Signal Field", blurb: "Scattered faint nodes with the quietest links.",
    defaultIntensity: 0.27, motionIntensity: 0.14,
    focalPoint: { x: 0.78, y: 0.3 },
    landingZones: [{ x: 0.08, y: 0.25, w: 0.6, h: 0.55 }],
    avoidZones: [{ x: 0.66, y: 0.08, w: 0.32, h: 0.5 }],
    recommendedFrameTypes: ["teach", "diagram", "signal"],
    scrim: "vignette",
    palette: { base: "#060B18", base2: "#0A1330", glow: "#173059", accent: "#357FBF" },
    stars: 60, wireframe: "signal",
  },
  {
    id: "quiet-void", name: "Quiet Void", blurb: "Almost nothing — a graded navy for pure focus.",
    defaultIntensity: 0.25, motionIntensity: 0.0,
    focalPoint: { x: 0.5, y: 0.5 },
    landingZones: [{ x: 0.06, y: 0.06, w: 0.88, h: 0.88 }],
    avoidZones: [],
    recommendedFrameTypes: ["statement", "cram", "quiet"],
    scrim: "none",
    palette: { base: "#060910", base2: "#0A0F22", glow: "#121A38", accent: "#2A3A6A" },
    stars: 14, wireframe: "none",
  },
];

export const WORLD_IDS: WorldId[] = WORLDS.map((w) => w.id);
export const DEFAULT_WORLD: WorldId = "deep-space";

export function worldById(id: string | undefined | null): WorldPreset | undefined {
  return id ? WORLDS.find((w) => w.id === id) : undefined;
}

/** Intensity is clamped into a tasteful ceiling so a background can never become
 *  a hero. 0..0.6 (the picker's slider covers this range). */
export function clampWorldIntensity(n: number | undefined, fallback = 0.3): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(0.6, v));
}
/** Motion 0..1, and 0 when the caller passes reduced-motion. */
export function clampWorldMotion(n: number | undefined, fallback = 0.15): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, v));
}

// ---- deterministic RNG -----------------------------------------------------
/** mulberry32 — a tiny deterministic PRNG. Same seed ⇒ same sequence, so a
 *  world's stars never "reshuffle" between renders/reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string→int hash so a world id contributes to the seed (two worlds at
 *  the same numeric seed still differ). */
export function hashSeed(id: string, seed: number): number {
  let h = 2166136261 >>> 0;
  const s = `${id}:${seed}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface WorldStar { x: number; y: number; r: number; tw: number }

/** Deterministic star field for a preset. Positions are biased AWAY from the
 *  center third (cards live there) so scenery hugs the edges. Returns normalized
 *  coords (0..1). `count` overrides the preset's base (already intensity-scaled). */
export function seededStars(worldId: string, seed: number, count: number): WorldStar[] {
  const rnd = mulberry32(hashSeed(worldId, seed));
  const out: WorldStar[] = [];
  for (let i = 0; i < count; i++) {
    let x = rnd();
    let y = rnd();
    // push stars toward the edges: if both axes land central, nudge one out
    if (x > 0.32 && x < 0.68 && y > 0.28 && y < 0.72) {
      if (rnd() < 0.5) x = x < 0.5 ? x * 0.5 : 0.7 + x * 0.3;
      else y = y < 0.5 ? y * 0.5 : 0.72 + y * 0.28;
    }
    out.push({ x, y, r: 0.4 + rnd() * 1.4, tw: rnd() });
  }
  return out;
}

/** Does a normalized point sit inside any of the world's landing zones? Used by
 *  the mix summary / phone checks to reason about placement, never to block. */
export function inLandingZone(w: WorldPreset, x: number, y: number): boolean {
  return w.landingZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
