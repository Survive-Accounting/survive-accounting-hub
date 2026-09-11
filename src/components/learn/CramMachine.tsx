// THE CRAM MACHINE (Lee, 2026-09-11) — the three Recraft illustrations as live inline SVG, not
// <img>s: "convert them into clean inline React/SVG components so individual pieces can inherit
// campus accent colors, animate independently, receive our REAL Survive campus bolt SVG on the
// output paper, work responsively inside Practice cards. Do not materially redraw."
//
// WHAT EACH FILE BECAME (cram-machine-data.ts, generated, paths in source order, nothing redrawn):
//   open      "image (1).svg"      — the open-top abacus on the deck, one tall stamp post, peach
//   compact   "…of-a- (1).svg"     — the boxed machine, abacus in a window, twin posts on top, slate
//   conveyor  "…of-a-.svg"         — the rounded dark body, the longest belt, the winding line
//
// GROUPS. Recraft exported flat paths; SOURCE ORDER IS THE Z-ORDER and moving a path to a later
// <g> would paint it over things it used to sit under. So every path keeps its place and carries
// data-part="…" instead — the CSS animates by part (translate only, which needs no origin), and
// the ids the brief asked for (#stamp, #abacus-beads, #finished-paper …) are the data-part names.
// Membership is a per-machine index list (PARTS below); anything unlisted is machine-body.
//   stamp-head · stamp-base · abacus-frame · abacus-beads · power-line · power-node · input-tray ·
//   incoming-paper · output-tray · finished-paper · success-mark · placeholder (the orange
//   rectangle Recraft drew where the logo goes — NOT rendered; the real bolt takes its place)
//
// CAMPUS COLOUR. The machine stays neutral — cream, navy/charcoal, off-white, its own green. The
// illustration's orange (its power line and node) is painted --campus-primary; the Survive bolt
// on the finished paper wears --campus-primary AND --campus-secondary (Lee: "The Survive bolt will
// use BOTH"). The success check keeps the SVG's green. Large surfaces are never recoloured.
//
// THE BOLT. The real mark — canvas/brand's BOLT_OUTER / BOLT_RIGHT, the same paths BoltBoil and
// the wordmark draw — placed on the paper by an affine matrix per machine (BOLT_PLACEMENTS): the
// orange rectangle's three corners give the paper plane's two in-plane axes; the bolt is scaled
// to fit inside with a margin and mapped onto those axes, so it reads as printed on the angled
// sheet. A premium sticker, not chrome: white keyline, a soft offset shadow (a second path, no
// filter), and a one-shot diagonal gloss sweep clipped to the bolt (~320 ms) after it lands.
//
// MOTION (all CSS keyframes, no library — framer-motion exists but a timeline this small does not
// need it). Idle: nothing inside moves (the card floats the whole machine, PracticeCard.tsx).
// A RUN (hover / focus / first prominent view on touch) plays ONCE, ~1.8 s, keyed by `run` so a
// new run remounts the animated parts and restarts them:
//     0 ms  card lifts, machine scales 1.03 (PracticeCard)      100–250  power node lights
//   150–650  current sweeps along the power line (a gradient bar clipped to the line's paths)
//   450–850  abacus beads shift twice                            750–1100 finished paper nudges
//   950–1250 stamp head comes down and back                     1150     bolt appears + pops
//   1400–1720 gloss sweeps the bolt                              1800     resting, powered
// After a run the machine rests POWERED: the bolt stays on the paper. prefers-reduced-motion:
// no run at all; powered from the first paint, the final state drawn cleanly.
//
// PERF: one <svg> per card, ~90 paths; memoised on (variant, colours, run, powered); no filters
// (the shadow is geometry, the gloss is a clipped rect); only wrapper-level transforms animate.
import { memo, useId, type CSSProperties } from "react";

import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX } from "@/components/canvas/brand";
import { COMPACT_MACHINE, CONVEYOR_MACHINE, OPEN_MACHINE, type MachineData } from "@/components/learn/cram-machine-data";

