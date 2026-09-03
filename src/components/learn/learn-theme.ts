// /learn THEME (09-03) — the HOMEPAGE's palette and type, nothing of its own.
//
// Lee: /learn must match the homepage's colours and fonts — "no separate /learn brand colors".
// So every token here is the site's semantic token from styles.css (:root, overridden on
// html.sa-navy), with the :root literal as the fallback, exactly the way TwoDoorHome paints
// itself (var(--bg-page) / var(--brand-cream) / var(--text-muted) / var(--accent)). Type is the
// brand pair the homepage uses: Rubik for display, Inter for body copy.
//
// The SCHOOL still colours the bolt (the homepage does that too, via frameThemeVars) and the asks
// bar's background; the accent is always the site gold.
import type { CSSProperties } from "react";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import type { School } from "@/lib/schools";

export const INK = {
  bg: "var(--bg-page, #0D1730)",
  surface: "var(--bg-surface, #162443)",
  surface2: "rgba(0,0,0,0.28)",
  border: "var(--border-default, #34486D)",
  border2: "var(--border-default, #34486D)",
  text: "var(--text-primary, #F7F0E6)",
  muted: "var(--text-secondary, #AAB4C8)",
  dim: "rgba(170,180,200,0.55)",
  accent: "var(--accent-primary, #FFA611)",
  /** Readable text ON the accent — the homepage's own choice for its gold buttons. */
  accentInk: "#0B1220",
  green: "#3BF5A0",
  red: "#F3C6CC",
} as const;

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function relLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
export function contrast(a: string, b: string): number {
  const la = relLuminance(a), lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type LearnTheme = {
  accent: string;
  accentInk: string;
  /** The school's dark colour, for the asks bar — null when no school. */
  primary: string | null;
  primaryInk: string;
};

const inkOn = (bg: string) => (contrast(bg, "#0B1220") >= contrast(bg, "#F7F0E6") ? "#0B1220" : "#F7F0E6");

export function themeFor(school: Pick<School, "c1" | "c2"> | null | undefined): LearnTheme {
  const primary = school?.c1 && hexToRgb(school.c1) ? school.c1 : null;
  return { accent: INK.accent, accentInk: INK.accentInk, primary, primaryInk: primary ? inkOn(primary) : INK.text };
}

export function themeStyle(t: LearnTheme): CSSProperties {
  return {
    ["--lk-bg" as string]: INK.bg,
    ["--lk-surface" as string]: INK.surface,
    ["--lk-surface2" as string]: INK.surface2,
    ["--lk-border" as string]: INK.border,
    ["--lk-text" as string]: INK.text,
    ["--lk-muted" as string]: INK.muted,
    ["--lk-dim" as string]: INK.dim,
    ["--lk-acc" as string]: t.accent,
    ["--lk-acc-ink" as string]: t.accentInk,
    ["--lk-primary" as string]: t.primary ?? INK.surface,
    ["--lk-primary-ink" as string]: t.primaryInk,
  } as CSSProperties;
}

export const DISPLAY = BRAND_DISPLAY;
export const SANS = BRAND_SANS;

export const LEARN_CSS = `
.lk-root { background: var(--lk-bg); color: var(--lk-text); font-family: ${DISPLAY}; }
.lk-disp { font-family: ${DISPLAY}; font-weight: 900; }
.lk-body { font-family: ${SANS}; }
.lk-scroll-x { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.lk-scroll-x::-webkit-scrollbar { display: none; }
.lk-scroll-x > * { scroll-snap-align: start; }
.lk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border: 0; cursor: pointer; white-space: nowrap; font-family: ${SANS}; }
.lk-btn-acc { background: var(--lk-acc); color: var(--lk-acc-ink); }
.lk-btn-ghost { background: rgba(255,255,255,0.08); color: var(--lk-text); border: 1px solid var(--lk-border); }
.lk-card { border-radius: 12px; background: var(--lk-surface); border: 1px solid var(--lk-border); }
.lk-rail-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; padding: 10px 0; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--lk-muted); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-rail-item[data-on="true"] { background: var(--lk-surface); color: var(--lk-text); }
.lk-rail-item:hover { color: var(--lk-text); }
.lk-act { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--lk-text); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-act .lk-act-b { width: 48px; height: 48px; border-radius: 999px; background: var(--lk-surface); border: 1px solid var(--lk-border); display: grid; place-items: center; font-size: 11px; font-weight: 800; transition: background 120ms, transform 120ms; }
.lk-act:hover .lk-act-b { background: rgba(255,255,255,0.08); transform: scale(1.04); }
.lk-act[data-on="true"] .lk-act-b { background: var(--lk-acc); color: var(--lk-acc-ink); border-color: var(--lk-acc); }
.lk-short { width: 152px; height: 270px; border-radius: 12px; background: #000; position: relative; overflow: hidden; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: left; border: 0; cursor: pointer; color: var(--lk-text); font-family: ${SANS}; }
.lk-short img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lk-short .lk-short-t { position: relative; font-size: 13px; font-weight: 700; line-height: 1.2; text-shadow: 0 1px 6px rgba(0,0,0,0.9); }
.lk-short .lk-short-d { position: absolute; top: 8px; right: 8px; font-size: 10.5px; font-weight: 600; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; }
.lk-short[data-on="true"] { box-shadow: 0 0 0 2px var(--lk-acc); }
.lk-short::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0)); }
.lk-field { width: 100%; border-radius: 10px; background: rgba(0,0,0,0.35); border: 1px solid var(--lk-border); padding: 12px 14px; font-size: 16px; color: var(--lk-text); outline: none; font-family: ${SANS}; min-height: 46px; }
.lk-field::placeholder { color: var(--lk-dim); }
.lk-field:focus { border-color: var(--lk-acc); }
@keyframes lk-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.lk-in { animation: lk-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { .lk-in { animation: none; } .lk-act .lk-act-b { transition: none; } }
`;
