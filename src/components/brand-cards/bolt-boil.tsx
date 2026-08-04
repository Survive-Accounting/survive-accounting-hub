// BOLT BOIL — the signature hand-drawn "boil" of the Survive lightning bolt, for the
// branded intro/outro cards. A FIXED 4-frame cycle (never per-render random): interior
// vertices wobble <=1.3px and the outline stroke breathes between frames; the shared TIP and
// BASE are pinned so the bolt never drifts as the letter "i". The whole layer is never
// translated/scaled/rotated. Cycles ~8fps via a pure-CSS discrete swap (no JS timer, capture-
// friendly). prefers-reduced-motion serves a single static frame. React only.
//
// The actual bolt geometry + colours come from a BoltSpec supplied via BoltContext, so the
// cards can render Lee's saved Logo Lab preset (e.g. "FINAL") instead of the built-in default.
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";

export const BRAND_RED = "#C62828";
export const BRAND_BLUE = "#1565C0";
export const BRAND_CREAM = "#F5EFE6";
export const BRAND_NAVY = "#111A32";

export type BoilFrame = { outer: string; seam: string; sw: number };
export type BoltSpec = { frames: BoilFrame[]; viewBox: string; ratio: number; red: string; blue: string; cream: string };

// Lee's FINAL hand-edited bolt (baked from his Logo Lab preset — the canonical logo). These
// are the exact dry rings; the boil wobbles their interiors. Keep in sync with brand.tsx
// BOLT_OUTER / BOLT_RIGHT (same shape, decomposed into points so the boil can perturb them).
const FINAL_OUTER: [number, number][] = [[76.02, 3.9], [66.89, 32.29], [85.06, 31.98], [54.88, 51.08], [77.05, 50.77], [43.48, 73.57], [76.74, 73.57], [49.77, 92.03], [63.19, 94.82], [28.39, 111.14], [42.56, 112.07], [18.22, 120.69], [22.53, 128.7], [-8.27, 137.63], [15.14, 108.99], [-10.73, 108.06], [26.85, 92.35], [-11.54, 90.51], [34.22, 62.78], [3.83, 64.94], [41.41, 44], [21.39, 38.45], [57.55, 18.89], [42.46, 15.29]];
const FINAL_SEAM: [number, number][] = [[75.53, 3.74], [43.85, 14.01], [56.41, 19.96], [21.36, 38.79], [42.92, 44.46], [2.88, 65.4], [34.3, 61.71], [-10.67, 90.66], [28.14, 91.89], [-12.21, 106.98], [14.99, 110.04], [-10.11, 138.7], [24.54, 129.73], [19.03, 121.61], [20.48, 114.36], [23.38, 107.69], [9.17, 105.37], [46.87, 95.8], [37.59, 91.74], [61.08, 78.4], [8.3, 85.94], [59.34, 56.36], [40.77, 54.14], [70.06, 35.77], [44.26, 35.77], [69.77, 22.72]];

/** A FIXED 4-frame boil for arbitrary rings: interior vertices wobble on a deterministic
 *  field (<=1.3px), each ring's top-most + bottom-most vertex PINNED so tip/base never drift,
 *  and the stroke breathes around the outline width. Deterministic → capture-safe. */
export function makeBoil(outer: [number, number][], seam: [number, number][], outline: number): BoilFrame[] {
  const A = 1.3;
  const ext = (pts: [number, number][]) => { let mn = Infinity, mx = -Infinity; for (const [, y] of pts) { if (y < mn) mn = y; if (y > mx) mx = y; } return { mn, mx }; };
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
  const wob = (pts: [number, number][], f: number, e: { mn: number; mx: number }) =>
    path(pts.map(([x, y], i) => (y <= e.mn + 0.01 || y >= e.mx - 0.01)
      ? [x, y] as [number, number]
      : [x + A * Math.sin(i * 1.3 + f * 1.7), y + A * Math.cos(i * 0.9 + f * 2.1)] as [number, number]));
  const eo = ext(outer), es = ext(seam);
  const sw = [0.92, 1.1, 0.84, 1.04].map((k) => +(outline * k).toFixed(2));
  return [0, 1, 2, 3].map((f) => ({ outer: wob(outer, f, eo), seam: wob(seam, f, es), sw: sw[f] }));
}

// Built-in default = Lee's FINAL bolt (also the fallback when no preset is loaded). White
// keyline per his config; red/blue are the brand primaries.
export const DEFAULT_BOLT_SPEC: BoltSpec = { frames: makeBoil(FINAL_OUTER, FINAL_SEAM, 8), viewBox: "-18.21 -2.26 109.27 146.96", ratio: 109.27 / 146.96, red: BRAND_RED, blue: BRAND_BLUE, cream: "#FFFFFF" };

export const BoltContext = createContext<BoltSpec>(DEFAULT_BOLT_SPEC);

const BOIL_CSS = `
@keyframes sa-boil { 0% { opacity: 1; } 24.99% { opacity: 1; } 25% { opacity: 0; } 100% { opacity: 0; } }
.sa-boil-f { animation: sa-boil 0.5s linear infinite; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .sa-boil-f { animation: none !important; opacity: 0; }
  .sa-boil-f:first-child { opacity: 1; }
}`;

export function BoltBoil({ height = 130, opacity = 1, red, blue, cream, className, style }:
  { height?: number; opacity?: number; red?: string; blue?: string; cream?: string; className?: string; style?: CSSProperties }) {
  const spec = useContext(BoltContext);
  const R = red ?? spec.red, B = blue ?? spec.blue, C = cream ?? spec.cream;
  return (
    <span className={className} style={{ display: "inline-block", width: height * spec.ratio, height, opacity, ...style }}>
      <style>{BOIL_CSS}</style>
      <svg viewBox={spec.viewBox} width="100%" height="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
        {spec.frames.map((f, i) => (
          <g key={i} className="sa-boil-f" style={{ animationDelay: `${(-0.125 * i).toFixed(3)}s` }}>
            <path d={f.outer} fill={R} stroke={C === "none" ? undefined : C} strokeWidth={C === "none" ? 0 : f.sw} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
            <path d={f.seam} fill={B} />
          </g>
        ))}
      </svg>
    </span>
  );
}

/** "surv[bolt]ve" — the wordmark with the boiling bolt standing in for the "i". `size` is
 *  the cap-height in px; the bolt tracks it and drops slightly to sit on the baseline.
 *  Colours default to the active BoltSpec (so a loaded preset carries through). */
export function SurviveWordmark({ size, cream = BRAND_CREAM, style }: { size: number; cream?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.015em", color: cream, whiteSpace: "nowrap", ...style }}>
      surv
      <BoltBoil height={size * 1.14} style={{ margin: `0 ${(size * -0.008).toFixed(1)}px`, transform: `translateY(${(size * 0.155).toFixed(1)}px)` }} />
      ve
    </span>
  );
}

/** Fixed 1920x1080 stage scaled by `scale` for preview. `transparent` drops the navy so
 *  the card can be keyed in OBS. The outer box takes the SCALED size so it lays out cleanly. */
export function Stage({ scale = 1, transparent = false, style, children }:
  { scale?: number; transparent?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto", ...style }}>
      <div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", background: transparent ? "transparent" : BRAND_NAVY, display: "grid", placeItems: "center" }}>
        {children}
      </div>
    </div>
  );
}