export type MachineVariant = "open" | "compact" | "conveyor";
export const MACHINE_VARIANTS: readonly MachineVariant[] = ["open", "compact", "conveyor"];

/** Which machine a section shows: `sectionIndex % 3`, deterministic — never random per render
 *  (Lee: "This prevents the card art from changing when React rerenders"). */
export function machineForSection(sectionIndex: number): MachineVariant {
  return MACHINE_VARIANTS[((sectionIndex % 3) + 3) % 3];
}

export type MachinePart =
  | "stamp-head" | "stamp-base" | "abacus-frame" | "abacus-beads" | "power-line" | "power-node"
  | "input-tray" | "incoming-paper" | "output-tray" | "finished-paper" | "success-mark" | "placeholder";

type Pt = [number, number];
/** The orange rectangle's corners in the SVG's units: t = top, r = right, l = left. */
export type PaperCorners = { t: Pt; r: Pt; l: Pt };

export type MachineSpec = {
  data: MachineData;
  parts: Partial<Record<MachinePart, number[]>>;
  paper: PaperCorners;
  /** Where the node glow sits (SVG units). */
  node: { cx: number; cy: number; r: number };
  /** The power line's bounding box, for the current sweep, and which way the current runs. */
  power: { x: number; y: number; w: number; h: number; dir: "left" | "up" };
};

function range(a: number, b: number): number[] { const out: number[] = []; for (let i = a; i <= b; i++) out.push(i); return out; }

export const MACHINES: Record<MachineVariant, MachineSpec> = {
  open: {
    data: OPEN_MACHINE,
    parts: {
      "stamp-head": range(2, 11),
      "stamp-base": [12, 13, 14],
      "abacus-frame": [19, 20, 41, 83],
      "abacus-beads": range(21, 40),
      "power-line": [63],
      "input-tray": [53, 54, 55, 57, 58, 59, 60, 61, 62, 64, 66, 67, 68, 69, 70, 71, 75, 82],
      "incoming-paper": [52],
      "output-tray": [42, 43, 44, 45, 46, 65, 72, 73, 74, 76, 77, 78, 79, 80, 81, 84, 85, 86],
      "finished-paper": [47, 48, 50],
      "success-mark": [51],
      placeholder: [49],
    },
    paper: { t: [1614.2, 1230.85], r: [1813.27, 1348.68], l: [1446.72, 1329.51] },
    node: { cx: 960, cy: 1355, r: 42 },
    power: { x: 490, y: 1065, w: 515, h: 345, dir: "left" },
  },
  compact: {
    data: COMPACT_MACHINE,
    parts: {
      "stamp-head": [41, 42, 43, 47, 48, 49, 50, 53, 54],
      "stamp-base": [36, 37, 40],
      "abacus-frame": [5, 6, 7, 20],
      "abacus-beads": range(8, 19),
      "power-line": [3],
      "input-tray": [33, 34, 35, 38, 39, 51, 55, 59],
      "incoming-paper": [45, 46, 52, 56, 57, 58],
      "output-tray": [21, 22, 29, 30, 31, 32, 44],
      "finished-paper": [24],
      "success-mark": [25, 26, 27],
      placeholder: [23],
    },
    paper: { t: [1643.9, 1423.88], r: [1750.99, 1487.44], l: [1522.88, 1492.59] },
    node: { cx: 1064, cy: 1488, r: 38 },
    power: { x: 550, y: 635, w: 550, h: 900, dir: "left" },
  },
  conveyor: {
    data: CONVEYOR_MACHINE,
    parts: {
      "stamp-head": [72, 83, 85],
      "stamp-base": [78, 84],
      "abacus-frame": [18, 19, 20, 22],
      "abacus-beads": [21, ...range(23, 57)],
      "power-line": [8, 11, 17],
      "power-node": [14, 15, 16],
      "input-tray": range(66, 71).concat([73, 74, 75]),
      "incoming-paper": range(58, 65),
      "output-tray": [1, 76, 77, 79, 80, 81, 82],
      "finished-paper": [3, 7, 9, 10, 12],
      "success-mark": [4],
      placeholder: [2],
    },
    paper: { t: [1632.74, 1498.82], r: [1726.89, 1559.44], l: [1516.05, 1568.32] },
    node: { cx: 1000, cy: 1633, r: 44 },
    power: { x: 910, y: 600, w: 355, h: 1085, dir: "up" },
  },
};

