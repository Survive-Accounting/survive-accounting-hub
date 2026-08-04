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
/** Wordmark face: heavy, slightly-rounded LOWERCASE display sans (Rubik Black).
 *  Swap this ONE constant to change the wordmark everywhere (e.g. 'Baloo 2'). */
export const BRAND_DISPLAY = "'Rubik', system-ui, -apple-system, sans-serif";
export const BRAND_DISPLAY_WEIGHT = 900;

export const BRAND_RED = "#C62828";
export const BRAND_BLUE = "#1565C0";
export const BRAND_WHITE = "#FFFFFF";

// ---- bolt geometry — hand-traced 13-point Grateful Dead bolt --------------------
// NOT a formula. Two hand-tuned flanks (_RIGHT + _LEFT, each top→bottom, left always
// left of right so the body never pinches) trace an irregular, leaning lightning
// bolt: a top flag, sharp teeth of VARYING sizes (biggest = the upper-right
// shoulder, decaying downward), and a clean taper to the bottom tip. To reshape it,
// nudge these coordinates. The red/blue split runs down an internal lightning SEAM
// — red left, blue right, meeting directly (NO white between); the white keyline is
// only on the OUTSIDE of the silhouette.
type Pt = [number, number];
const OUTLINE = 8; // white keyline stroke width (half shows outside the fill)
const _RIGHT: Pt[] = [[62, 4], [62, 16], [74, 22], [58, 34], [72, 45], [52, 56], [62, 66], [47, 77], [53, 87], [42, 98], [45, 106], [37, 116], [32, 130]];
const _LEFT: Pt[] = [[62, 4], [48, 14], [54, 24], [37, 34], [49, 45], [33, 56], [44, 66], [31, 77], [39, 87], [30, 98], [35, 106], [32, 130]];
const _SEAM: Pt[] = [[62, 4], [55, 16], [59, 34], [45, 56], [48, 77], [35, 98], [38, 116], [32, 130]];
const _rev = (a: Pt[]) => [...a].reverse();
const toPath = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
/** Full silhouette (c1 fill + the white outer keyline): down the right flank, up
 *  the left flank. */
export const BOLT_OUTER = toPath([..._RIGHT, ..._rev(_LEFT).slice(1, -1)]);
/** BLUE (right) region: down the internal seam, up the right flank. Overlaid on the
 *  red base so red = left, blue = right, meeting along the seam with NO gap. */
export const BOLT_RIGHT = toPath([..._SEAM, ..._rev(_RIGHT).slice(1, -1)]);
// viewBox from the actual point bounds (+ keyline padding).
const _all = [..._RIGHT, ..._LEFT, ..._SEAM];
const _xs = _all.map((p) => p[0]), _ys = _all.map((p) => p[1]);
const _pad = OUTLINE / 2 + 2;
const _x0 = Math.min(..._xs) - _pad, _y0 = Math.min(..._ys) - _pad;
const _w = Math.max(..._xs) - _x0 + _pad, _h = Math.max(..._ys) - _y0 + _pad;
export const BOLT_VIEWBOX = `${_x0} ${_y0} ${_w} ${_h}`;
export const BOLT_RATIO = _w / _h;

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
  // The bolt is the "i" in "surv·i·ve": a touch taller than the letters, leaning.
  const boltH = Math.round(size * 1.12);
  const gap = Math.round(size * -0.01);
  const boltEl = <span style={{ display: "inline-block", height: boltH, width: Math.round(boltH * BOLT_RATIO), verticalAlign: "baseline", margin: `0 ${gap}px`, transform: `translateY(${Math.round(size * 0.16)}px)` }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  // wordmark: heavy, slightly-rounded LOWERCASE display sans — "survive".
  const word = (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: BRAND_DISPLAY, fontWeight: BRAND_DISPLAY_WEIGHT, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: ink }}>
      surv{boltEl}ve
    </span>
  );
  if (mode === "bolt") return <span style={{ display: "inline-block", height: size, width: Math.round(size * BOLT_RATIO), ...style }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  if (mode === "wordmark") return <span style={{ display: "inline-flex", ...style }}>{word}</span>;
  if (mode === "lockup") return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: Math.round(size * 0.1), ...style }}>
      <span style={{ textAlign: "center" }}>{word}</span>
      {/* ACCOUNTING flanked by a rule of each bolt colour (house = red left / blue
          right; a school colourway uses its own two colours) */}
      <span style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.12), padding: `0 ${Math.round(size * 0.04)}px` }}>
        <span style={{ flex: 1, height: Math.max(2, Math.round(size * 0.03)), borderRadius: 2, background: c1 }} />
        <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 600, fontSize: Math.round(size * 0.15), letterSpacing: "0.34em", textTransform: "uppercase", color: ink, whiteSpace: "nowrap", paddingLeft: "0.34em" }}>Accounting</span>
        <span style={{ flex: 1, height: Math.max(2, Math.round(size * 0.03)), borderRadius: 2, background: c2 }} />
      </span>
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
