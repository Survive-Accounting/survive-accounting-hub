// READABLE CAMPUS INK — a school's colours are chosen for the school, not for our navy page.
//
// Ole Miss is the case that forced this: its primary is #14213D, a navy, and the page canvas is
// #0D1730, also a navy. "for OLE MISS students" rendered in the school's own primary was very
// nearly invisible — the campus line read as a blank space where a school name should be.
//
// The rule: try the school's PRIMARY, then its SECONDARY, and only if neither clears a contrast
// floor against the page do we lighten. Lightening is the last resort because a lightened school
// colour is no longer quite the school's colour; picking the secondary first keeps us inside the
// school's real palette (Ole Miss navy → Ole Miss red, which is exactly what a student expects).

/** Page canvas navy. Keep in sync with --bg-page / SITE_NAVY. */
export const PAGE_NAVY = "#0D1730";

const hex = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two hex colours (1 = identical, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const ca = hex(a), cb = hex(b);
  if (!ca || !cb) return 21;
  const la = luminance(ca), lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mix a colour toward white by `t` (0..1). */
function lighten(c: string, t: number): string {
  const rgb = hex(c);
  if (!rgb) return c;
  return toHex([rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t] as [number, number, number]);
}

/** The contrast floor. 3.0 is the WCAG AA bar for large/bold text, which is what every surface
 *  using this renders (the campus line, the switch label — all bold display type). */
const FLOOR = 3.0;

/** The school's colour, made readable on the page navy: primary if it clears the floor, else the
 *  secondary, else the better of the two lightened until it does. */
export function readableCampusInk(c1?: string | null, c2?: string | null, bg: string = PAGE_NAVY): string {
  const primary = c1 && hex(c1) ? c1 : null;
  const secondary = c2 && hex(c2) ? c2 : null;
  if (primary && contrastRatio(primary, bg) >= FLOOR) return primary;
  if (secondary && contrastRatio(secondary, bg) >= FLOOR) return secondary;
  // Neither works as-is (a school whose BOTH colours are dark, e.g. navy + black). Lighten the one
  // that starts closer to readable, in steps, so we move the minimum distance from the real colour.
  const base = primary && secondary
    ? (contrastRatio(primary, bg) >= contrastRatio(secondary, bg) ? primary : secondary)
    : primary ?? secondary;
  if (!base) return "var(--accent)";
  for (let t = 0.15; t <= 0.9; t += 0.15) {
    const lit = lighten(base, t);
    if (contrastRatio(lit, bg) >= FLOOR) return lit;
  }
  return lighten(base, 0.9);
}
