// BRAND SYSTEM (Survive Accounting) — the ONE source for the lightning-bolt mark
// and the "Surv[bolt]ve" logo, used everywhere: the Logo Lab, the film watermark,
// the CEQ box, and the logo design-element card.
//
// The bolt is a single angular lightning letterform (it doubles as the "i" in the
// wordmark). It is TWO-TONE by default (a diagonal hard split — brand red / blue)
// with a white keyline, but every colour is data: swap the two fills for mono,
// white, black, or any SEC school's colours. NO skull, no circle — a plain bolt,
// legally distinct.
import { useId } from "react";

import { BIG_FONT } from "./theme";

/** The canonical bolt silhouette (viewBox space). One shape, recoloured per use. */
export const BOLT_D = "M 64 4 L 26 72 L 48 72 L 36 136 L 82 60 L 58 60 L 76 4 Z";
export const BOLT_VIEWBOX = "-6 -6 112 152";
export const BOLT_RATIO = 100 / 140; // w/h — narrow + tall, so it works as the "i"

export interface BoltColors {
  /** left/upper fill (diagonal split). */ c1: string;
  /** right/lower fill. */ c2: string;
  /** outer keyline; "" for none. */ keyline?: string;
}
export interface ColorOption { id: string; name: string; c1: string; c2: string }

/** House presets — the kit's colour variants. white/black are mono (c1===c2). */
export const BOLT_PRESETS: ColorOption[] = [
  { id: "red-blue", name: "Red / Blue", c1: "#E0284A", c2: "#2C6FE0" },
  { id: "purple-gold", name: "Purple / Gold", c1: "#6A2FB5", c2: "#FFC72C" },
  { id: "crimson-gray", name: "Crimson / Gray", c1: "#9E1B32", c2: "#6B7280" },
  { id: "white", name: "White", c1: "#FFFFFF", c2: "#FFFFFF" },
  { id: "black", name: "Black", c1: "#141414", c2: "#141414" },
];

/** SEC conference school colours (primary / secondary). Extend freely — the bolt
 *  reads any two-colour pair. Current 16-team SEC. */
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

/** Resolve a colour option by id (preset first, then SEC). Falls back to red/blue. */
export function boltColorById(id: string | undefined): ColorOption {
  return [...BOLT_PRESETS, ...SEC_SCHOOLS].find((o) => o.id === id) ?? BOLT_PRESETS[0];
}

/** Raw SVG markup for the bolt — for the canvas/img contexts that need a string
 *  (dangerouslySetInnerHTML) rather than a React node. `uid` MUST be unique per
 *  instance so gradient ids don't collide when many render on one page. */
export function boltSvgMarkup(c: BoltColors, uid: string): string {
  const key = c.keyline ?? "#FFFFFF";
  const gid = `sa-bolt-${uid}`;
  const mono = c.c1.toLowerCase() === c.c2.toLowerCase();
  const fill = mono ? c.c1 : `url(#${gid})`;
  const defs = mono ? "" : `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0.5" stop-color="${c.c1}"/><stop offset="0.5" stop-color="${c.c2}"/></linearGradient></defs>`;
  const keyline = key ? ` stroke="${key}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"` : "";
  return `<svg viewBox="${BOLT_VIEWBOX}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${defs}<path d="${BOLT_D}" fill="${fill}"${keyline}/></svg>`;
}

/** The bolt as a React node (own useId → collision-free gradient). Fills its box;
 *  size it via the parent's width/height. */
export function Bolt({ c1, c2, keyline = "#FFFFFF", title, style, className }: BoltColors & { title?: string; style?: React.CSSProperties; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  const gid = `sa-bolt-${uid}`;
  const mono = c1.toLowerCase() === c2.toLowerCase();
  return (
    <svg viewBox={BOLT_VIEWBOX} width="100%" height="100%" className={className} style={style} role="img" aria-label={title ?? "Survive lightning bolt"}>
      {!mono && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.5" stopColor={c1} />
            <stop offset="0.5" stopColor={c2} />
          </linearGradient>
        </defs>
      )}
      <path d={BOLT_D} fill={mono ? c1 : `url(#${gid})`} stroke={keyline || undefined} strokeWidth={keyline ? 6 : undefined} strokeLinejoin="round" paintOrder="stroke" />
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

/** The full logo in any mode. `ink` colours the letters (kit rule: white/cream or
 *  near-black); the bolt carries its own colours. `size` is the cap height (px). */
export function BrandLogo({ mode, c1, c2, keyline, ink = "#141414", size = 48, slogan = "Cram videos by Lee Ingram", style }: {
  mode: LogoMode; c1: string; c2: string; keyline?: string; ink?: string; size?: number; slogan?: string; style?: React.CSSProperties;
}) {
  const boltH = Math.round(size * 1.16); // the bolt sits a touch proud of the caps
  const boltEl = <span style={{ display: "inline-block", height: boltH, width: Math.round(boltH * BOLT_RATIO), verticalAlign: "middle", margin: `0 ${Math.round(size * 0.02)}px` }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  const word = (
    <span style={{ display: "inline-flex", alignItems: "center", fontFamily: BIG_FONT, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: ink }}>
      Surv{boltEl}ve
    </span>
  );
  if (mode === "bolt") return <span style={{ display: "inline-block", height: size, width: Math.round(size * BOLT_RATIO), ...style }}><Bolt c1={c1} c2={c2} keyline={keyline} /></span>;
  if (mode === "wordmark") return <span style={{ display: "inline-flex", ...style }}>{word}</span>;
  if (mode === "lockup") return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.12), ...style }}>
      {word}
      <span style={{ height: Math.max(2, Math.round(size * 0.06)), width: "88%", borderRadius: 999, background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
      <span style={{ fontFamily: BIG_FONT, fontWeight: 700, fontSize: Math.round(size * 0.32), letterSpacing: "0.36em", textTransform: "uppercase", color: ink, paddingLeft: "0.36em" }}>Accounting</span>
    </span>
  );
  // slogan
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.1), ...style }}>
      {word}
      <span style={{ fontFamily: BIG_FONT, fontWeight: 600, fontSize: Math.round(size * 0.28), letterSpacing: "0.04em", color: ink, opacity: 0.85 }}>{slogan}</span>
    </span>
  );
}
