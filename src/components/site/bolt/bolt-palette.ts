// ANIMATED CAMPUS BOLT — COLOUR SELECTION.
//
// THE PROBLEM this file exists to solve: the bolt is a white-outlined object on a dark navy page,
// and roughly a QUARTER of the schools in the table list WHITE (or cream, or silver) as their
// secondary colour. Painting that into the right half of the bolt makes the right half disappear
// into its own keyline — the mark reads as half a bolt.
//
// THE RULE, not the exception list: a secondary that is too close to the white outline is replaced
// by the school's ACCENT (third) colour. "Too close to white" is measured, in two clauses:
//
//   1. NEAR-WHITE — lightness ≥ NEAR_WHITE_LIGHTNESS, no matter how colourful. Catches #FFFFFF,
//      Alabama's #F1F2F3, Nebraska's cream #F5F1E7, Oklahoma's #FDF9D8.
//   2. LIGHT AND WASHED OUT — lightness ≥ LIGHT_LIGHTNESS **and** chroma ≤ LIGHT_MAX_CHROMA.
//      Catches Mississippi State's silver #C8C8C8 and Ohio State's grey #A7B1B7.
//
// Chroma is (max − min) / 255 — ABSOLUTE colourfulness. HSL saturation was the obvious metric and
// is the wrong one: it calls Oklahoma's pale cream #FDF9D8 "90 % saturated" and would have kept
// it while a pure-luminance test would have thrown out LSU's gold. Lightness + chroma keeps every
// school gold and rejects every school white. Thirty-one of the sixty-six schools sit between the
// two, and the rule has to leave all of them exactly as their school specifies.
//
// Nothing here is campus-specific. BOLT_ACCENTS in bolt-config.ts is an OVERRIDE table for schools
// with a genuine vivid third colour; every other school gets a derived accent — a vivid tint (or,
// if the primary is already light, a deep shade) of its own primary. That is always on-brand,
// always saturated, and by construction can never fail the same light test.
import {
  ACCENT_MAX_TINT_SATURATION,
  ACCENT_MIN_SATURATION,
  ACCENT_MIX,
  ACCENT_PIVOT_LIGHTNESS,
  BOLT_ACCENTS,
  DARK_LIGHTNESS,
  LIGHT_LIGHTNESS,
  LIGHT_MAX_CHROMA,
  NEAR_WHITE_LIGHTNESS,
  NEUTRAL_ACCENT,
  USE_DARK_FALLBACK,
} from "./bolt-config";

/** One campus as the bolt sees it. `primary`/`secondary` are the school's stored hex; `accent` is
 *  the optional curated third colour (BOLT_ACCENTS supplies it for the schools that have one). */
export type BoltCampus = {
  id: string;
  name?: string;
  code?: string | null;
  primary: string;
  secondary: string;
  accent?: string | null;
};

export type BoltPalette = {
  /** Left half — always the school's primary, exact stored hex, full saturation. */
  leftColor: string;
  /** Right half — the secondary, or the accent when the secondary fails the contrast rule. */
  rightColor: string;
  /** What the right half WOULD have been. The lab prints both. */
  originalRight: string;
  usedFallback: boolean;
  /** Why, for the lab's diagnostics panel. */
  reason: "secondary" | "near-white" | "light-and-washed-out" | "near-black";
  /** Whether the fallback colour came from BOLT_ACCENTS or was derived from the primary. */
  accentSource: "none" | "curated" | "derived";
};

// ── hex ⇄ numbers ─────────────────────────────────────────────────────────────────────────────
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse #rgb / #rrggbb to 0–255 triples. Returns null for anything else (a CSS var, a colour
 *  name, an empty string) — callers treat "unparseable" as "leave it alone", because a colour we
 *  cannot measure is one we have no business replacing. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex?.trim().match(HEX);
  if (!m) return null;
  const s =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
