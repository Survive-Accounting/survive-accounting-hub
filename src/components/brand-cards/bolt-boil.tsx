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

export const BRAND_RED = "#D8443F";
export const BRAND_BLUE = "#2E6FB0";
export const BRAND_CREAM = "#F5EFE6";
export const BRAND_NAVY = "#111A32";

export type BoilFrame = { outer: string; seam: string; sw: number };
export type BoltSpec = { frames: BoilFrame[]; viewBox: string; ratio: number; red: string; blue: string; cream: string };

// Built-in default = the canonical brand bolt (also the fallback when no preset is loaded).
const DEFAULT_FRAMES: BoilFrame[] = [
  { outer: "M62.00 4.00 L63.25 16.81 L74.67 21.70 L57.11 32.82 L70.85 43.83 L52.28 55.73 L63.30 66.83 L47.41 78.30 L51.92 87.79 L41.01 97.68 L45.55 104.82 L38.28 114.84 L32.00 130.00 L35.55 104.82 L29.01 97.68 L37.92 87.79 L31.41 78.30 L45.30 66.83 L33.28 55.73 L47.85 43.83 L36.11 32.82 L54.67 23.70 L49.25 14.81 Z", seam: "M62.00 4.00 L56.25 16.81 L59.67 33.70 L44.11 54.82 L46.85 75.83 L35.28 97.73 L39.30 116.83 L32.00 130.00 L38.28 114.84 L45.55 104.82 L41.01 97.68 L51.92 87.79 L47.41 78.30 L63.30 66.83 L52.28 55.73 L70.85 43.83 L57.11 32.82 L74.67 21.70 L63.25 16.81 Z", sw: 2.0 },
  { outer: "M62.00 4.00 L62.18 14.71 L72.81 21.06 L57.18 34.11 L72.75 46.09 L53.22 57.24 L61.90 66.45 L45.72 76.32 L52.42 85.71 L42.96 97.07 L46.10 106.14 L36.63 117.10 L32.00 130.00 L36.10 106.14 L30.96 97.07 L38.42 85.71 L29.72 76.32 L43.90 66.45 L34.22 57.24 L49.75 46.09 L36.18 34.11 L52.81 23.06 L48.18 12.71 Z", seam: "M62.00 4.00 L55.18 14.71 L57.81 33.06 L44.18 56.11 L48.75 78.09 L36.22 99.24 L37.90 116.45 L32.00 130.00 L36.63 117.10 L46.10 106.14 L42.96 97.07 L52.42 85.71 L45.72 76.32 L61.90 66.45 L53.22 57.24 L72.75 46.09 L57.18 34.11 L72.81 21.06 L62.18 14.71 Z", sw: 2.4 },
  { outer: "M62.00 4.00 L60.70 16.49 L73.64 23.25 L59.11 35.06 L72.95 45.07 L51.41 55.03 L60.73 64.72 L46.91 76.38 L54.23 87.51 L42.74 99.25 L44.17 107.05 L35.81 116.05 L32.00 130.00 L34.17 107.05 L30.74 99.25 L40.23 87.51 L30.91 76.38 L42.73 64.72 L32.41 55.03 L49.95 45.07 L38.11 35.06 L53.64 25.25 L46.70 14.49 Z", seam: "M62.00 4.00 L53.70 16.49 L58.64 35.25 L46.11 57.06 L48.95 77.07 L34.41 97.03 L36.73 114.72 L32.00 130.00 L35.81 116.05 L44.17 107.05 L42.74 99.25 L54.23 87.51 L46.91 76.38 L60.73 64.72 L51.41 55.03 L72.95 45.07 L59.11 35.06 L73.64 23.25 L60.70 16.49 Z", sw: 1.8 },
  { outer: "M62.00 4.00 L62.15 16.79 L75.28 21.68 L58.54 32.82 L71.00 43.84 L50.93 55.75 L62.43 66.84 L48.30 78.30 L53.27 87.77 L40.85 97.66 L44.11 104.81 L37.68 114.85 L32.00 130.00 L34.11 104.81 L28.85 97.66 L39.27 87.77 L32.30 78.30 L44.43 66.84 L31.93 55.75 L48.00 43.84 L37.54 32.82 L55.28 23.68 L48.15 14.79 Z", seam: "M62.00 4.00 L55.15 16.79 L60.28 33.68 L45.54 54.82 L47.00 75.84 L33.93 97.75 L38.43 116.84 L32.00 130.00 L37.68 114.85 L44.11 104.81 L40.85 97.66 L53.27 87.77 L48.30 78.30 L62.43 66.84 L50.93 55.75 L71.00 43.84 L58.54 32.82 L75.28 21.68 L62.15 16.79 Z", sw: 2.2 },
];
export const DEFAULT_BOLT_SPEC: BoltSpec = { frames: DEFAULT_FRAMES, viewBox: "24 -2 56 138", ratio: 56 / 138, red: BRAND_RED, blue: BRAND_BLUE, cream: BRAND_CREAM };

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
