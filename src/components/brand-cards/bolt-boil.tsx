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

// THE MARK (2026-09-04) — ONE HUE, TWO VALUES. The seam is no longer a second
// colour but the SHADOW of the first, so the bolt reads as one folded object
// rather than two halves of a divided field. Two things fall out of that: the
// red/blue bisection that invited the Grateful Dead comparison is gone, and a
// campus recolour becomes one darken instead of a colour-pairing problem.
export const BOLT_LIT = "#006BA6";
export const BOLT_SHADE = "#00456E";
/** The red/blue-era names. Kept as aliases so every call site keeps working —
 *  they have always meant "the lit face" and "the shaded face", never the hues. */
export const BRAND_RED = BOLT_LIT;
export const BRAND_BLUE = BOLT_SHADE;
export const BRAND_CREAM = "#F5EFE6";
export const BRAND_NAVY = "#111A32";

export type BoilFrame = { outer: string; seam: string; sw: number;
  /** THE ECHO MARK (2026-09-05): `seam` is a full copy of the bolt slid behind
   *  `outer`, not a half. Both are stroked, then both are filled again on top,
   *  so the keyline shows only around the union — no white where red meets blue. */
  echo?: boolean;
  /** THE MOUNTAIN (2026-09-05): a third ring — the snow cap — drawn in cream on top. */
  cap?: string };
export type BoltSpec = { frames: BoilFrame[]; viewBox: string; ratio: number; red: string; blue: string; cream: string };

// Lee's FINAL hand-edited bolt (baked from his Logo Lab preset — the canonical logo). These
// are the exact dry rings; the boil wobbles their interiors. Keep in sync with brand.tsx
// BOLT_OUTER / BOLT_RIGHT (same shape, decomposed into points so the boil can perturb them).
const FINAL_OUTER: [number, number][] = [[85.46, 8.38], [66.89, 32.29], [85.06, 31.98], [54.88, 51.08], [77.05, 50.77], [43.48, 73.57], [76.74, 73.57], [49.77, 92.03], [63.19, 94.82], [28.39, 111.14], [42.56, 112.07], [18.22, 120.69], [22.53, 128.7], [-8.27, 137.63], [15.14, 108.99], [-10.73, 108.06], [26.85, 92.35], [-11.54, 90.51], [34.22, 62.78], [3.83, 64.94], [41.41, 44], [25.99, 39.73]];
const FINAL_SEAM: [number, number][] = [[84.97, 8.22], [25.96, 40.07], [42.92, 44.46], [2.88, 65.4], [34.3, 61.71], [-10.67, 90.66], [28.14, 91.89], [-12.21, 106.98], [14.99, 110.04], [-10.11, 138.7], [24.54, 129.73], [19.03, 121.61], [20.48, 114.36], [23.38, 107.69], [9.17, 105.37], [46.87, 95.8], [37.59, 91.74], [61.08, 78.4], [8.3, 85.94], [59.34, 56.36], [40.77, 54.14], [70.06, 35.77], [44.26, 35.77], [69.77, 22.72]];

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

