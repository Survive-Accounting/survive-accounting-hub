// THE PRACTICE CARD'S ARTWORK (redesign, 2026-09-11) — a small mechanical "motor", floating.
//
// ONE illustration for every campus, RE-TINTED per school so no two campuses' cards match: a gear,
// two hex nuts and a bolt — the bolt a chill, hand-drawn one (a thin stroked outline, its corners
// nudged a little off true, deliberately NOT the brand's boil bolt), all drawn with simple paths
// over a faint floor shadow.
//
// IT IDLES AND IT PUMPS. At rest the motor floats — translateY ±4px, 4 s ease-in-out, forever —
// and the shadow breathes with it. With the pointer on it the gear spins and the float runs at
// double speed, for as long as the pointer stays. prefers-reduced-motion: no float, no spin.
//
// THE TINT is the school's, through two CSS variables set inline: --lk-art-stroke is c2 (the colour
// the page already uses for the topic glow) or, when a school has no c2, c1 turned 40° round the
// hue wheel so the art still differs from the bar it sits under; --lk-art-fill is c1. No school:
// the room's own text colour (var(--lk-text) — the brand cream on the Blackboard, navy on a cream
// look; 2026-09-11, the ?look= candidates: the cream tint vanished on a white card). practiceTint /
// practiceFill still answer the brand cream for no school, for the callers that need a hex. Fill,
// stroke and filter TRANSITION over .6 s, so clicking through schools in the picker animates the
// art instead of snapping it.
//
// Placeholder until the Recraft illustration exists — subject `practice-card` in
// /admin/illustrations; swap the SVG for the asset URL here. (Nothing in this file calls Recraft.)
//
// Copy rule (learn.tsx header): nothing a student reads lives here — the art is aria-hidden.
import type { CSSProperties } from "react";

import type { School } from "@/lib/schools";

