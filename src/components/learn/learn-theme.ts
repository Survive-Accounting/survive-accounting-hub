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
import type { CSSProperties } from "react";
import type { School } from "@/lib/schools";

export type Palette = {
  bg: string; surface: string; surface2: string; border: string; border2: string;
  text: string; muted: string; dim: string;
  /** The accent when no school colour reads on `bg`. */
  fallbackAccent: string;
  green: string; red: string;
};

/** The Blackboard. `lime` stays as the old name of the fallback accent — v3.learn reads it. */
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
} as const satisfies Palette & { lime: string };

/** The home page's palette, by the same names. Values are styles.css :root — read, not invented:
 *  --bg-page, --bg-surface, --bg-input, --border-default, --text-primary, --text-secondary,
 *  --text-tertiary, --accent-primary. */
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
} as const satisfies Palette;

export type Look = "black" | "navy";
export const LOOKS: Record<Look, Palette> = { black: INK, navy: NAVY };
export function isLook(v: unknown): v is Look { return v === "black" || v === "navy"; }

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
  /** THE TOP BAR WEARS THE SCHOOL (Lee, 2026-09-10): c1 is the ground, c2 the rule beneath it, so
   *  picking a school visibly changes the page — not just the accent. Ink is re-picked for
   *  contrast; a c1 neither chalk nor black can read on keeps the Blackboard's black and wears the
   *  school only as the rule. No school → black / border / chalk, exactly as before. */
  topBg: string;
  topBorder: string;
  topInk: string;
  topMuted: string;
};

function inkOn(bg: string, chalk: string = INK.text): string {
  return contrast(bg, "#111111") >= contrast(bg, chalk) ? "#111111" : chalk;
}

/** `#RRGGBB` at an alpha — for muted text on a school-coloured ground, where INK.muted (tuned for
 *  black) may not read. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex;
}

export type TopBar = { bg: string; border: string; ink: string; muted: string };

/** The top bar's colours for a school's (c1, c2). 3:1 is the bar text has to clear on its ground
 *  (the same WCAG line themeFor holds the accent to); below it the ground stays the room's. */
export function topBarFor(c1: string | null | undefined, c2: string | null | undefined, p: Palette = INK): TopBar {
  const ground = c1 && hexToRgb(c1) ? c1 : null;
  const rule = c2 && hexToRgb(c2) ? c2 : ground;
  if (!ground) return { bg: p.bg, border: p.border, ink: p.text, muted: p.muted };
  const ink = inkOn(ground, p.text);
  if (contrast(ground, ink) < 3) return { bg: p.bg, border: rule ?? p.border, ink: p.text, muted: p.muted };
  return { bg: ground, border: rule ?? ground, ink, muted: withAlpha(ink, 0.72) };
}

/** The theme for a school (or none) in a look (default: the Blackboard). Candidates are the
 *  school's bright colour first, then its dark one; the first that clears 3:1 on the ground wins. */
export function themeFor(school: Pick<School, "c1" | "c2"> | null | undefined, look: Look = "black"): LearnTheme {
  const p = LOOKS[look];
  const c1 = school?.c1 ?? null, c2 = school?.c2 ?? null;
  const candidates = [c2, c1].filter((c): c is string => !!c && !!hexToRgb(c));
  // 3:1 is the WCAG bar for UI components and large text, which is exactly what the accent paints
  // (button fills, chip highlights, the bolt) — text ON the accent is always re-picked for contrast.
  const accent = candidates.find((c) => contrast(c, p.bg) >= 3) ?? null;
  const primary = c1 && hexToRgb(c1) ? c1 : null;
  const top = topBarFor(c1, c2, p);
  return {
    look,
    palette: p,
    accent: accent ?? p.fallbackAccent,
    accentInk: inkOn(accent ?? p.fallbackAccent, p.text),
    primary,
    primaryInk: primary ? inkOn(primary, p.text) : p.text,
    schoolAccent: !!accent,
    topBg: top.bg,
    topBorder: top.border,
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
    ["--lk-top-ink" as string]: t.topInk,
    ["--lk-top-muted" as string]: t.topMuted,
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

/** Shared type ramp. Rubik 900 for display, Inter for everything else (the brand pair). */
export const DISPLAY = "'Rubik', system-ui, -apple-system, sans-serif";
export const SANS = "'Inter', system-ui, -apple-system, sans-serif";

/** THE CONTENT COLUMN (desktop pass, 2026-09-10): centred, capped at 1280, side padding per tier.
 *  One number every row, the entrance and the footer share, so nothing on the page can drift. */
export const CONTENT_MAX = 1280;
export const SIDE_PAD = { narrow: 16, mid: 24, wide: 32 } as const;

export const LEARN_CSS = `
.lk-root { background: var(--lk-bg); color: var(--lk-text); font-family: ${SANS}; }
.lk-disp { font-family: ${DISPLAY}; font-weight: 900; }
.lk-scroll-x { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.lk-scroll-x::-webkit-scrollbar { display: none; }
.lk-scroll-x > * { scroll-snap-align: start; }
.lk-chip { border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; background: var(--lk-surface); color: var(--lk-text); white-space: nowrap; border: 0; cursor: pointer; }
.lk-chip[data-on="true"] { background: var(--lk-text); color: var(--lk-bg); }
.lk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border: 0; cursor: pointer; white-space: nowrap; font-family: ${SANS}; }
.lk-btn-acc { background: var(--lk-acc); color: var(--lk-acc-ink); }
.lk-btn-ghost { background: var(--lk-border); color: var(--lk-text); }
.lk-card { border-radius: 12px; background: var(--lk-surface); border: 1px solid var(--lk-border); }
.lk-rail-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; padding: 10px 0; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--lk-muted); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-rail-item[data-on="true"] { background: var(--lk-surface); color: var(--lk-text); }
.lk-rail-item:hover { color: var(--lk-text); }
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
/* "See what's on the exam" lands here: the first row outlines for a second. */
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
