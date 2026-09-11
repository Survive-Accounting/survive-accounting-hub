// BLACKBOARD (learn v3, 09-03) — the /learn room. Near-black, chalk text, ONE accent.
//
// The accent is the SCHOOL's colour when a school is known (Lee: "try the school accent color on
// the black, keep things readable"), and lime when it isn't. Readability is enforced, not hoped
// for: a school colour that can't clear 3:1 against the black is skipped for the school's other
// colour, and if neither clears, the accent falls back to lime. Text ON the accent picks whichever
// of black / chalk reads better. Everything downstream reads var(--lk-*).
//
// TWO LOOKS (Lee, 2026-09-10: "is it too dark? I want to see what it looks like with the same
// branding colors as the home page"). `look` picks the palette: "black" is the Blackboard above;
// "navy" is the HOME PAGE's palette (styles.css :root — --bg-page navy, --text-primary cream,
// --accent-primary gold, --bg-surface / --border-default), so /learn?look=navy renders the whole
// room in the marketing branding for a live side-by-side. The contrast rules are the same, run
// against whichever ground is live, and the no-school accent is gold on navy, lime on black.
// Components paint through LK (CSS variables), never INK's hex, so one switch re-themes the room.
//
// EIGHT LOOKS, ONE SHELL (Lee, 2026-09-11, after the design email: "give me a bunch of possible
// options to try with ?look=. I want to pick only the best one"). Six palettes join black and navy
// — cream (the email's), paper, chalk, charcoal, split, mono — each a full ladder stepped from its
// own anchors (docs/LEARN-REFACTOR-SESSION-CONTEXT.md Part E). What every look shares, by the
// email's rule: THE NAVBAR NO LONGER WEARS THE SCHOOL. Each palette carries its own `nav` ground
// (Survive navy, or the room's own dark), and the campus shows ONLY in the bolt, a thin
// campus-coloured hairline under the bar, the accent (buttons, the active pill, hover glows) and
// the topic bolts. Green is success only. `hero` lets one look (split) put the entrance on a
// different ground from the rows; `shadow` is tuned per ground so a card sits in front of a cream
// room as well as a black one. LEE PICKED CREAM (2026-09-11: "Let's go with Cream look") — it is
// DEFAULT_LOOK; ?look= still renders the other seven and ?looks=1 mounts the picker.
import type { CSSProperties } from "react";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import type { School } from "@/lib/schools";

export type Nav = { bg: string; text: string; muted: string; border: string };
export type Hero = { bg: string; text: string; muted: string };

export type Palette = {
  bg: string; surface: string; surface2: string; border: string; border2: string;
  text: string; muted: string; dim: string;
  /** The accent when no school colour reads on `bg`. */
  fallbackAccent: string;
  green: string; red: string;
  /** THE SHELL'S BAR (2026-09-11): the navbar's own ground and ink — never the school's. */
  nav: Nav;
  /** The entrance's ground when it differs from the canvas (split); absent → the canvas. */
  hero?: Hero;
  /** A card's drop shadow, tuned to the ground — heavy on dark, soft on light. */
  shadow: string;
  /** Which school colour the accent tries first: c2 (the bright one, today's rule) or c1 (mono). */
  accentFirst: "c1" | "c2";
};

/** Survive navy as a navbar — the home page's --brand-navy with its own text / border ladder. */
const NAVY_NAV: Nav = { bg: "#14213D", text: "#F7F0E6", muted: "#AAB4C8", border: "#34486D" };
/** A card's dimension on a dark room (the redesign's shadow) and on a light one. */
const DARK_SHADOW = "0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)";
const LIGHT_SHADOW = "0 10px 30px rgba(20,33,61,.10), 0 1px 2px rgba(20,33,61,.08), inset 0 1px 0 rgba(255,255,255,.7)";
/** Success on a light ground — the mint that reads on black does not read on cream. */
const GREEN_ON_LIGHT = "#1F9D57";
/** The home page's --brand-red (styles.css :root), as a hex the contrast maths can read. */
const BRAND_RED = "#CE1126";

/** The Blackboard. `lime` stays as the old name of the fallback accent — v3.learn reads it.
 *  The bar is a shade under the canvas (#0A0A0A) so it reads as a bar, not the school's ground. */