export const rgbToHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((x) => clamp255(x).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

/** HSL lightness (0–1) — the midpoint of the brightest and darkest channel. */
export function lightness(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const mx = Math.max(...rgb) / 255,
    mn = Math.min(...rgb) / 255;
  return (mx + mn) / 2;
}

/** Absolute chroma (0–1) — how far from grey the colour is. NOT HSL saturation. */
export function chroma(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (Math.max(...rgb) - Math.min(...rgb)) / 255;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const mx = Math.max(R, G, B),
    mn = Math.min(R, G, B),
    d = mx - mn;
  const l = (mx + mn) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (mx === R) h = ((G - B) / d) % 6;
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/** Mix a colour toward white (t > 0) or black (t < 0) by |t|. Used for the flowing ribbon tones —
 *  a tonal wave of the SAME colour, never a slide toward grey. Non-hex input is passed through
 *  untouched, so an unresolved CSS var paints flat rather than breaking. */
export function shade(color: string, t: number): string {
  if (!t) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex(...(rgb.map((c) => c + (target - c) * k) as [number, number, number]));
}

// ── the rule ──────────────────────────────────────────────────────────────────────────────────

/** Is this colour too close to the WHITE OUTLINE to survive as the bolt's right half?
 *  Returns the clause that rejected it, or null if the colour is fine. */
export function whyTooLight(hex: string): "near-white" | "light-and-washed-out" | null {
  const l = lightness(hex),
    c = chroma(hex);
  if (l === null || c === null) return null; // unmeasurable → not our call to make
  if (l >= NEAR_WHITE_LIGHTNESS) return "near-white";
  if (l >= LIGHT_LIGHTNESS && c <= LIGHT_MAX_CHROMA) return "light-and-washed-out";
  return null;
}

/** The mirror clause, off by default (USE_DARK_FALLBACK). */
export function isTooDark(hex: string): boolean {
  const l = lightness(hex);
  return l !== null && l <= DARK_LIGHTNESS;
}

/** The accent for a school with no curated third colour: its own primary, moved ACCENT_MIX of the
 *  way toward white (if it is dark) or toward black (if it is already light), hue intact.
 *
 *  A FRACTION of the way, not to a fixed lightness — that distinction is the whole point. Setting a
 *  target lightness collapsed Texas A&M's #500000, Mississippi State's #660000, Indiana's #990000
 *  and three more onto the identical fire-engine red, because once you lighten a fully saturated
 *  dark red far enough, "maroon" is gone. Moving proportionally keeps a maroon a maroon and a navy
 *  a blue. Saturation is floored (so the result is never a grey, and so can never trip the very
 *  rule it answers) and capped on the tint side (so lightening does not go neon).
 *
 *  A school whose primary is ITSELF achromatic has no more-colourful version to derive from, and
 *  gets the neutral steel instead. */
export function deriveAccent(primary: string): string {
  const rgb = hexToRgb(primary);
  if (!rgb) return NEUTRAL_ACCENT;
  const { h, s, l } = rgbToHsl(...rgb);
  if (s < 0.06) return NEUTRAL_ACCENT;
  const tinting = l < ACCENT_PIVOT_LIGHTNESS;
  const targetL = tinting ? l + (1 - l) * ACCENT_MIX : l - l * ACCENT_MIX;
  const floored = Math.max(s, ACCENT_MIN_SATURATION);
  return hslToHex(h, tinting ? Math.min(floored, ACCENT_MAX_TINT_SATURATION) : floored, targetL);
}

/** The accent a campus should use — curated table first, derivation second. */
export function accentFor(campus: BoltCampus): { color: string; source: "curated" | "derived" } {
  const curated = campus.accent ?? BOLT_ACCENTS[campus.id];
  if (curated && hexToRgb(curated)) return { color: curated.toUpperCase(), source: "curated" };
  return { color: deriveAccent(campus.primary), source: "derived" };
}

/** THE ONE ENTRY POINT. Left is always the primary; right is the secondary unless the secondary
 *  fails the contrast rule, in which case it is the accent. */
export function getBoltPalette(
  campus: BoltCampus,
  opts: { useLightFallback?: boolean; useDarkFallback?: boolean } = {},
): BoltPalette {
  const useLight = opts.useLightFallback ?? true;
  const useDark = opts.useDarkFallback ?? USE_DARK_FALLBACK;
  const originalRight = campus.secondary;

  const lightReason = useLight ? whyTooLight(originalRight) : null;
  const darkReason =
    !lightReason && useDark && isTooDark(originalRight) ? ("near-black" as const) : null;
  const reason = lightReason ?? darkReason;

  if (!reason) {
    return {
      leftColor: campus.primary,
      rightColor: originalRight,
      originalRight,
      usedFallback: false,
      reason: "secondary",
      accentSource: "none",
    };
  }

  const accent = accentFor(campus);
  return {
    leftColor: campus.primary,
    rightColor: accent.color,
    originalRight,
    usedFallback: true,
    reason,
    accentSource: accent.source,
  };
}