/** Recraft's oranges — the power line and node, and the placeholder. Painted campus primary. */
const ORANGES = new Set(["#F17338", "#EB7437", "#E76F32"]);

/** index → part, built once per machine. */
const PART_OF: Record<MachineVariant, Map<number, MachinePart>> = { open: new Map(), compact: new Map(), conveyor: new Map() };
for (const v of MACHINE_VARIANTS) {
  const spec = MACHINES[v];
  for (const [part, idx] of Object.entries(spec.parts) as [MachinePart, number[]][]) {
    for (const i of idx) {
      if (i < 0 || i >= spec.data.paths.length) throw new Error(`CramMachine ${v}: ${part} index ${i} out of range`);
      if (PART_OF[v].has(i)) throw new Error(`CramMachine ${v}: path ${i} in two parts (${PART_OF[v].get(i)}, ${part})`);
      PART_OF[v].set(i, part);
    }
  }
}
export function partOf(variant: MachineVariant, index: number): MachinePart | "machine-body" { return PART_OF[variant].get(index) ?? "machine-body"; }

// ── THE BOLT'S PLACEMENT ──────────────────────────────────────────────────────────────────────
const VB = BOLT_VIEWBOX.split(" ").map(Number);
const BOLT_BOX = { x: VB[0], y: VB[1], w: VB[2], h: VB[3] };
/** How much of the rectangle the bolt leaves clear on each side. */
const BOLT_MARGIN = 0.14;

/** The affine matrix that lays the bolt's viewBox flat on the paper: bolt-x along top→right,
 *  bolt-y along top→left (the sheet's two in-plane axes), one uniform scale that fits inside the
 *  rectangle with BOLT_MARGIN, centred on it. matrix(a b c d e f) for <g transform>. */
export function boltMatrix(p: PaperCorners): [number, number, number, number, number, number] {
  const u: Pt = [p.r[0] - p.t[0], p.r[1] - p.t[1]];
  const v: Pt = [p.l[0] - p.t[0], p.l[1] - p.t[1]];
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
  const s = Math.min((lu * (1 - 2 * BOLT_MARGIN)) / BOLT_BOX.w, (lv * (1 - 2 * BOLT_MARGIN)) / BOLT_BOX.h);
  const a = (s * u[0]) / lu, b = (s * u[1]) / lu, c = (s * v[0]) / lv, d = (s * v[1]) / lv;
  const cx = p.t[0] + u[0] / 2 + v[0] / 2, cy = p.t[1] + u[1] / 2 + v[1] / 2;
  const bx = BOLT_BOX.x + BOLT_BOX.w / 2, by = BOLT_BOX.y + BOLT_BOX.h / 2;
  return [a, b, c, d, cx - a * bx - c * by, cy - b * bx - d * by];
}
export const BOLT_PLACEMENTS: Record<MachineVariant, string> = {
  open: `matrix(${boltMatrix(MACHINES.open.paper).map((n) => n.toFixed(4)).join(" ")})`,
  compact: `matrix(${boltMatrix(MACHINES.compact.paper).map((n) => n.toFixed(4)).join(" ")})`,
  conveyor: `matrix(${boltMatrix(MACHINES.conveyor.paper).map((n) => n.toFixed(4)).join(" ")})`,
};

