// School color safety helper.
//
// Defines a small, safe palette derived from a school's primary/secondary colors.
// School colors are ONLY used as accents (pill borders, dividers, tiny badges).
// Surface backgrounds, body text, and the primary red CTA always stay default.
//
// If a color is missing, unparseable, or fails contrast checks, the value
// falls back to the corresponding Survive Accounting default.

export const DEFAULT_NAVY = "#14213D";
export const DEFAULT_RED = "#CE1126";
export const DEFAULT_LIGHT_BG = "#F8FAFC";
export const DEFAULT_BORDER = "#E5E7EB";
export const WHITE = "#FFFFFF";

export interface SchoolPalette {
  /** Border for course-code pills (always safe — borders are low-risk). */
  pillBorder: string;
  /** Background for course-code pills. Light fill only — text stays navy. */
  pillBackground: string;
  /** Text color inside pill (always navy or white depending on bg). */
  pillText: string;
  /** Small horizontal accent divider. */
  accentDivider: string;
  /** Tiny circular badge (≤8px) shown next to "Accounting Help for …". */
  eyebrowBadge: string;
  /** Subtle hero glow (very low opacity radial). */
  heroGlow: string;
  /** Secondary CTA border (outline buttons only). */
  secondaryCtaBorder: string;
  /** Whether any school color is actually being applied. */
  usingSchoolColors: boolean;
  /** Human-readable notes about what was downgraded and why. */
  notes: string[];
}

export const DEFAULT_PALETTE: SchoolPalette = {
  pillBorder: DEFAULT_NAVY,
  pillBackground: DEFAULT_LIGHT_BG,
  pillText: DEFAULT_NAVY,
  accentDivider: DEFAULT_RED,
  eyebrowBadge: DEFAULT_RED,
  heroGlow: "rgba(206,17,38,0.06)",
  secondaryCtaBorder: DEFAULT_NAVY,
  usingSchoolColors: false,
  notes: [],
};

// ---------- color math ----------

function parseHex(input?: string | null): [number, number, number] | null {
  if (!input) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return 0;
  const la = relLuminance(ra);
  const lb = relLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function normalize(hex?: string | null): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const h = rgb
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
  return `#${h.toUpperCase()}`;
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(20,33,61,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function isTooDark(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return relLuminance(rgb) < 0.08;
}

function isTooLight(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return relLuminance(rgb) > 0.92;
}

// ---------- public API ----------

export interface BuildPaletteInput {
  primary?: string | null;
  secondary?: string | null;
  useSchoolColors: boolean;
  colorReviewStatus: "pending" | "approved" | "rejected";
  fallbackToDefaultColors: boolean;
}

/**
 * Build a safe accent palette from a school's colors.
 * Falls back to DEFAULT_PALETTE when the school hasn't opted in, colors
 * aren't approved, fallback is forced, or both inputs are invalid.
 */
export function buildSchoolPalette(input: BuildPaletteInput): SchoolPalette {
  if (!input.useSchoolColors) return DEFAULT_PALETTE;
  if (input.fallbackToDefaultColors) return DEFAULT_PALETTE;
  if (input.colorReviewStatus !== "approved") return DEFAULT_PALETTE;

  const primary = normalize(input.primary);
  const secondary = normalize(input.secondary);
  if (!primary && !secondary) return DEFAULT_PALETTE;

  const notes: string[] = [];

  // Pill border: always safe — borders are tiny strokes.
  const pillBorder = primary ?? secondary ?? DEFAULT_NAVY;

  // Pill background: only fill with school color when it's light enough that
  // navy text reads clearly on it. Otherwise stay on the default light bg.
  let pillBackground = DEFAULT_LIGHT_BG;
  let pillText = DEFAULT_NAVY;
  if (primary && !isTooLight(primary)) {
    if (contrast(primary, DEFAULT_NAVY) >= 4.5) {
      pillBackground = primary;
      pillText = DEFAULT_NAVY;
    } else if (contrast(primary, WHITE) >= 4.5 && !isTooDark(primary)) {
      pillBackground = primary;
      pillText = WHITE;
    } else {
      notes.push("Primary color contrast too low for pill fill — using border only.");
    }
  }

  // Accent divider — any color is fine, it's a 1-2px line.
  const accentDivider = secondary ?? primary ?? DEFAULT_RED;

  // Eyebrow badge sits on the navy eyebrow bar.
  // Needs >= 3:1 contrast against navy (UI-component standard).
  let eyebrowBadge = DEFAULT_RED;
  const candidate = primary ?? secondary;
  if (candidate && contrast(candidate, DEFAULT_NAVY) >= 3) {
    eyebrowBadge = candidate;
  } else if (candidate) {
    notes.push("Primary color too dark on navy eyebrow — using default red badge.");
  }

  // Hero glow — always rendered at very low opacity, safe for any color.
  const glowSource = primary ?? secondary ?? DEFAULT_RED;
  const heroGlow = withAlpha(glowSource, 0.08);

  // Secondary CTA border — outline only.
  const secondaryCtaBorder = primary ?? secondary ?? DEFAULT_NAVY;

  return {
    pillBorder,
    pillBackground,
    pillText,
    accentDivider,
    eyebrowBadge,
    heroGlow,
    secondaryCtaBorder,
    usingSchoolColors: true,
    notes,
  };
}

/** Quick contrast check exposed for the review modal. */
export function colorReport(hex?: string | null): {
  valid: boolean;
  hex: string | null;
  luminance: number | null;
  contrastVsWhite: number;
  contrastVsNavy: number;
  tooDark: boolean;
  tooLight: boolean;
} {
  const norm = normalize(hex);
  if (!norm) {
    return {
      valid: false,
      hex: null,
      luminance: null,
      contrastVsWhite: 0,
      contrastVsNavy: 0,
      tooDark: false,
      tooLight: false,
    };
  }
  const rgb = parseHex(norm)!;
  return {
    valid: true,
    hex: norm,
    luminance: relLuminance(rgb),
    contrastVsWhite: contrast(norm, WHITE),
    contrastVsNavy: contrast(norm, DEFAULT_NAVY),
    tooDark: isTooDark(norm),
    tooLight: isTooLight(norm),
  };
}