export function BoltBoil({ height = 130, opacity = 1, red, blue, cream, className, style, boilFrame, boilSeconds }:
  { height?: number; opacity?: number; red?: string; blue?: string; cream?: string; className?: string; style?: CSSProperties;
    /** A calmer boil (default 0.5 s per four frames). The cold open uses ~1.2. */
    boilSeconds?: number;
    /** DETERMINISTIC BOIL (blast-off frames, 2026-08-30). Undefined = the CSS
     *  animation, which is wall-clock and therefore unrenderable frame-by-frame.
     *  Given a number, exactly ONE boil frame is drawn with no animation, so the
     *  same progress value always produces the same pixels — what an offline
     *  renderer needs. Wraps, so callers can pass a raw tick. */
    boilFrame?: number }) {
  const spec = useContext(BoltContext);
  const pinned = boilFrame !== undefined
    ? ((Math.floor(boilFrame) % spec.frames.length) + spec.frames.length) % spec.frames.length
    : null;
  // Colours fall back through CSS variables so a themed FrameStage (frames/) can recolour any
  // bolt inside it for a school variant — with the brand/spec colour as the var fallback, so
  // every bolt OUTSIDE a FrameStage renders exactly as before. An explicit prop still wins.
  const R = red ?? `var(--bolt-primary, ${spec.red})`, B = blue ?? `var(--bolt-secondary, ${spec.blue})`, C = cream ?? spec.cream;
  return (
    <span className={className} style={{ display: "inline-block", width: height * spec.ratio, height, opacity, ...style }}>
      <style>{BOIL_CSS}</style>
      <svg viewBox={spec.viewBox} width="100%" height="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
        {(pinned === null ? spec.frames : [spec.frames[pinned]]).map((f, i) => (
          <g key={i} className={pinned === null ? "sa-boil-f" : undefined}
             style={pinned === null ? { animationDelay: `${(-(boilSeconds ?? 0.5) / 4 * i).toFixed(3)}s`, ...(boilSeconds ? { animationDuration: `${boilSeconds}s` } : {}) } : undefined}>
            {f.echo ? (
              <>
                <path d={f.seam} fill={B} stroke={C === "none" ? undefined : C} strokeWidth={C === "none" ? 0 : f.sw} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
                <path d={f.outer} fill={R} stroke={C === "none" ? undefined : C} strokeWidth={C === "none" ? 0 : f.sw} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
                <path d={f.seam} fill={B} />
                <path d={f.outer} fill={R} />
              </>
            ) : (
              <>
                <path d={f.outer} fill={R} stroke={C === "none" ? undefined : C} strokeWidth={C === "none" ? 0 : f.sw} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
                <path d={f.seam} fill={B} />
                {f.cap && <path d={f.cap} fill={C === "none" ? "#F5EFE6" : C} />}
              </>
            )}
          </g>
        ))}
      </svg>
    </span>
  );
}

/** "surv[bolt]ve" — the wordmark with the boiling bolt standing in for the "i". `size` is
 *  the cap-height in px; the bolt tracks it and drops slightly to sit on the baseline.
 *  Colours default to the active BoltSpec (so a loaded preset carries through). */
export function SurviveWordmark({ size, cream = BRAND_CREAM, style, boilFrame, red, blue, boltCream, boltScale = 0.8, boltGap = 0.03 }: { size: number; cream?: string; style?: CSSProperties; boilFrame?: number;
  /** Recolour the bolt-as-"i". Left off it keeps the brand red/blue. A MONOCHROME lockup passes the
   *  text colour as red, the surface behind it as blue and "none" as boltCream, which turns the
   *  two-tone mark into one silhouette with its seam cut out — the navbar wants the wordmark to
   *  read as type, not as a piece of art competing with the page. */
  red?: string; blue?: string; boltCream?: string;
  /** Bolt height as a fraction of the type size, and the air either side of it.
   *  0.8 / 0.03 is the baked Logo Lab lockup and stays the default everywhere.
   *  SMALL SIZES NEED MORE (2026-09-04): at 19px the bolt is ~15px tall carrying
   *  twelve serrations, so each tooth lands under a pixel, the teeth average out,
   *  and the mark reads as a forward slash between "surv" and "ve". A taller bolt
   *  with more air either side gives the teeth something to be and separates it
   *  from the letters, so it reads as a glyph rather than as punctuation. */
  boltScale?: number; boltGap?: number }) {
  // Bolt-as-"i" placement baked from Lee's FINAL Logo Lab wordmark params so the cards match
  // /logo-lab exactly (previously the bolt was oversized): boltScale 0.8, baseline drop 0.13,
  // kerning 0.005 + overlap L -0.02 / R 0.025, offX -1px@wordSize96, rotate 2°, pivot 100%/51%.
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: cream, whiteSpace: "nowrap", ...style }}>
      surv
      <BoltBoil height={size * boltScale} boilFrame={boilFrame} red={red} blue={blue} cream={boltCream} style={{ marginLeft: size * (boltGap * -0.5), marginRight: size * boltGap, transform: `translate(${size * (-1 / 96)}px, ${size * 0.13}px) rotate(2deg)`, transformOrigin: "100% 51%" }} />
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
