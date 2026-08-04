// BRAND SYSTEM (Survive Accounting) — implements the supplied brand kit (the
// single source of truth). NOT a redesign.
//
// THE BOLT is the signature. It is ONE lightning silhouette, split into red
// (left) and blue (right) by an INTERNAL SEAM that is itself a small lightning
// bolt: red and blue meet DIRECTLY along that jagged seam — there is NO white
// line between them. The WHITE outline is only on the OUTSIDE of the silhouette.
// (Implementation: fill the whole bolt with c1, overlay the right region in c2 —
// their shared edge is the seam, so no gap can appear; the white keyline is a
// stroke on the outer path only.)
//
// COLOURS are data: primary red #C62828 / blue #1565C0, white/black mono, and
// any SEC school's two colours. The seam split is identical across every use
// (wordmark, lockup, emblem, favicon, school colours).
import { useId } from "react";

/** Warm vintage display serif for the wordmark (closest available to the kit's
 *  heavy warm serif — high contrast, soft, NOT geometric). DM Serif Display is
 *  the loaded fallback. A clean sans is the companion for ACCOUNTING + slogan. */
export const BRAND_SERIF = "'Fraunces', 'DM Serif Display', Georgia, 'Times New Roman', serif";
export const BRAND_SANS = "'Inter', system-ui, -apple-system, sans-serif";
/** Soft, heavy optical settings so Fraunces reads warm + vintage, not sharp. */
export const BRAND_SERIF_VARIATION = "'opsz' 144, 'SOFT' 60, 'WONK' 0";

export const BRAND_RED = "#C62828";
export const BRAND_BLUE = "#1565C0";
export const BRAND_WHITE = "#FFFFFF";

// ---- bolt geometry — one silhouette + an internal lightning seam --------------
// LEFT_EDGE goes top→bottom down the outer left flank; RIGHT_EDGE goes bottom→top
// up the outer right flank; SEAM is the internal mini-bolt (top→bottom). The two
// colour regions are built from these so red+blue tile the whole bolt exactly.
type Pt = [number, number];
const T: Pt = [60, 6];   // top point
const B: Pt = [44, 144]; // bottom point
const LEFT_EDGE: Pt[] = [T, [30, 66], [46, 66], [26, 112], [40, 112], B];
const RIGHT_EDGE: Pt[] = [B, [84, 78], [64, 78], [86, 32], [66, 32], T];
const SEAM: Pt[] = [T, [41, 62], [55, 62], [37, 110], [49, 110], B];
const toPath = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
/** Full silhouette (used for the c1 fill + the white keyline stroke). */
export const BOLT_OUTER = toPath([T, ...LEFT_EDGE.slice(1), ...RIGHT_EDGE.slice(1)]);
/** The BLUE (right) region: down the seam, up the right edge — overlaid on the
 *  red base so red shows left, blue right, meeting exactly at the seam. */
export const BOLT_RIGHT = toPath([T, ...SEAM.slice(1), ...RIGHT_EDGE.slice(1)]);
export const BOLT_VIEWBOX = "18 -2 76 154";
export const BOLT_RATIO = 76 / 154; // w/h — narrow + tall, works as the "i"
const OUTLINE = 9; // white keyline stroke width (half shows outside the fill)

export interface BoltColors { c1: string; c2: string; keyline?: string }
export interface ColorOption { id: string; name: string; c1: string; c2: string }

/** House colourways — red/blue is primary; white + black are single-colour. */
export const BOLT_PRESETS: ColorOption[] = [
  { id: "red-blue", name: "Red / Blue", c1: BRAND_RED, c2: BRAND_BLUE },
  { id: "white", name: "White", c1: BRAND_WHITE, c2: BRAND_WHITE },
  { id: "black", name: "Black", c1: "#161616", c2: "#161616" },
];

/** SEC conference school colours (primary / secondary) — the two colours fill
 *  the two halves of the same bolt seam. Extend freely. Current 16-team SEC. */
export const SEC_SCHOOLS: ColorOption[] = [
  { id: "alabama", name: "Alabama", c1: "#9E1B32", c2: "#F1F2F3" },
  { id: "arkansas", name: "Arkansas", c1: "#9D2235", c2: "#FFFFFF" },
  { id: "auburn", name: "Auburn", c1: "#0C2340", c2: "#E87722" },
  { id: "florida", name: "Florida", c1: "#0021A5", c2: "#FA4616" },
  { id: "georgia", name: "Georgia", c1: "#BA0C2F", c2: "#000000" },
  { id: "kentucky", name: "Kentucky", c1: "#0033A0", c2: "#FFFFFF" },
  { id: "lsu", name: "LSU", c1: "#461D7C", c2: "#FDD023" },
  { id: "mississippi-state", name: "Mississippi State", c1: "#660000", c2: "#C8C8C8" },
  { id: "missouri", name: "Missouri", c1: "#F1B82D", c2: "#000000" },
  { id: "oklahoma", name: "Oklahoma", c1: "#841617", c2: "#FDF9D8" },
  { id: "ole-miss", name: "Ole Miss", c1: "#14213D", c2: "#CE1126" },
  { id: "south-carolina", name: "South Carolina", c1: "#73000A", c2: "#000000" },
  { id: "tennessee", name: "Tennessee", c1: "#FF8200", c2: "#FFFFFF" },
  { id: "texas", name: "Texas", c1: "#BF5700", c2: "#FFFFFF" },
  { id: "texas-am", name: "Texas A&M", c1: "#500000", c2: "#FFFFFF" },
  { id: "vanderbilt", name: "Vanderbilt", c1: "#1B1B1B", c2: "#C9A227" },
];

