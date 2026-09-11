// THE BRAND KIT — the colours, faces and campus colourways the thumbnail and social-asset
// generators draw with (/branding/thumbnails, /branding/social, and the cover step inside
// post-production).
//
// Lee, 2026-09-11: "Do not invent a new visual identity… Do not approximate these if the actual
// assets already exist." So nothing here is new. Every value is imported from where the app already
// keeps it, and the one that lives only in CSS is pinned to that file by a test:
//
//   navy    styles.css --brand-navy — the site's and the OG cards' navy. (bolt-boil's BRAND_NAVY,
//           #111A32, is the film stage's darker one; the kit stays with the site's.)
//   cream   BRAND_CREAM — the wordmark's own ink
//   black   the /learn short cards' ground (learn-theme .lk-short)
//   bolt    BOLT_LIT / BOLT_SHADE — the neutral tonal mark of 2026-09-04. A campus keeps its two
//           school colours (Lee: "Let's still show the two school colors").
//   faces   BRAND_DISPLAY (Rubik 900) and BRAND_SANS (Inter), embedded on export from the same
//           Google TTFs the OG route already ships in public/fonts.
import { BOLT_LIT, BOLT_SHADE, BRAND_DISPLAY, BRAND_SANS, BRAND_WHITE } from "@/components/canvas/brand";
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { CTA_RED } from "@/components/brand-cards/chain-lightning";
import { boltForSlug, schoolById } from "@/lib/schools";

export const KIT = {
  /** styles.css `--brand-navy` (brand-kit.test.ts reads the stylesheet and holds this to it). */
  navy: "#14213D",
  cream: BRAND_CREAM,
  black: "#000000",
  keyline: BRAND_WHITE,
  boltLit: BOLT_LIT,
  boltShade: BOLT_SHADE,
  /** The outro's call-to-action pill. */
  ctaRed: CTA_RED,
  display: BRAND_DISPLAY,
  sans: BRAND_SANS,
} as const;

/** The faces the art sets type in, and the file each is embedded from on export — an SVG painted
 *  into a canvas can see no web font except the ones carried inside it. These are the only weights
 *  the art uses; a new weight means a new TTF in public/fonts. */
export const KIT_FONT_FILES = [
  { family: "Rubik", weight: 900, url: "/fonts/Rubik-Black.ttf" },
  { family: "Inter", weight: 800, url: "/fonts/Inter-ExtraBold.ttf" },
  { family: "Inter", weight: 600, url: "/fonts/Inter-SemiBold.ttf" },
] as const;

// ── colour arithmetic ────────────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a colour: ${hex}`);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 0 for a grey, a white or a black; ~1 for a pure hue. */
export function chroma(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// ── campus colourways ────────────────────────────────────────────────────────────────────────

/** A campus accent must read as a COLOUR on the navy — a dot, a hairline, a glow. */
const ACCENT_MIN_CONTRAST = 1.9;
const ACCENT_MIN_CHROMA = 0.25;

/** THE ONE CAMPUS COLOUR the small accents use (the bolt itself always gets both). Primary when it
 *  reads on the ground; else the secondary; else whichever of the two stands off it more. Needed
 *  because a school's primary is often exactly the wrong colour for a line on navy: Ole Miss's IS
 *  navy, LSU's purple sinks into it, and Tennessee's secondary is white, which reads as no campus
 *  at all. */
export function accentFor(c1: string, c2: string, ground: string = KIT.navy): string {
  const usable = (c: string) => chroma(c) >= ACCENT_MIN_CHROMA && contrastRatio(c, ground) >= ACCENT_MIN_CONTRAST;
  if (usable(c1)) return c1;
  if (usable(c2)) return c2;
  return contrastRatio(c1, ground) >= contrastRatio(c2, ground) ? c1 : c2;
}

export interface Colorway { id: string; name: string; c1: string; c2: string; accent: string }

/** "Generic Survive" — the tonal house bolt, what a student sees before picking a school. */
export const NEUTRAL_COLORWAY_ID = "survive";

/** A campus's colours, by picker id, from the school table (schools.generated.ts; SEC colours come
 *  from brand.tsx through the generator) — never retyped here. */
export function colorwayFor(id: string | null | undefined): Colorway {
  if (!id || id === NEUTRAL_COLORWAY_ID) {
    return { id: NEUTRAL_COLORWAY_ID, name: "Survive", c1: KIT.boltLit, c2: KIT.boltShade, accent: accentFor(KIT.boltLit, KIT.boltShade) };
  }
  const s = schoolById(id);
  if (!s) throw new Error(`No school "${id}" in the school table (schools.generated.ts).`);
  // boltForSlug is the app's one rule for a school's bolt, including the house-colour fallback
  // for a row the generator left without colours.
  const { c1, c2 } = boltForSlug(s.slug);
  return { id: s.id, name: s.name, c1, c2, accent: accentFor(c1, c2) };
}