// ── THE MOTION ────────────────────────────────────────────────────────────────────────────────
export const CRAM_MACHINE_CSS = `
.cm { display: block; width: 100%; height: 100%; overflow: visible; transition: transform 220ms cubic-bezier(.2,.7,.2,1); transform-origin: 50% 60%; }
.cm[data-lift="true"] { transform: scale(1.03); }
.cm [data-part="power-line"] { fill: var(--campus-primary); transition: opacity 200ms; }
.cm [data-part="power-node"] { fill: var(--campus-primary); }
.cm .cm-node { fill: var(--campus-primary); opacity: 0; transform-box: fill-box; transform-origin: center; }
.cm .cm-current { opacity: 0; transform-box: fill-box; }
.cm .cm-bolt { opacity: 0; transform-box: fill-box; transform-origin: center; }
.cm[data-powered="true"] .cm-bolt { opacity: 1; }
.cm .cm-gloss { opacity: 0; transform-box: fill-box; }
@keyframes cm-node { 0% { opacity: 0; transform: scale(.6); } 60% { opacity: .95; transform: scale(1.15); } 100% { opacity: .85; transform: scale(1); } }
@keyframes cm-current-left { 0% { opacity: 0; transform: translateX(60%); } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateX(-60%); } }
@keyframes cm-current-up { 0% { opacity: 0; transform: translateY(60%); } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-60%); } }
@keyframes cm-beads { 0%, 100% { transform: translate(0, 0); } 30% { transform: translate(14px, 8px); } 65% { transform: translate(-10px, -6px); } }
@keyframes cm-paper { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(16px, 9px); } }
@keyframes cm-stamp { 0%, 100% { transform: translate(0, 0); } 45% { transform: translate(0, 58px); } 60% { transform: translate(0, 58px); } }
@keyframes cm-bolt-in { 0% { opacity: 0; transform: scale(.9); } 55% { opacity: 1; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
@keyframes cm-gloss { 0% { opacity: 0; transform: translateX(-120%); } 20% { opacity: .9; } 80% { opacity: .9; } 100% { opacity: 0; transform: translateX(120%); } }
.cm[data-run] .cm-node { animation: cm-node 260ms cubic-bezier(.2,.7,.2,1) 100ms both; }
.cm[data-run] .cm-current[data-dir="left"] { animation: cm-current-left 500ms cubic-bezier(.4,0,.2,1) 150ms both; }
.cm[data-run] .cm-current[data-dir="up"] { animation: cm-current-up 500ms cubic-bezier(.4,0,.2,1) 150ms both; }
.cm[data-run] [data-part="abacus-beads"] { animation: cm-beads 400ms cubic-bezier(.4,0,.2,1) 450ms both; }
.cm[data-run] [data-part="finished-paper"], .cm[data-run] [data-part="success-mark"], .cm[data-run] .cm-bolt-wrap { animation: cm-paper 350ms cubic-bezier(.4,0,.2,1) 750ms both; }
.cm[data-run] [data-part="stamp-head"] { animation: cm-stamp 320ms cubic-bezier(.5,0,.3,1) 950ms both; }
.cm[data-run] .cm-bolt { animation: cm-bolt-in 320ms cubic-bezier(.2,.8,.2,1.2) 1150ms both; }
.cm[data-run] .cm-gloss { animation: cm-gloss 320ms ease-in-out 1400ms both; }
@media (prefers-reduced-motion: reduce) {
  .cm, .cm[data-run] * { animation: none !important; transition: none !important; }
  .cm[data-lift="true"] { transform: none; }
  .cm .cm-bolt { opacity: 1; }
  .cm .cm-current, .cm .cm-gloss { opacity: 0; }
}
`;

export type CramMachineProps = {
  variant: MachineVariant;
  /** The campus's colours; the brand's when no school. */
  primary: string;
  secondary: string;
  /** A run counter — each increment plays the power-up once. 0 = never run. */
  run: number;
  /** After a run (or under reduced motion): the bolt rests on the paper. */
  powered: boolean;
  /** Hover / focus: the whole machine scales up a hair. */
  lift: boolean;
  className?: string;
  style?: CSSProperties;
};