export function boltColorById(id: string | undefined): ColorOption {
  return [...BOLT_PRESETS, ...SEC_SCHOOLS].find((o) => o.id === id) ?? BOLT_PRESETS[0];
}

/** Raw SVG markup for the bolt (string form, for img/dangerouslySetInnerHTML). */
export function boltSvgMarkup(c: BoltColors, _uid?: string): string {
  const key = c.keyline ?? BRAND_WHITE;
  const mono = c.c1.toLowerCase() === c.c2.toLowerCase();
  const outline = key ? ` stroke="${key}" stroke-width="${OUTLINE}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"` : "";
  const blue = mono ? "" : `<path d="${BOLT_RIGHT}" fill="${c.c2}"/>`;
  return `<svg viewBox="${BOLT_VIEWBOX}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="${BOLT_OUTER}" fill="${c.c1}"${outline}/>${blue}</svg>`;
}

/** The bolt as a React node. Fills its box; size via the parent's width/height. */
export function Bolt({ c1, c2, keyline = BRAND_WHITE, title, style, className }: BoltColors & { title?: string; style?: React.CSSProperties; className?: string }) {
  const mono = c1.toLowerCase() === c2.toLowerCase();
  return (
    <svg viewBox={BOLT_VIEWBOX} width="100%" height="100%" className={className} style={style} role="img" aria-label={title ?? "Survive lightning bolt"}>
      {/* red (or mono) base + the white OUTER keyline (paint-order:stroke → the
          white sits outside the fill; the fill covers its inner half) */}
      <path d={BOLT_OUTER} fill={c1} stroke={keyline || undefined} strokeWidth={keyline ? OUTLINE : undefined} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
      {/* blue right region overlaid — shares the seam with red, so NO white gap */}
      {!mono && <path d={BOLT_RIGHT} fill={c2} />}
    </svg>
  );
}

export type LogoMode = "bolt" | "wordmark" | "lockup" | "slogan";
export const LOGO_MODES: { id: LogoMode; name: string }[] = [
  { id: "bolt", name: "Bolt" },
  { id: "wordmark", name: "Wordmark" },
  { id: "lockup", name: "Lockup" },
  { id: "slogan", name: "Slogan" },
];

/** The full logo in any mode. `ink` colours the letters (kit rule: cream/white
 *  or near-black); the bolt carries its own colours. `size` = cap height (px). */
export function BrandLogo({ mode, c1, c2, keyline, ink = "#141414", size = 48, slogan = "Cram videos by Lee Ingram", style }: {
  mode: LogoMode; c1: string; c2: string; keyline?: string; ink?: string; size?: number; slogan?: string; style?: React.CSSProperties;
}) {
  // The bolt reads as the "i": a touch taller than the caps, tight kerning so it
  // sits where the lowercase i would, not a hole.
  const boltH = Math.round(size * 1.14);
  const gap = Math.max(1, Math.round(size * -0.02)); // slight negative → no hole
  const boltEl = <span style={{ display: "inline-block", height: boltH, width: Math.round(boltH * BOLT_RATIO), verticalAlign: "baseline", margin: `0 ${gap}px`, transform: `translateY(${Math.round(size * 0.14)}px)` }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  const word = (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: BRAND_SERIF, fontVariationSettings: BRAND_SERIF_VARIATION, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.005em", color: ink }}>
      Surv{boltEl}ve
    </span>
  );
  if (mode === "bolt") return <span style={{ display: "inline-block", height: size, width: Math.round(size * BOLT_RATIO), ...style }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  if (mode === "wordmark") return <span style={{ display: "inline-flex", ...style }}>{word}</span>;
  if (mode === "lockup") return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.14), ...style }}>
      {word}
      {/* thin amber→red underline, ~ACCOUNTING width (not full wordmark width) */}
      <span style={{ height: Math.max(2, Math.round(size * 0.045)), width: "72%", borderRadius: 999, background: "linear-gradient(90deg, #F4A020, #C62828)" }} />
      <span style={{ fontFamily: BRAND_SANS, fontWeight: 600, fontSize: Math.round(size * 0.28), letterSpacing: "0.42em", textTransform: "uppercase", color: ink, paddingLeft: "0.42em" }}>Accounting</span>
    </span>
  );
  // slogan — clean sans companion, always secondary
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.08), ...style }}>
      {word}
      <span style={{ fontFamily: BRAND_SANS, fontWeight: 500, fontSize: Math.round(size * 0.26), letterSpacing: "0.01em", color: ink, opacity: 0.9 }}>{slogan}</span>
    </span>
  );
}
