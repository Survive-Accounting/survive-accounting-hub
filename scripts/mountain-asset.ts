// MOUNTAIN ASSET — turn the Recraft "mt cook textured" export into a campus-recolourable SVG.
//   bun scripts/mountain-asset.ts ["C:/path/to/mt cook textured.svg"]
//
// The source is ~1280 flat-filled <path>s (plus 15 two-stop gradients). Every fill is one of two
// hue families — a RED family (the lit faces) and a BLUE family (the shaded faces) — and the
// "texture" is nothing but the per-path LIGHTNESS variation inside each family. So the asset is
// recolourable by keeping the variation and swapping the base hue:
//
//   1. strip the c2pa <metadata> block (about a third of the file) and the per-path transform
//      (identical on every path — hoisted to one <g>);
//   2. classify each distinct colour by hue → 'p' (red → campus primary) / 's' (blue → campus
//      secondary); snow whites, one green, a few greys stay literal — they are not a face;
//   3. bucket each family into ≤ 10 lightness STEPS and record every step's lightness OFFSET from
//      the family's (path-weighted) median — the shade that maps to the campus colour untouched;
//   4. rewrite every fill to `var(--mtn-<family>-<step>, <original hex>)` so the file still renders
//      as Mt Cook when nothing sets the vars;
//   5. write public/brand/mt-cook.svg and splice the step table + geometry into the @generated
//      region of src/components/site/mountain-palette.ts, where mountainPalette() re-applies the
//      same offsets to any school's pair.
//
// Fills go in a style="" attribute rather than the fill="" presentation attribute: var() inside
// a presentation attribute is unreliable across engines, var() inside style is not.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { hexToRgb, lightness, chroma } from "../src/components/site/bolt/bolt-palette";
import { STEP_VAR_PREFIX } from "../src/components/site/mountain-palette";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = process.argv[2] ?? "C:/Users/lee/Downloads/mt cook textured.svg";
const OUT_SVG = resolve(ROOT, "public/brand/mt-cook.svg");
const OUT_TS = resolve(ROOT, "src/components/site/mountain-palette.ts");
const MAX_STEPS = 10;

type Family = "p" | "s";

// ── classification ─────────────────────────────────────────────────────────────────────────────

function hue(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Red-ish (incl. the maroons and the few rust browns) → 'p'; blue-ish → 's'; else null = keep
 *  literal. Snow (very light) and greys (no chroma) have no hue worth trusting. */
function classify(hex: string): Family | null {
  const l = lightness(hex),
    c = chroma(hex),
    h = hue(hex);
  if (l === null || c === null || h === null) return null;
  if (l >= 0.85 || c < 0.1) return null;
  if (h >= 300 || h <= 55) return "p";
  if (h >= 170 && h <= 265) return "s";
  return null;
}

// ── read + strip ───────────────────────────────────────────────────────────────────────────────

let svg = readFileSync(SOURCE, "utf8");
const sourceBytes = Buffer.byteLength(svg);
svg = svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, "").replace(/\s+xmlns:c2pa="[^"]*"/g, "");
svg = svg.replace(/^<\?xml[^>]*\?>/, "");

// The per-path transform is the same on every path — hoist it to one group.
const transforms = new Set<string>();
svg.replace(/<path[^>]*?transform="([^"]*)"/g, (_m, t: string) => {
  transforms.add(t);
  return "";
});
const sharedTransform = transforms.size === 1 ? [...transforms][0] : null;
if (sharedTransform) svg = svg.replace(/\s+transform="[^"]*"/g, "");

// ── tally colours (per-path weight for the median) ────────────────────────────────────────────

const counts = new Map<string, number>();
function tally(hex: string, n = 1) {
  const k = hex.toUpperCase();
  counts.set(k, (counts.get(k) ?? 0) + n);
}
for (const m of svg.matchAll(/<path[^>]*?fill="(#[0-9a-fA-F]{6})"/g)) tally(m[1]);
for (const m of svg.matchAll(/stop-color="(#[0-9a-fA-F]{6})"/g)) tally(m[1]);

