// BOLT GEOMETRY EDIT — the vector-editing layer over the procedural bolt (bolt-forge).
// Pure, deterministic geometry ops on an ordered vertex ring, so the Logo Lab can
// refine the lightning-bolt shape. The pipeline is: base procedural points → GEOMETRY
// ASSIST transform → MANUAL per-vertex offsets → path. Every assist knob is NEUTRAL at
// 0 (identity), so the default bolt is unchanged until a control is moved.

export type V = { x: number; y: number };
export type Pt = [number, number];
export const toV = (p: Pt): V => ({ x: p[0], y: p[1] });
export const toPt = (v: V): Pt => [v.x, v.y];

/** Geometry-assist settings + angle snapping. All neutral defaults = identity. */
export type GeometryAssist = {
  vSym: number;          // 0–1 vertical symmetry — blend bottom toward a mirror of the top
  vSymReverse: boolean;  // reverse the mirrored direction (point-reflection vs vertical flip)
  hSym: number;          // 0–1 horizontal symmetry — blend right toward a mirror of the left
  parallel: number;      // 0–1 pull edges in a directional family toward a shared angle
  angleConsist: number;  // 0–1 converge similar segments toward a small set of angles
  straighten: number;    // 0–1 remove micro-kinks (pull near-collinear vertices onto the line)
  rhythm: number;        // 0–1 even out tooth spacing / vertical intervals
  optical: number;       // 0–1 shift mass so the bolt reads centred
  snap: string;          // "off" | "5" | "7.5" | "10" | "15" | "22.5" | "30" | "custom"
  snapStrength: number;  // 0–1
  customFamilies: number[]; // custom angle families (degrees), used when snap === "custom"
};
export const DEFAULT_ASSIST: GeometryAssist = {
  vSym: 0, vSymReverse: false, hSym: 0, parallel: 0, angleConsist: 0, straighten: 0,
  rhythm: 0, optical: 0, snap: "off", snapStrength: 0, customFamilies: [],
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number };
export function bounds(pts: V[]): Bounds {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
const r2 = (v: number) => Math.round(v * 100) / 100;
export function ptsToPath(pts: V[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${r2(p.x)} ${r2(p.y)}`).join(" ") + " Z";
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---- edges + angles -----------------------------------------------------------
export type Edge = { i: number; a: V; b: V; angle: number; len: number };
export function edgesOf(pts: V[]): Edge[] {
  const n = pts.length;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    return { i, a, b, angle: Math.atan2(b.y - a.y, b.x - a.x), len: Math.hypot(b.x - a.x, b.y - a.y) };
  });
}
/** Rotate every edge toward a per-edge target angle (around its midpoint), averaging
 *  the two contributions each shared vertex receives, then blend from the original by
 *  `amt`. A one-pass relaxation: stable + bounded, no closure drift. */
function angleRelax(pts: V[], targetOf: (angle: number, i: number) => number, amt: number): V[] {
  if (amt <= 0) return pts;
  const n = pts.length;
  const acc: V[] = pts.map(() => ({ x: 0, y: 0 }));
  const cnt: number[] = pts.map(() => 0);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const tgt = targetOf(ang, i);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const j = (i + 1) % n;
    acc[i].x += mx - Math.cos(tgt) * half; acc[i].y += my - Math.sin(tgt) * half; cnt[i]++;
    acc[j].x += mx + Math.cos(tgt) * half; acc[j].y += my + Math.sin(tgt) * half; cnt[j]++;
  }
  return pts.map((p, i) => (cnt[i] ? { x: lerp(p.x, acc[i].x / cnt[i], amt), y: lerp(p.y, acc[i].y / cnt[i], amt) } : p));
}
/** Greedy 1-D clustering of angles (radians, compared mod π so opposite directions of
 *  the same line share a family). Returns each edge's cluster-mean angle. */
function clusterTargets(angles: number[], tolDeg: number): number[] {
  const tol = tolDeg * D2R;
  const clusters: { sum: number; n: number; ref: number }[] = [];
  const assign: number[] = angles.map((a) => {
    // normalise to (-π/2, π/2] via mod π for family grouping
    let m = a % Math.PI; if (m > Math.PI / 2) m -= Math.PI; if (m <= -Math.PI / 2) m += Math.PI;
    let ci = clusters.findIndex((c) => Math.abs(((m - c.ref + Math.PI / 2) % Math.PI) - Math.PI / 2) < tol);
    if (ci < 0) { clusters.push({ sum: m, n: 1, ref: m }); ci = clusters.length - 1; } else { clusters[ci].sum += m; clusters[ci].n++; }
    return ci;
  });
  return angles.map((a, i) => {
    const mean = clusters[assign[i]].sum / clusters[assign[i]].n;
    // pick the representation (mean or mean+π) closest to the ORIGINAL angle, so an
    // edge keeps its direction (we only align the underlying line family).
    const cands = [mean, mean + Math.PI, mean - Math.PI];
    return cands.reduce((best, c) => (Math.abs(c - a) < Math.abs(best - a) ? c : best), cands[0]);
  });
}
function snapTarget(angleRad: number, mode: string, custom: number[]): number {
  if (mode === "off") return angleRad;
  const deg = angleRad * R2D;
  if (mode === "custom") {
    if (!custom.length) return angleRad;
    // nearest custom family, considering the line (±180)
    let best = deg, bd = Infinity;
    for (const fam of custom) for (const f of [fam, fam + 180, fam - 180]) { const d = Math.abs(f - deg); if (d < bd) { bd = d; best = f; } }
    return best * D2R;
  }
  const step = parseFloat(mode);
  if (!step) return angleRad;
  return Math.round(deg / step) * step * D2R;
}

// ---- individual assist transforms (each identity at amt <= 0) ------------------
/** Pull only NEAR-COLLINEAR vertices onto the line through their neighbours (kills
 *  jitter micro-kinks); sharp teeth (large deviation) are left alone. */
function straighten(pts: V[], amt: number): V[] {
  if (amt <= 0) return pts;
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
    const proj = { x: a.x + dx * t, y: a.y + dy * t };
    const dev = Math.hypot(p.x - proj.x, p.y - proj.y);
    const gate = clamp01(1 - dev / (L * 0.35)); // ~0 for sharp teeth, ~1 for micro-kinks
    return { x: lerp(p.x, proj.x, amt * gate), y: lerp(p.y, proj.y, amt * gate) };
  });
}
/** Even the vertical rhythm — blend each vertex's Y toward an evenly-spaced position
 *  (by its rank in Y), preserving X (tooth depth stays), so intervals get regular. */
function rhythm(pts: V[], amt: number): V[] {
  if (amt <= 0) return pts;
  const b = bounds(pts);
  const order = pts.map((_, i) => i).sort((i, j) => pts[i].y - pts[j].y);
  const rank: number[] = pts.map(() => 0);
  order.forEach((idx, r) => (rank[idx] = r));
  const n = pts.length;
  return pts.map((p, i) => {
    const evenY = b.minY + ((b.maxY - b.minY) * rank[i]) / Math.max(1, n - 1);
    return { x: p.x, y: lerp(p.y, evenY, amt * 0.6) };
  });
}
/** Shift all points so the area centroid moves toward the bounding-box centre. */
function optical(pts: V[], amt: number): V[] {
  if (amt <= 0) return pts;
  const b = bounds(pts);
  let A = 0, cx = 0, cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const cross = p.x * q.y - q.x * p.y; A += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross; }
  A *= 0.5; if (Math.abs(A) < 1e-6) return pts;
  cx /= 6 * A; cy /= 6 * A;
  const dx = (b.cx - cx) * amt, dy = (b.cy - cy) * amt;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
/** Blend the shape toward its own mirror (about the h- or v-centreline). Each vertex is
 *  pulled toward the CLOSEST point on the reflected ring, so no structural pairing is
 *  needed and winding order is preserved. At amt=1 the shape becomes symmetric. */
export function symmetrize(pts: V[], amt: number, mode: "v" | "h", reverse = false): V[] {
  if (amt <= 0) return pts;
  const b = bounds(pts);
  const reflect = (p: V): V =>
    mode === "v"
      ? (reverse ? { x: 2 * b.cx - p.x, y: 2 * b.cy - p.y } : { x: p.x, y: 2 * b.cy - p.y })
      : { x: 2 * b.cx - p.x, y: p.y };
  const mirror = pts.map(reflect);
  const nearest = (p: V): V => {
    let best = mirror[0], bd = Infinity;
    for (const m of mirror) { const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2; if (d < bd) { bd = d; best = m; } }
    return best;
  };
  return pts.map((p) => { const m = nearest(p); return { x: lerp(p.x, m.x, amt * 0.5), y: lerp(p.y, m.y, amt * 0.5) }; });
}

/** Apply the full geometry-assist stack, in a deliberate order. Identity for the
 *  neutral (all-zero / off) settings, so the default bolt is unchanged. */
export function applyAssist(input: V[], a: GeometryAssist): V[] {
  let pts = input;
  pts = straighten(pts, clamp01(a.straighten));
  pts = rhythm(pts, clamp01(a.rhythm));
  if (a.parallel > 0) { const angs = edgesOf(pts).map((e) => e.angle); const tgt = clusterTargets(angs, 16); pts = angleRelax(pts, (_ang, i) => tgt[i], clamp01(a.parallel) * 0.8); }
  if (a.angleConsist > 0) { const angs = edgesOf(pts).map((e) => e.angle); const tgt = clusterTargets(angs, 9); pts = angleRelax(pts, (_ang, i) => tgt[i], clamp01(a.angleConsist) * 0.8); }
  if (a.snap !== "off" && a.snapStrength > 0) pts = angleRelax(pts, (ang) => snapTarget(ang, a.snap, a.customFamilies), clamp01(a.snapStrength));
  pts = symmetrize(pts, clamp01(a.hSym), "h");
  pts = symmetrize(pts, clamp01(a.vSym), "v", a.vSymReverse);
  pts = optical(pts, clamp01(a.optical));
  return pts;
}

// ---- analyze angles -----------------------------------------------------------
export type AngleFamily = { angle: number; count: number };
/** Dominant angle families currently in the ring (degrees, 0–180), most-used first. */
export function analyzeAngles(pts: V[], tolDeg = 8): AngleFamily[] {
  const clusters: { sum: number; n: number; ref: number }[] = [];
  for (const e of edgesOf(pts)) {
    let m = (e.angle * R2D) % 180; if (m < 0) m += 180;
    let ci = clusters.findIndex((c) => Math.min(Math.abs(m - c.ref), 180 - Math.abs(m - c.ref)) < tolDeg);
    if (ci < 0) clusters.push({ sum: m, n: 1, ref: m }); else { clusters[ci].sum += m; clusters[ci].n++; }
  }
  return clusters.map((c) => ({ angle: Math.round((c.sum / c.n) * 10) / 10, count: c.n })).sort((x, y) => y.count - x.count);
}

// ---- one-shot operations (undoable bakes) -------------------------------------
/** Cleanup — straighten, converge angles, ease rhythm, snap near-parallel edges, at a
 *  single strength; preserves the silhouette + teeth (gated), avoids reordering. */
export function cleanupGeometry(pts: V[], strength: number): V[] {
  const s = clamp01(strength);
  return applyAssist(pts, { ...DEFAULT_ASSIST, straighten: s, angleConsist: s, parallel: s * 0.6, rhythm: s * 0.5 });
}
/** Overwrite the target half with a reflection of the source half (mirror ops). Ring
 *  order is untouched, so winding is preserved. */
export function mirrorHalf(pts: V[], mode: "v" | "h", sourceLow: boolean): V[] {
  const b = bounds(pts);
  const c = mode === "v" ? b.cy : b.cx;
  const val = (p: V) => (mode === "v" ? p.y : p.x);
  const reflect = (p: V): V => (mode === "v" ? { x: p.x, y: 2 * c - p.y } : { x: 2 * c - p.x, y: p.y });
  const inSource = (p: V) => (sourceLow ? val(p) <= c : val(p) >= c);
  const src = pts.filter(inSource);
  if (!src.length) return pts;
  return pts.map((p) => {
    if (inSource(p)) return p;
    const rp = reflect(p); // find the source point whose reflection is nearest this target point
    let best = src[0], bd = Infinity;
    for (const sp of src) { const d = (sp.x - rp.x) ** 2 + (sp.y - rp.y) ** 2; if (d < bd) { bd = d; best = sp; } }
    return reflect(best);
  });
}
export const averageAxis = (pts: V[], mode: "v" | "h") => symmetrize(pts, 1, mode);