function CramMachineImpl({ variant, primary, secondary, run, powered, lift, className, style }: CramMachineProps) {
  const spec = MACHINES[variant];
  const uid = useId().replace(/:/g, "");
  // Gradient ids are prefixed per instance so three machines on one page never collide.
  const defs = spec.data.defs.replace(/id="([^"]+)"/g, `id="${uid}-$1"`);
  const fillFor = (fill: string) => (fill.startsWith("url(#") ? `url(#${uid}-${fill.slice(5, -1)})` : fill);
  const powerIds = (spec.parts["power-line"] ?? []).map((i) => `${uid}-p${i}`);
  const vars = { ["--campus-primary" as string]: primary, ["--campus-secondary" as string]: secondary } as CSSProperties;
  const placeholderAt = spec.parts.placeholder?.[0] ?? -1;
  const bolt = (
    // The placement matrix is a presentation ATTRIBUTE on the outer group and nothing animates
    // that group; the pop (a CSS transform) plays on the inner group, whose fill-box origin is
    // the bolt's own centre — a CSS transform would otherwise replace the matrix, not compose.
    <g key={`bolt-${run}`} className="cm-bolt-wrap">
      <g transform={BOLT_PLACEMENTS[variant]}>
        <g className="cm-bolt">
          <path d={BOLT_OUTER} fill="#000" opacity="0.22" transform="translate(2.5 3.5)" />
          <path d={BOLT_OUTER} fill={primary} stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round" paintOrder="stroke" />
          <path d={BOLT_RIGHT} fill={secondary} />
          <clipPath id={`${uid}-bolt-clip`}><path d={BOLT_OUTER} /></clipPath>
          <g clipPath={`url(#${uid}-bolt-clip)`}>
            <rect className="cm-gloss" x={BOLT_BOX.x - 20} y={BOLT_BOX.y - 20} width={BOLT_BOX.w + 40} height={BOLT_BOX.h + 40} fill={`url(#${uid}-gloss)`} />
          </g>
        </g>
      </g>
    </g>
  );
  return (
    <svg
      className={`cm${className ? ` ${className}` : ""}`}
      viewBox={spec.data.viewBox}
      data-variant={variant}
      data-run={run > 0 ? run : undefined}
      data-powered={powered || undefined}
      data-lift={lift || undefined}
      style={{ ...vars, ...style }}
      aria-hidden
      focusable="false"
    >
      <defs>
        <g dangerouslySetInnerHTML={{ __html: defs }} />
        <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="0.65" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-current`} x1="0" y1="0" x2={spec.power.dir === "left" ? "1" : "0"} y2={spec.power.dir === "left" ? "0" : "1"}>
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}-power-clip`}>{powerIds.map((id) => <use key={id} href={`#${id}`} />)}</clipPath>
      </defs>
      <g key={`run-${run}`}>
        {spec.data.paths.map((p, i) => {
          const part = partOf(variant, i);
          if (part === "placeholder") return null;
          const campus = ORANGES.has(p.fill.toUpperCase()) && (part === "power-line" || part === "power-node");
          return (
            <path
              key={i}
              id={part === "power-line" ? `${uid}-p${i}` : undefined}
              d={p.d}
              fill={campus ? "var(--campus-primary)" : fillFor(p.fill)}
              fillOpacity={p.opacity}
              data-part={part === "machine-body" ? undefined : part}
            />
          );
        }).flatMap((el, i) => (i === placeholderAt ? [bolt, el] : [el]))}
        {/* THE CURRENT — a bright bar swept along the line, clipped to the line's own paths. */}
        <g clipPath={`url(#${uid}-power-clip)`}>
          <rect className="cm-current" data-dir={spec.power.dir} x={spec.power.x} y={spec.power.y} width={spec.power.w} height={spec.power.h} fill={`url(#${uid}-current)`} />
        </g>
        {/* THE NODE'S GLOW. */}
        <circle className="cm-node" cx={spec.node.cx} cy={spec.node.cy} r={spec.node.r} />
      </g>
    </svg>
  );
}

export const CramMachine = memo(CramMachineImpl);