type Member = { hex: string; l: number; n: number };
const families: Record<Family, Member[]> = { p: [], s: [] };
const literal: Member[] = [];
for (const [hex, n] of counts) {
  const l = lightness(hex)!;
  const f = classify(hex);
  if (f) families[f].push({ hex, l, n });
  else literal.push({ hex, l, n });
}

// ── bucket into ≤ MAX_STEPS lightness steps ────────────────────────────────────────────────────

type Step = { family: Family; step: number; offset: number; share: number; members: Member[] };
const stepOf = new Map<string, string>(); // hex → var name
const table: Step[] = [];

function weightedMedian(ms: Member[]): number {
  const sorted = [...ms].sort((a, b) => a.l - b.l);
  const total = sorted.reduce((s, m) => s + m.n, 0);
  let acc = 0;
  for (const m of sorted) {
    acc += m.n;
    if (acc >= total / 2) return m.l;
  }
  return sorted[sorted.length - 1].l;
}

for (const family of ["p", "s"] as Family[]) {
  const ms = families[family].sort((a, b) => a.l - b.l);
  const median = weightedMedian(ms);
  const familyFills = ms.reduce((s, m) => s + m.n, 0);
  const lo = ms[0].l,
    hi = ms[ms.length - 1].l;
  const width = (hi - lo) / MAX_STEPS || 1;
  const bins = new Map<number, Member[]>();
  for (const m of ms) {
    const i = Math.min(MAX_STEPS - 1, Math.floor((m.l - lo) / width));
    bins.set(i, [...(bins.get(i) ?? []), m]);
  }
  // Renumber so steps are dense (0..k-1) in rising lightness; empty bins leave no gap.
  let step = 0;
  for (const i of [...bins.keys()].sort((a, b) => a - b)) {
    const members = bins.get(i)!;
    const weight = members.reduce((s, m) => s + m.n, 0);
    const mean = members.reduce((s, m) => s + m.l * m.n, 0) / weight;
    const offset = +(mean - median).toFixed(4);
    const share = +(weight / familyFills).toFixed(4);
    table.push({ family, step, offset, share, members });
    for (const m of members) stepOf.set(m.hex, `${STEP_VAR_PREFIX}${family}-${step}`);
    step++;
  }
}

// ── rewrite fills ──────────────────────────────────────────────────────────────────────────────

function varFor(hex: string): string | null {
  const name = stepOf.get(hex.toUpperCase());
  return name ? `var(${name},${hex.toUpperCase()})` : null;
}

svg = svg.replace(/<path([^>]*?)fill="(#[0-9a-fA-F]{6})"/g, (m, pre: string, hex: string) => {
  const v = varFor(hex);
  return v ? `<path${pre}style="fill:${v}"` : m;
});
svg = svg.replace(/stop-color="(#[0-9a-fA-F]{6})"/g, (m, hex: string) => {
  const v = varFor(hex);
  return v ? `style="stop-color:${v}"` : m;
});

// Recraft writes three decimals in a 1000-unit box; one is invisible at any size this renders
// (≤ 0.1 px error at 1000 px wide) and is the single biggest byte saving left.
svg = svg.replace(/\sd="([^"]*)"/g, (_m, d: string) => ` d="${d.replace(/-?\d*\.\d+/g, (n) => String(+(+n).toFixed(1)))}"`);

// ── geometry: tight bbox of every path so the component knows where the peak is ───────────────

const [sx, sy] = sharedTransform?.match(/scale\(([\d.]+)\s+([\d.]+)\)/)?.slice(1).map(Number) ?? [1, 1];
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity,
  peakX = 0;
for (const m of svg.matchAll(/<path[^>]*?\sd="([^"]*)"/g)) {
  const d = m[1];
  // Absolute coordinates only (Recraft emits M/C/L in absolute form). Pairs come in x,y order.
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i] * sx,
      y = nums[i + 1] * sy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (y < minY) {
      minY = y;
      peakX = x;
    }
  }
}
const box = { x: Math.floor(minX), y: Math.floor(minY), w: Math.ceil(maxX - minX), h: Math.ceil(maxY - minY) };

