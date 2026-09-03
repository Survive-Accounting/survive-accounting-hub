// BLACKBOARD (learn v3, 09-03) — the /learn room. Near-black, chalk text, ONE accent.
//
// The accent is the SCHOOL's colour when a school is known (Lee: "try the school accent color on
// the black, keep things readable"), and lime when it isn't. Readability is enforced, not hoped
// for: a school colour that can't clear 3:1 against the black is skipped for the school's other
// colour, and if neither clears, the accent falls back to lime. Text ON the accent picks whichever
// of black / chalk reads better. Everything downstream reads var(--lk-*).
import type { CSSProperties } from "react";
import type { School } from "@/lib/schools";

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
  green: "#4EE8B4",
  red: "#FF5C6C",
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
/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const la = relLuminance(a), lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type LearnTheme = {
  accent: string;
  /** Text colour ON the accent. */
  accentInk: string;
  /** The school's dark colour, for the asks bar — null when no school. */
  primary: string | null;
  primaryInk: string;
  /** True when the accent is the school's, not the lime fallback. */
  schoolAccent: boolean;
};

const inkOn = (bg: string) => (contrast(bg, "#111111") >= contrast(bg, INK.text) ? "#111111" : INK.text);

/** The theme for a school (or none). Candidates are the school's bright colour first, then its
 *  dark one; the first that clears 4.5:1 on the black wins. */
export function themeFor(school: Pick<School, "c1" | "c2"> | null | undefined): LearnTheme {
  const c1 = school?.c1 ?? null, c2 = school?.c2 ?? null;
  const candidates = [c2, c1].filter((c): c is string => !!c && !!hexToRgb(c));
  // 3:1 is the WCAG bar for UI components and large text, which is exactly what the accent paints
  // (button fills, chip highlights, the bolt) — text ON the accent is always re-picked for contrast.
  const accent = candidates.find((c) => contrast(c, INK.bg) >= 3) ?? null;
  const primary = c1 && hexToRgb(c1) ? c1 : null;
  return {
    accent: accent ?? INK.lime,
    accentInk: inkOn(accent ?? INK.lime),
    primary,
    primaryInk: primary ? inkOn(primary) : INK.text,
    schoolAccent: !!accent,
  };
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

/** Shared type ramp. Rubik 900 for display, Inter for everything else (the brand pair). */
export const DISPLAY = "'Rubik', system-ui, -apple-system, sans-serif";
export const SANS = "'Inter', system-ui, -apple-system, sans-serif";

export const LEARN_CSS = `
.lk-root { background: var(--lk-bg); color: var(--lk-text); font-family: ${SANS}; }
.lk-disp { font-family: ${DISPLAY}; font-weight: 900; }
.lk-scroll-x { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.lk-scroll-x::-webkit-scrollbar { display: none; }
.lk-scroll-x > * { scroll-snap-align: start; }
.lk-chip { border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; background: #1F1F1F; color: var(--lk-text); white-space: nowrap; border: 0; cursor: pointer; }
.lk-chip[data-on="true"] { background: var(--lk-text); color: #111; }
.lk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border: 0; cursor: pointer; white-space: nowrap; font-family: ${SANS}; }
.lk-btn-acc { background: var(--lk-acc); color: var(--lk-acc-ink); }
.lk-btn-ghost { background: #2A2A2A; color: var(--lk-text); }
.lk-card { border-radius: 12px; background: var(--lk-surface); border: 1px solid var(--lk-border); }
.lk-rail-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; padding: 10px 0; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--lk-muted); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-rail-item[data-on="true"] { background: var(--lk-surface); color: var(--lk-text); }
.lk-rail-item:hover { color: var(--lk-text); }
.lk-act { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--lk-text); background: transparent; border: 0; cursor: pointer; font-family: ${SANS}; }
.lk-act .lk-act-b { width: 48px; height: 48px; border-radius: 999px; background: var(--lk-surface); border: 1px solid var(--lk-border); display: grid; place-items: center; font-size: 11px; font-weight: 800; transition: background 120ms, transform 120ms; }
.lk-act:hover .lk-act-b { background: #262626; transform: scale(1.04); }
.lk-act[data-on="true"] .lk-act-b { background: var(--lk-acc); color: var(--lk-acc-ink); border-color: var(--lk-acc); }
.lk-short { width: 152px; height: 270px; border-radius: 12px; background: #000; position: relative; overflow: hidden; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: left; border: 0; cursor: pointer; color: var(--lk-text); font-family: ${SANS}; }
.lk-short img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lk-short .lk-short-t { position: relative; font-size: 13px; font-weight: 700; line-height: 1.2; text-shadow: 0 1px 6px rgba(0,0,0,0.9); }
.lk-short .lk-short-d { position: absolute; top: 8px; right: 8px; font-size: 10.5px; font-weight: 600; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; }
.lk-short[data-on="true"] { box-shadow: 0 0 0 2px var(--lk-acc); }
.lk-short::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0)); }
.lk-field { width: 100%; border-radius: 10px; background: var(--lk-surface2); border: 1px solid var(--lk-border); padding: 12px 14px; font-size: 16px; color: var(--lk-text); outline: none; font-family: ${SANS}; min-height: 46px; }
.lk-field::placeholder { color: var(--lk-dim); }
.lk-field:focus { border-color: var(--lk-acc); }
@keyframes lk-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.lk-in { animation: lk-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { .lk-in { animation: none; } .lk-act .lk-act-b { transition: none; } }
`;
