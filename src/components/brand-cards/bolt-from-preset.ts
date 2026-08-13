// BOLT-FROM-PRESET — rebuild a BoltSpec (the geometry + colours the boil cards render) from a
// saved Logo Lab preset's State. This mirrors the Logo Lab geometry pipeline EXACTLY so the
// intro/outro cards show the same hand-edited bolt Lee perfected (e.g. his "FINAL" preset):
//   base = forgeBolt(bolt) -> assisted = applyAssist(baseFrozen ?? base) -> dry = edit ?? assisted+manual
// The wet/organic warp is intentionally NOT applied — the boil IS the card's motion, and the
// cards want his still, hand-edited shape. Colours follow effColors' inkMode/keyline logic.
import { forgeBolt, DEFAULT_BOLT } from "@/lib/bolt-forge";
import { applyAssist, toV, bounds, ptsToPath, DEFAULT_ASSIST, type V } from "@/lib/bolt-geom-edit";
import { BRAND_RED, BRAND_BLUE, BRAND_CREAM, type BoltSpec, type BoilFrame } from "./bolt-boil";

// The subset of Logo Lab State the bolt geometry + colours depend on. Everything is optional so
// older/partial presets still resolve (missing fields fall back to defaults).
export type LogoState = {
  bolt?: Partial<typeof DEFAULT_BOLT>;
  assist?: Parameters<typeof applyAssist>[1];
  manual?: Record<number, [number, number]>;
  baseFrozen?: [number, number][] | null;
  outerEdit?: [number, number][] | null;
  seamEdit?: [number, number][] | null;
  inkMode?: string; monoColor?: string;
  c1?: string; c2?: string;
  keyline?: string; keylineCustom?: string;
};

// Faithful subset of effColors (logo-lab.tsx): the bolt's two fills + keyline. "white"/"black"
// are passed through as CSS colour keywords (BoltSVG does the same); "none" disables the stroke.
function colorsOf(s: LogoState): { c1: string; c2: string; key: string } {
  if (s.inkMode === "white") return { c1: "#FFFFFF", c2: "#FFFFFF", key: "none" };
  if (s.inkMode === "black") return { c1: "#111111", c2: "#111111", key: "none" };
  if (s.inkMode === "mono") { const m = s.monoColor ?? BRAND_RED; return { c1: m, c2: m, key: "none" }; }
  const key = s.keyline === "custom" ? (s.keylineCustom ?? BRAND_CREAM) : (s.keyline ?? "white");
  return { c1: s.c1 ?? BRAND_RED, c2: s.c2 ?? BRAND_BLUE, key };
}

// A FIXED 4-frame boil for arbitrary rings: interior vertices wobble on a deterministic field
// (<=1.3px), each ring's top-most + bottom-most vertex is PINNED so tip/base never drift, and
// the stroke breathes around the preset's outline width. Deterministic (no RNG) -> capture-safe.
function boilFrames(outer: V[], seam: V[], outlineW: number): BoilFrame[] {
  const A = 1.3;
  const ext = (pts: V[]) => { let mn = Infinity, mx = -Infinity; for (const p of pts) { if (p.y < mn) mn = p.y; if (p.y > mx) mx = p.y; } return { mn, mx }; };
  const eo = ext(outer), es = ext(seam);
  const wob = (pts: V[], f: number, e: { mn: number; mx: number }) =>
    pts.map((p, i) => (p.y <= e.mn + 0.01 || p.y >= e.mx - 0.01)
      ? p
      : { x: p.x + A * Math.sin(i * 1.3 + f * 1.7), y: p.y + A * Math.cos(i * 0.9 + f * 2.1) });
  const sw = [0.92, 1.1, 0.84, 1.04].map((k) => +(outlineW * k).toFixed(2));
  return [0, 1, 2, 3].map((f) => ({ outer: ptsToPath(wob(outer, f, eo)), seam: ptsToPath(wob(seam, f, es)), sw: sw[f] }));
}

export function boltSpecFromLogoState(s: LogoState): BoltSpec {
  const bolt = { ...DEFAULT_BOLT, ...(s.bolt ?? {}) };
  const assist = s.assist ?? DEFAULT_ASSIST;
  const base = forgeBolt(bolt);
  const baseOuter = (s.baseFrozen ?? base.outerPts).map(toV);
  const assistedOuter = applyAssist(baseOuter, assist);
  const assistedSeam = applyAssist(base.seamPts.map(toV), assist);
  const manual = s.manual ?? {};
  const dryOuter = s.outerEdit
    ? s.outerEdit.map(toV)
    : assistedOuter.map((v, i) => { const m = manual[i]; return m ? { x: v.x + m[0], y: v.y + m[1] } : v; });
  const drySeam = s.seamEdit ? s.seamEdit.map(toV) : assistedSeam;

  const outlineW = bolt.outline ?? 8;
  const b = bounds([...dryOuter, ...drySeam]);
  const pad = outlineW / 2 + 2;
  const w = b.maxX - b.minX + 2 * pad, h = b.maxY - b.minY + 2 * pad;
  const c = colorsOf(s);
  return {
    frames: boilFrames(dryOuter, drySeam, outlineW),
    viewBox: `${(b.minX - pad).toFixed(2)} ${(b.minY - pad).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
    ratio: w / h,
    red: c.c1, blue: c.c2, cream: c.key,
  };
}