// ── assemble ───────────────────────────────────────────────────────────────────────────────────

svg = svg
  .replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const kept = attrs
      .replace(/\s+(width|height|viewBox)="[^"]*"/g, "")
      .replace(/\s+xmlns:xlink="[^"]*"/g, "");
    return `<svg${kept} viewBox="${box.x} ${box.y} ${box.w} ${box.h}" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">`;
  })
  .replace(/<\/svg>\s*$/, "</svg>");
if (sharedTransform) {
  svg = svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)$/, (_m, open, body, close) => `${open}<g transform="${sharedTransform}">${body}</g>${close}`);
}
svg = `<!-- generated by scripts/mountain-asset.ts — do not hand-edit; fills are var(--mtn-*) with the Mt Cook hex as fallback -->\n${svg}\n`;

mkdirSync(resolve(ROOT, "public/brand"), { recursive: true });
writeFileSync(OUT_SVG, svg);

// ── splice the table into mountain-palette.ts ─────────────────────────────────────────────────

const stepsLiteral = table
  .map((s) => `  { family: "${s.family}", step: ${s.step}, offset: ${s.offset}, share: ${s.share} },`)
  .join("\n");
const generated = [
  `// generated by scripts/mountain-asset.ts from ${SOURCE.split(/[\\/]/).pop()} — do not hand-edit`,
  `export const MOUNTAIN_STEPS: readonly MountainStep[] = [`,
  stepsLiteral,
  `];`,
  `/** Tight viewBox of the artwork plus where the summit sits, as a fraction of that box. */`,
  `export const MOUNTAIN_GEOMETRY = { viewBox: [${box.x}, ${box.y}, ${box.w}, ${box.h}] as const, peakX: ${+((peakX - box.x) / box.w).toFixed(4)}, aspect: ${+(box.h / box.w).toFixed(4)} } as const;`,
].join("\n");

const ts = readFileSync(OUT_TS, "utf8");
const START = "// @generated-start",
  END = "// @generated-end";
if (!ts.includes(START) || !ts.includes(END)) throw new Error(`${OUT_TS} is missing the ${START}/${END} markers`);
writeFileSync(OUT_TS, ts.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${generated}\n${END}`));

// ── report ─────────────────────────────────────────────────────────────────────────────────────

const outBytes = Buffer.byteLength(svg);
console.log(`source  ${SOURCE}  ${(sourceBytes / 1024).toFixed(1)} KB`);
console.log(`written ${OUT_SVG}  ${(outBytes / 1024).toFixed(1)} KB  (${Math.round((1 - outBytes / sourceBytes) * 100)}% smaller)`);
console.log(`viewBox ${box.x} ${box.y} ${box.w} ${box.h}   peak at x=${((peakX - box.x) / box.w * 100).toFixed(1)}%   transform hoisted: ${sharedTransform ?? "no"}`);
for (const family of ["p", "s"] as Family[]) {
  const steps = table.filter((s) => s.family === family);
  const paths = families[family].reduce((s, m) => s + m.n, 0);
  console.log(`family ${family}: ${families[family].length} colours / ${paths} fills → ${steps.length} steps`);
  for (const s of steps) console.log(`   ${family}-${s.step}  offset ${s.offset >= 0 ? "+" : ""}${s.offset.toFixed(3)}  share ${(s.share * 100).toFixed(1)}%  ←${s.members.map((m) => `${m.hex}×${m.n}`).join(" ")}`);
}
console.log(`literal (unmapped): ${literal.map((m) => `${m.hex}×${m.n}`).join(" ") || "none"}`);
const leftover = (svg.match(/fill="#/g) ?? []).length + (svg.match(/stop-color="#/g) ?? []).length;
console.log(`fills left literal in the file: ${leftover}`);