/** The brand cream — the tint when no school is known. */
const NO_SCHOOL_TINT = "#F5EFE6";
/** How far c1 is turned when a school has no c2. */
const HUE_SHIFT_DEG = 40;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#RRGGBB` with its hue turned by `deg`, saturation and lightness untouched. */
export function hueShift(hex: string, deg: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) { rr = c; gg = x; } else if (h < 120) { rr = x; gg = c; } else if (h < 180) { gg = c; bb = x; }
  else if (h < 240) { gg = x; bb = c; } else if (h < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`.toUpperCase();
}

/** The stroke tint for a school's practice art: c2, else c1 turned 40°, else the brand cream. */
export function practiceTint(school: Pick<School, "c1" | "c2"> | null | undefined): string {
  if (school?.c2 && hexToRgb(school.c2)) return school.c2;
  if (school?.c1 && hexToRgb(school.c1)) return hueShift(school.c1, HUE_SHIFT_DEG);
  return NO_SCHOOL_TINT;
}

/** The fill tint: c1 when the school has one, else the stroke tint. */
export function practiceFill(school: Pick<School, "c1" | "c2"> | null | undefined): string {
  if (school?.c1 && hexToRgb(school.c1)) return school.c1;
  return practiceTint(school);
}

/** A regular hexagon's path, centred on (cx, cy). */
function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** A gear outline: `teeth` teeth between radius `r1` and `r2`, centred on (cx, cy). */
function gearPath(cx: number, cy: number, r1: number, r2: number, teeth: number): string {
  const steps = teeth * 4;
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    // Two points out, two points in, per tooth — a flat-topped tooth, not a spike.
    const r = i % 4 < 2 ? r2 : r1;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** THE HAND-DRAWN BOLT: a lightning bolt whose seven corners are each nudged up to 1.1 units off
 *  true on a fixed field — the same wobble every render (capture-safe), never the brand's boil. */
function chillBoltPath(cx: number, cy: number, h: number): string {
  const w = h * 0.55;
  // The classic seven-corner bolt, in a unit box (x 0..1, y 0..1), then scaled and jittered.
  const unit: [number, number][] = [[0.62, 0], [0.12, 0.56], [0.44, 0.56], [0.3, 1], [0.88, 0.4], [0.54, 0.4], [0.72, 0]];
  const jit = (i: number, k: number) => 1.1 * Math.sin(i * 2.3 + k * 1.7);
  return unit.map(([ux, uy], i) => `${i ? "L" : "M"}${(cx - w / 2 + ux * w + jit(i, 1)).toFixed(2)} ${(cy - h / 2 + uy * h + jit(i, 2)).toFixed(2)}`).join(" ") + " Z";
}

const GEAR_CX = 46, GEAR_CY = 56;

const ART_CSS = `
@keyframes lk-art-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes lk-art-shadow { 0%, 100% { transform: scaleX(1); opacity: 0.5; } 50% { transform: scaleX(0.84); opacity: 0.32; } }
@keyframes lk-art-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.lk-art { display: inline-block; line-height: 0; }
.lk-art-float { animation: lk-art-float 4s ease-in-out infinite; }
.lk-art-shadow { animation: lk-art-shadow 4s ease-in-out infinite; transform-origin: 60px 106px; transform-box: view-box; }
.lk-art-gear { transform-origin: ${GEAR_CX}px ${GEAR_CY}px; transform-box: view-box; }
.lk-art path, .lk-art circle, .lk-art rect { transition: fill .6s ease, stroke .6s ease, filter .6s ease; }
@media (hover: hover) {
  .lk-art:hover .lk-art-float, .lk-art:hover .lk-art-shadow { animation-duration: 2s; }
  .lk-art:hover .lk-art-gear { animation: lk-art-spin 1.6s linear infinite; }
}
@media (prefers-reduced-motion: reduce) { .lk-art-float, .lk-art-shadow, .lk-art:hover .lk-art-gear { animation: none !important; } }
`;

/** The art, `size` px square, tinted for `school`. Decorative — hidden from assistive tech. */
export function PracticeArt({ school, size = 120 }: { school: School | null; size?: number }) {
  const known = !!(school?.c1 || school?.c2);
  const vars = { ["--lk-art-stroke" as string]: known ? practiceTint(school) : "var(--lk-text)", ["--lk-art-fill" as string]: known ? practiceFill(school) : "var(--lk-text)", width: size, height: size } as CSSProperties;
  return (
    <span aria-hidden className="lk-art" style={vars}>
      <style>{ART_CSS}</style>
      <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        {/* The floor shadow the motor hovers over. */}
        <ellipse className="lk-art-shadow" cx="60" cy="106" rx="34" ry="5" fill="#000" opacity="0.5" />
        <g className="lk-art-float" fill="none" stroke="var(--lk-art-stroke)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
          {/* THE GEAR — the big part, off-centre left; it spins on hover. */}
          <g className="lk-art-gear">
            <path d={gearPath(GEAR_CX, GEAR_CY, 21, 27, 10)} fill="var(--lk-art-fill)" fillOpacity="0.18" />
            <circle cx={GEAR_CX} cy={GEAR_CY} r="8" fill="var(--lk-surface)" />
            <path d={`M${GEAR_CX} ${GEAR_CY - 14}v5M${GEAR_CX} ${GEAR_CY + 9}v5M${GEAR_CX - 14} ${GEAR_CY}h5M${GEAR_CX + 9} ${GEAR_CY}h5`} strokeWidth="1.8" opacity="0.7" />
          </g>
          {/* THE CHILL BOLT — thin, a little wobbly, leaning across the gear. */}
          <path d={chillBoltPath(86, 62, 48)} fill="var(--lk-art-fill)" fillOpacity="0.14" strokeWidth="1.8" />
          {/* TWO HEX NUTS — one high, one low. */}
          <path d={hexPath(24, 22, 9)} fill="var(--lk-art-fill)" fillOpacity="0.28" />
          <circle cx="24" cy="22" r="3.5" />
          <path d={hexPath(104, 26, 7)} fill="var(--lk-art-fill)" fillOpacity="0.28" />
          <circle cx="104" cy="26" r="2.8" />
        </g>
      </svg>
    </span>
  );
}