export const INK = {
  bg: "#111111",
  surface: "#1C1C1C",
  surface2: "#161616",
  border: "#2A2A2A",
  border2: "#3A3A3A",
  text: "#F2EFE6",
  muted: "#A9A69B",
  dim: "#6E6C64",
  lime: "#E8FF47",
  fallbackAccent: "#E8FF47",
  green: "#4EE8B4",
  red: "#FF5C6C",
  nav: { bg: "#0A0A0A", text: "#F2EFE6", muted: "#A9A69B", border: "#2A2A2A" },
  shadow: DARK_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette & { lime: string };

/** The home page's palette, by the same names. Values are styles.css :root — read, not invented:
 *  --bg-page, --bg-surface, --bg-input, --border-default, --text-primary, --text-secondary,
 *  --text-tertiary, --accent-primary. The bar is --brand-navy. */
export const NAVY = {
  bg: "#0D1730",
  surface: "#162443",
  surface2: "#111D35",
  border: "#34486D",
  border2: "#4A5F87",
  text: "#F7F0E6",
  muted: "#AAB4C8",
  dim: "#76839E",
  fallbackAccent: "#FFA611",
  green: "#4EE8B4",
  red: "#FF5C6C",
  nav: NAVY_NAV,
  shadow: DARK_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette;

/** THE EMAIL'S LOOK (2026-09-10, 11:19 PM): "a warm cream canvas rather than pure black or pure
 *  white … Keep your navy from the homepage as the permanent navigation color." Cards a lighter
 *  cream; ink is the brand navy; the fallback accent is the brand red. Video cards stay near-black
 *  (.lk-short), so the shorts pop off the cream. */
export const CREAM = {
  bg: "#F5F1E8",
  surface: "#FBF9F4",
  surface2: "#EFEAE0",
  border: "#E4DDD0",
  border2: "#D3CABA",
  text: "#14213D",
  muted: "#6E6B63",
  dim: "#9A968C",
  fallbackAccent: BRAND_RED,
  green: GREEN_ON_LIGHT,
  red: BRAND_RED,
  nav: NAVY_NAV,
  shadow: LIGHT_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette;

/** PAPER — the quiet Linear / Notion look: near-white, white cards, slate ink. Maximum thumbnail
 *  contrast; the least "designed" of the eight. */
export const PAPER = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surface2: "#F3F3EF",
  border: "#E5E7EB",
  border2: "#D1D5DB",
  text: "#0F172A",
  muted: "#64748B",
  dim: "#94A3B8",
  fallbackAccent: BRAND_RED,
  green: GREEN_ON_LIGHT,
  red: BRAND_RED,
  nav: NAVY_NAV,
  shadow: LIGHT_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette;

/** CHALK — between black and navy: dark enough for video, blue enough to feel like Survive. The
 *  bar is a deeper step of the same blue-black. */
export const CHALK = {
  bg: "#111827",
  surface: "#1A2233",
  surface2: "#151C2B",
  border: "#2B3548",
  border2: "#3B475E",
  text: "#F2EDE3",
  muted: "#A7B0C0",
  dim: "#7A8497",
  fallbackAccent: "#FFA611",
  green: "#4EE8B4",
  red: "#FF5C6C",
  nav: { bg: "#0B1220", text: "#F2EDE3", muted: "#A7B0C0", border: "#22304A" },
  shadow: DARK_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette;

/** CHARCOAL — warm dark: cream text on brown-black reads like the cream look at night. Survive
 *  navy stays the bar, so the shell is the same object over a warmer room. The brand red is too
 *  dark to clear 3:1 on this ground, so the fallback is the room's own lifted red. */
export const CHARCOAL = {
  bg: "#1C1B1A",
  surface: "#262422",
  surface2: "#211F1D",
  border: "#33302C",
  border2: "#45413C",
  text: "#F2EDE3",
  muted: "#A9A39A",
  dim: "#7C776F",
  fallbackAccent: "#FF5C6C",
  green: "#4EE8B4",
  red: "#FF5C6C",
  nav: NAVY_NAV,
  shadow: DARK_SHADOW,
  accentFirst: "c2",
} as const satisfies Palette;

/** SPLIT — Netflix-style: navbar AND hero on Survive navy, the rows on the cream canvas. The fold
 *  is the design: the dark brand up top gives way to a cream study surface under the first row. */
export const SPLIT = {
  ...CREAM,
  hero: { bg: "#14213D", text: "#F7F0E6", muted: "#AAB4C8" },
} as const satisfies Palette;

/** MONO — no navy at all: black bar, white-ish canvas, and the campus's c1 as the ONLY colour on
 *  the page (accentFirst c1; with no school the accent is the ink itself). The boldest, the most
 *  "skinned" of the eight. */
export const MONO = {
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  surface2: "#F0F0ED",
  border: "#E6E6E3",
  border2: "#D4D4D0",
  text: "#0B0B0B",
  muted: "#6B6B6B",
  dim: "#9A9A9A",
  fallbackAccent: "#0B0B0B",
  green: GREEN_ON_LIGHT,
  red: BRAND_RED,
  nav: { bg: "#0B0B0B", text: "#FFFFFF", muted: "#A3A3A3", border: "#262626" },
  shadow: LIGHT_SHADOW,
  accentFirst: "c1",
} as const satisfies Palette;

export type Look = "black" | "navy" | "cream" | "paper" | "chalk" | "charcoal" | "split" | "mono";
/** The look the page wears with no ?look= — Lee's pick (2026-09-11). */
export const DEFAULT_LOOK: Look = "cream";
export const LOOKS: Record<Look, Palette> = { black: INK, navy: NAVY, cream: CREAM, paper: PAPER, chalk: CHALK, charcoal: CHARCOAL, split: SPLIT, mono: MONO };
/** The picker's order — the two that exist, then Part E's build order. */
export const LOOK_ORDER: readonly Look[] = ["black", "navy", "cream", "paper", "chalk", "charcoal", "split", "mono"];
/** One line per look — why it might win (Part E's last column), shown under the picker. */
export const LOOK_NOTES: Record<Look, string> = {
  black: "Lee's 09-10 pick; Reels-native; video thumbnails disappear into it",
  navy: "matches the home page exactly; one brand, one door",
  cream: "warm, premium, a study tool not a feed; the shorts stay near-black and pop",
  paper: "the quiet Linear / Notion look; maximum thumbnail contrast; least designed",
  chalk: "between black and navy: dark enough for video, blue enough to feel like Survive",
  charcoal: "warm dark: cream text on brown-black reads like the cream look at night",
  split: "dark brand up top fading into a cream study canvas; the fold is the design",
  mono: "no navy: black, white, and the campus colour as the only colour; the boldest",
};
export function isLook(v: unknown): v is Look { return typeof v === "string" && Object.prototype.hasOwnProperty.call(LOOKS, v); }

/** What components paint with: the room's CSS variables, one per palette key, so the same JSX
 *  renders either look. Use these, not INK.*, anywhere a colour is painted. */
export const LK = {
  bg: "var(--lk-bg)",
  surface: "var(--lk-surface)",
  surface2: "var(--lk-surface2)",
  border: "var(--lk-border)",
  border2: "var(--lk-border2)",
  text: "var(--lk-text)",
  muted: "var(--lk-muted)",
  dim: "var(--lk-dim)",
  acc: "var(--lk-acc)",
  accInk: "var(--lk-acc-ink)",
  green: "var(--lk-green)",
  red: "var(--lk-red)",
  /** THE SHELL (2026-09-11): the entrance's ground / ink (= the canvas's unless the look splits),
   *  the bar's own rule for dividers inside it, and the card shadow tuned to the ground. */
  heroBg: "var(--lk-hero-bg)",
  heroText: "var(--lk-hero-text)",
  heroMuted: "var(--lk-hero-muted)",
  topRule: "var(--lk-top-rule)",
  shadow: "var(--lk-shadow)",
} as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lin(c: number): number { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
export function relLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const la = relLuminance(a), lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type LearnTheme = {
  look: Look;
  palette: Palette;
  accent: string;
  /** Text colour ON the accent. */
  accentInk: string;
  /** The school's dark colour, for the asks bar — null when no school. */
  primary: string | null;
  primaryInk: string;
  /** True when the accent is the school's, not the lime fallback. */
  schoolAccent: boolean;
  /** True on a light canvas (cream, paper, split, mono) — inputs and masks pick their scheme. */
  light: boolean;
  /** THE BAR IS THE SHELL'S (2026-09-11, the design email: "The NAVBAR should always remain
   *  Survive navy … Add a very thin campus-colored line along the bottom of the navbar"). The
   *  ground and ink are the palette's own `nav`; the campus shows as `topBorder`, the hairline —
   *  the first of the school's colours that is visible against the bar, else the accent. `topRule`
   *  is the bar's own quiet divider, for the lines INSIDE it. (Until 09-11 the bar wore c1 as its
   *  ground and c2 as its rule — topBarFor's history; the email reversed it.) */
  topBg: string;
  topBorder: string;
  topRule: string;
  topInk: string;
  topMuted: string;
};

/** The ink that reads best ON a colour — the palette's text or its canvas, whichever clears more.
 *  On a dark room that is chalk-or-black (as before); on cream it is navy-or-cream, so a red button
 *  gets cream letters, not black ones. */
function inkOn(bg: string, p: Palette): string {
  return contrast(bg, p.bg) > contrast(bg, p.text) ? p.bg : p.text;
}

/** `#RRGGBB` at an alpha — for muted text on a coloured ground where the palette's muted (tuned
 *  for its own canvas) may not read. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex;
}

export type TopBar = { bg: string; border: string; rule: string; ink: string; muted: string };

/** How visible the hairline has to be against the bar to count as the campus's line. Well under
 *  the 3:1 text bar: a 2px line only has to be seen, not read. */
const HAIRLINE_MIN = 1.6;

/** The top bar's colours for a school's (c1, c2) in a palette: the palette's own bar, with the
 *  campus as the hairline beneath it — c1 first (the primary), then c2, whichever shows against
 *  the bar; no school, or neither visible → `fallback` (the room's accent), then the palette's own
 *  fallback accent, then the bar's ink — so there is always a visible line, never an invisible one. */
export function topBarFor(c1: string | null | undefined, c2: string | null | undefined, p: Palette = INK, fallback: string = p.fallbackAccent): TopBar {
  const line = [c1, c2, fallback, p.fallbackAccent, p.nav.text].find((c): c is string => !!c && !!hexToRgb(c) && contrast(c, p.nav.bg) >= HAIRLINE_MIN) ?? p.nav.text;
  return { bg: p.nav.bg, border: line, rule: p.nav.border, ink: p.nav.text, muted: p.nav.muted };
}

/** The theme for a school (or none) in a look (default: the Blackboard). Candidates are the
 *  school's bright colour first, then its dark one (mono: the dark one first); the first that
 *  clears 3:1 on the ground wins. */
export function themeFor(school: Pick<School, "c1" | "c2"> | null | undefined, look: Look = DEFAULT_LOOK): LearnTheme {
  const p = LOOKS[look];
  const c1 = school?.c1 ?? null, c2 = school?.c2 ?? null;
  const ordered = p.accentFirst === "c1" ? [c1, c2] : [c2, c1];
  const candidates = ordered.filter((c): c is string => !!c && !!hexToRgb(c));
  // 3:1 is the WCAG bar for UI components and large text, which is exactly what the accent paints
  // (button fills, chip highlights, the bolt) — text ON the accent is always re-picked for contrast.
  const accent = candidates.find((c) => contrast(c, p.bg) >= 3) ?? null;
  const primary = c1 && hexToRgb(c1) ? c1 : null;
  const top = topBarFor(c1, c2, p, accent ?? p.fallbackAccent);
  return {
    look,
    palette: p,
    accent: accent ?? p.fallbackAccent,
    accentInk: inkOn(accent ?? p.fallbackAccent, p),
    primary,
    primaryInk: primary ? inkOn(primary, p) : p.text,
    schoolAccent: !!accent,
    light: relLuminance(p.bg) > 0.5,
    topBg: top.bg,
    topBorder: top.border,
    topRule: top.rule,
    topInk: top.ink,
    topMuted: top.muted,
  };
}

export function themeStyle(t: LearnTheme): CSSProperties {
  const p = t.palette;
  return {
    ["--lk-bg" as string]: p.bg,
    ["--lk-surface" as string]: p.surface,
    ["--lk-surface2" as string]: p.surface2,
    ["--lk-border" as string]: p.border,
    ["--lk-border2" as string]: p.border2,
    ["--lk-text" as string]: p.text,
    ["--lk-muted" as string]: p.muted,
    ["--lk-dim" as string]: p.dim,
    ["--lk-green" as string]: p.green,
    ["--lk-red" as string]: p.red,
    ["--lk-acc" as string]: t.accent,
    ["--lk-acc-ink" as string]: t.accentInk,
    ["--lk-primary" as string]: t.primary ?? p.surface,
    ["--lk-primary-ink" as string]: t.primaryInk,
    ["--lk-top-bg" as string]: t.topBg,
    ["--lk-top-border" as string]: t.topBorder,
    ["--lk-top-rule" as string]: t.topRule,
    ["--lk-top-ink" as string]: t.topInk,
    ["--lk-top-muted" as string]: t.topMuted,
    ["--lk-hero-bg" as string]: p.hero?.bg ?? p.bg,
    ["--lk-hero-text" as string]: p.hero?.text ?? p.text,
    ["--lk-hero-muted" as string]: p.hero?.muted ?? p.muted,
    ["--lk-shadow" as string]: p.shadow,
    ["--lk-scheme" as string]: t.light ? "light" : "dark",
    // THE BRIDGE (2026-09-10). Site components now hosted inside /learn — ExamReminder, the
    // school picker's chrome (PICKER_CSS), NotListedForm — read the marketing palette by name.
    // --bg-* live on :root, but --brand-cream / --text-muted / --accent are aliased only under
    // html.sa-navy, which the marketing pages add in an effect and /learn never does. Mapping
    // them here, on the room's root, paints those components in the room's own ink and accent
    // without touching them.
    ["--bg-overlay" as string]: p.surface,
    ["--bg-surface" as string]: p.surface,
    ["--bg-input" as string]: p.surface2,
    ["--border-default" as string]: p.border,
    ["--brand-cream" as string]: p.text,
    ["--text-muted" as string]: p.muted,
    ["--text-secondary" as string]: p.muted,
    ["--accent" as string]: t.accent,
  } as CSSProperties;
}

/** Shared type ramp — THE HOME PAGE'S TOKENS (redesign, 2026-09-11: "fonts and buttons come from
 *  the home page's tokens, not /learn's own"). Rubik 900 for display, Inter for everything else,
 *  read from canvas/brand rather than re-typed here, so the two surfaces cannot drift. */
export const DISPLAY = BRAND_DISPLAY;
export const SANS = BRAND_SANS;

/** THE CARD'S DIMENSION (redesign, 2026-09-11): a real drop shadow and a one-pixel top highlight so
 *  every card on the page sits in front of the room instead of being drawn on it. This is the dark
 *  room's value; a light look carries its own in `palette.shadow`, and the CSS reads --lk-shadow. */
export const CARD_SHADOW = DARK_SHADOW;

/** THE CONTENT COLUMN (desktop pass, 2026-09-10): centred, capped at 1280, side padding per tier.
 *  One number every row, the entrance and the footer share, so nothing on the page can drift. */
export const CONTENT_MAX = 1280;
export const SIDE_PAD = { narrow: 16, mid: 24, wide: 32 } as const;

export const LEARN_CSS = `
.lk-root { background: var(--lk-bg); color: var(--lk-text); font-family: ${SANS}; color-scheme: var(--lk-scheme); }
.lk-disp { font-family: ${DISPLAY}; font-weight: 900; }
.lk-scroll-x { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.lk-scroll-x::-webkit-scrollbar { display: none; }
.lk-scroll-x > * { scroll-snap-align: start; }
.lk-chip { border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; background: var(--lk-surface); color: var(--lk-text); white-space: nowrap; border: 0; cursor: pointer; }
.lk-chip[data-on="true"] { background: var(--lk-text); color: var(--lk-bg); }
.lk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border: 0; cursor: pointer; white-space: nowrap; font-family: ${SANS}; }
.lk-btn-acc { background: var(--lk-acc); color: var(--lk-acc-ink); }
.lk-btn-ghost { background: var(--lk-border); color: var(--lk-text); }
/* THE HOME PAGE'S CTA (redesign, 2026-09-11): the door button's geometry — 54px, radius 12, 15.5px
   at weight 900, no uppercase — filled with the room's accent (the school's colour, or the
   fallback). The same object as home-two-door/DoorCard's DOOR_BTN, one fill. */
.lk-btn-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 54px; padding: 0 28px; border-radius: 12px; font-size: 15.5px; font-weight: 900; font-family: ${SANS}; letter-spacing: 0; text-transform: none; border: 0; cursor: pointer; white-space: nowrap; background: var(--lk-acc); color: var(--lk-acc-ink); transition: transform 120ms ease; }
@media (hover: hover) { .lk-btn-cta:hover { transform: scale(1.02); } }
.lk-btn-cta:focus-visible { outline: 2px solid var(--lk-text); outline-offset: 2px; }
.lk-card { border-radius: 12px; background: var(--lk-surface); border: 1px solid var(--lk-border); box-shadow: var(--lk-shadow); }
/* TOPICS AS BLOCKS ON A PHONE (redesign, 2026-09-11): 28px of air and a hairline over each topic. */
.lk-topic-sec[data-tier="narrow"] { padding: 28px 0; border-top: 1px solid var(--lk-border); }
/* THE EXAM PILLS under the bolt: Exam 1 live, the rest locked (a drawn lock, never an emoji). */
.lk-pill { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 11px; border-radius: 999px; font-size: 12px; font-weight: 800; font-family: ${SANS}; border: 1px solid var(--lk-top-rule); background: transparent; color: var(--lk-top-ink); cursor: pointer; white-space: nowrap; }
.lk-pill[data-on="true"] { background: var(--lk-top-ink); color: var(--lk-top-bg); border-color: var(--lk-top-ink); }
.lk-pill[data-locked="true"] { opacity: 0.72; }
/* THE SHEETS (hamburger, exam waitlist, Text Lee): one surface, bottom on a phone, centred elsewhere. */
.lk-sheet { width: 100%; background: var(--lk-surface); border: 1px solid var(--lk-border); color: var(--lk-text); box-shadow: var(--lk-shadow); font-family: ${SANS}; }
.lk-menu-item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 16px; border: 0; background: transparent; color: var(--lk-text); font-family: ${SANS}; font-size: 14.5px; font-weight: 600; text-align: left; text-decoration: none; cursor: pointer; border-radius: 10px; }
@media (hover: hover) { .lk-menu-item:hover { background: var(--lk-border); } }
.lk-rail-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; padding: 10px 0; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--lk-muted); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-rail-item[data-on="true"] { background: var(--lk-surface); color: var(--lk-text); }
.lk-rail-item:hover { color: var(--lk-text); }
@keyframes lk-swipe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.lk-swipe .lk-swipe-arrow { animation: lk-swipe 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .lk-swipe .lk-swipe-arrow { animation: none; } }
.lk-act { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--lk-text); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-act .lk-act-b { width: 48px; height: 48px; border-radius: 999px; background: var(--lk-surface); border: 1px solid var(--lk-border); display: grid; place-items: center; font-size: 11px; font-weight: 800; transition: background 120ms, transform 120ms; }
.lk-act:hover .lk-act-b { background: var(--lk-border); transform: scale(1.04); }
.lk-act[data-on="true"] .lk-act-b { background: var(--lk-acc); color: var(--lk-acc-ink); border-color: var(--lk-acc); }
.lk-short { width: 152px; height: 270px; border-radius: 12px; background: #000; position: relative; overflow: hidden; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: left; border: 0; cursor: pointer; color: #F2EFE6; font-family: ${SANS}; transition: transform 160ms ease, box-shadow 160ms ease; }
.lk-short img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lk-short .lk-short-t { position: relative; font-size: 13px; font-weight: 700; line-height: 1.2; text-shadow: 0 1px 6px rgba(0,0,0,0.9); }
.lk-short .lk-short-d { position: absolute; top: 8px; right: 8px; font-size: 10.5px; font-weight: 600; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; }
.lk-short[data-on="true"] { box-shadow: 0 0 0 2px var(--lk-acc); }
.lk-short::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0)); }
/* FLUID FRAMES (desktop pass): in a grid the card fills its track and keeps the 9:16 of the video. */
.lk-short[data-fluid="true"] { width: 100%; height: auto; aspect-ratio: 9 / 16; padding: 12px; }
.lk-short[data-fluid="true"] .lk-short-t { font-size: 14px; }
@media (hover: hover) { .lk-short:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -12px rgba(0,0,0,0.8); } }
.lk-field { width: 100%; border-radius: 10px; background: var(--lk-surface2); border: 1px solid var(--lk-border); padding: 12px 14px; font-size: 16px; color: var(--lk-text); outline: none; font-family: ${SANS}; min-height: 46px; }
.lk-field::placeholder { color: var(--lk-dim); }
.lk-field:focus { border-color: var(--lk-acc); }
/* THE TOPIC GRID: four frames + Practice on wide, three + Practice on mid. Never a horizontal page scroll. */
.lk-grid { display: grid; gap: 14px; min-width: 0; }
.lk-grid[data-tier="wide"] { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
.lk-grid[data-tier="mid"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
/* A COLLAPSED TOPIC is a target, not a text line: full width, lifts on hover. */
.lk-topic-row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 64px; padding: 14px 18px; border-radius: 14px; background: var(--lk-surface); border: 1px solid var(--lk-border); color: var(--lk-text); text-align: left; cursor: pointer; font-family: inherit; transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
@media (hover: hover) { .lk-topic-row:hover { transform: translateY(-2px); border-color: var(--lk-border2); box-shadow: 0 12px 28px -14px rgba(0,0,0,0.7); } }
.lk-topic-row[aria-expanded="true"] { border-color: var(--lk-acc); }
/* "Get started" with nothing playable yet lands here: the first row outlines for a second. */
@keyframes lk-outline { 0% { box-shadow: 0 0 0 0 var(--lk-acc); } 30% { box-shadow: 0 0 0 3px var(--lk-acc); } 100% { box-shadow: 0 0 0 0 transparent; } }
.lk-outlined { animation: lk-outline 1000ms ease-out; border-radius: 16px; }
/* THE START CUE (Lee, 2026-09-10: "make it unmistakable where to start"): the first row's frame
   pulses a soft accent outline twice, ~2 s, on first paint — once per session. Mid / wide only;
   narrow gets the "start here" label instead (one cue per tier). */
@keyframes lk-start-pulse { 0%, 100% { box-shadow: 0 0 0 0 transparent; } 25%, 75% { box-shadow: 0 0 0 3px var(--lk-acc), 0 0 22px 2px var(--lk-acc); } 50% { box-shadow: 0 0 0 1px var(--lk-acc); } }
.lk-start-pulse { animation: lk-start-pulse 2000ms ease-in-out; border-radius: 16px; }
/* THE TOPIC HEADING (Lee, 2026-09-10): the real bolt beside the name, no eyebrow. The boil is
   PAUSED on its first frame until the heading row is hovered; then bolt and name light together —
   the boil runs and a blue glow breathes on both. --lk-glow is the school's c2 (or #3B82F6), set
   inline per heading. A topic with nothing posted is black-and-white: grey bolt, muted name, no
   glow. Hover only where hover exists; reduced motion gets the glow without the boil or breath. */
.lk-topic-hd { --lk-glow: #3B82F6; }
.lk-topic-bolt { display: inline-block; line-height: 0; flex-shrink: 0; transition: filter 220ms ease, opacity 220ms ease; }
.lk-topic-bolt .sa-boil-f { animation-play-state: paused; }
.lk-topic-name { transition: text-shadow 220ms ease, color 220ms ease; }
.lk-topic-hd[data-posted="false"] .lk-topic-bolt { filter: grayscale(1); opacity: 0.55; }
.lk-topic-hd[data-posted="false"] .lk-topic-name { color: var(--lk-muted); }
@keyframes lk-glow-bolt { 0%, 100% { filter: drop-shadow(0 0 10px var(--lk-glow)); } 50% { filter: drop-shadow(0 0 16px var(--lk-glow)); } }
@keyframes lk-glow-name { 0%, 100% { text-shadow: 0 0 10px var(--lk-glow); } 50% { text-shadow: 0 0 16px var(--lk-glow); } }
@media (hover: hover) {
  .lk-topic-hd[data-posted="true"]:hover .lk-topic-bolt .sa-boil-f { animation-play-state: running; }
  .lk-topic-hd[data-posted="true"]:hover .lk-topic-bolt { animation: lk-glow-bolt 1200ms ease-in-out infinite; filter: drop-shadow(0 0 10px var(--lk-glow)); }
  .lk-topic-hd[data-posted="true"]:hover .lk-topic-name { animation: lk-glow-name 1200ms ease-in-out infinite; text-shadow: 0 0 10px var(--lk-glow); }
}
/* A CARD WITHOUT A POSTED VIDEO stays in the row, black-and-white and dimmed — the library is seen
   growing, not padded. */
.lk-short[data-posted="false"] { filter: grayscale(1); opacity: 0.45; }
@keyframes lk-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.lk-in { animation: lk-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { .lk-in { animation: none; } .lk-act .lk-act-b { transition: none; } .lk-short, .lk-topic-row { transition: none; } .lk-outlined { animation: none; } .lk-start-pulse { animation: none; box-shadow: 0 0 0 3px var(--lk-acc); } .lk-topic-bolt .sa-boil-f, .lk-topic-hd:hover .lk-topic-bolt, .lk-topic-hd:hover .lk-topic-name { animation: none !important; } }
`;
