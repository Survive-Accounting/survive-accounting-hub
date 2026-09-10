// THE MAP, drawn. Pure SVG — no ReactFlow, no store, no network, no drag library.
//
// Lee, 2026-09-09: "you have a path in the middle and you have offshoots… to the right of the
// path" and pitch videos on the left. 2026-09-10: "connect them to the right splits, and this way
// I'll know what order of production I'm making the videos today." Later that day: "the cram path
// is down the middle and it's the only thing you really see… the offshoots you have to click to
// open"; "when I see 10 different offshoots off one section of the cram path that's not very
// useful"; "drag and drop would be best"; "all I really want to see is the title of the offshoot".
//
// So: COLLAPSED, the map is the cram path alone, one column, each set with its split pills and a
// badge counting what hangs off it. EXPANDED, a cram set with splits is a tall box with one
// sub-row per split, and every branch hangs level with the sub-row it belongs to — offshoots
// right, pitches left — so the ten offshoots are read as two here, three there. A branch node is
// its title and its production number, nothing else; the stage is the stroke colour and the rest
// is in the hover title. Branches drag: pointer events on the SVG, a ghost, a drop line, and one
// planDrop → onDrop on release. Every number is looked up by id at render (stage, question count,
// runtime), so this component holds no state but the drag in flight and can never disagree with
// the queue. The layout is lane-map.ts's; this file only turns it into shapes.
import { useEffect, useRef, useState } from "react";

import { laneOf, type DeckLane } from "@/lib/deck-lane";
import type { BranchMove, LaneLayout, LaneNode, LaneTake, RowBand } from "./lane-map";
import { planDrop, rowBands } from "./lane-map";
import type { StageInfo } from "./set-stage";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

const BOX_W = 214;
/** A cram set's header line — and the whole box when it has no splits. */
const CRAM_H = 46;
/** A branch is its title and its number now, so it is shorter than a cram box. */
const BRANCH_H = 34;
/** One split's sub-row inside a cram box. */
const SPLIT_H = 22;
const STACK_GAP = 8;
/** How far a stacked child drops below the one above it. */
const STEP = BRANCH_H + STACK_GAP;
/** Room under a band's stack before the next band begins. */
const BAND_PAD = 8;
const ROW_GAP = 26;
/** Collapsed: a cram set with splits grows a third line of pills. */
const CRAM_TAKES_H = 18;
const PAD_Y = 18;
const PAD_X = 20;
/** Pointer travel before a press becomes a drag; under it, a press is a click. */
const DRAG_SLOP = 4;

const LANE_STROKE: Record<DeckLane, string> = { cram: V3_GOLD, offshoot: "#7DD3FC", pitch: "#C4B5FD" };
const FLAG = "#FF9F43";

type BranchLane = "offshoot" | "pitch";

function fit(name: string, chars = 26): string {
  const n = name.trim();
  return n.length <= chars ? n : `${n.slice(0, chars - 1).trimEnd()}…`;
}
function nodeX(col: 0 | 1 | 2, colW: number): number { return col * colW + (colW - BOX_W) / 2; }

interface BandGeom extends RowBand { top: number; height: number }
interface RowGeom {
  row: number;
  cramId: string;
  top: number;
  /** The cram box's own height: the header plus every split's band. Never the tail. */
  boxH: number;
  /** Where the row's last stack ends; the next row starts ROW_GAP below. */
  bottom: number;
  hasSplits: boolean;
  bands: BandGeom[];
}
interface Geometry { rows: RowGeom[]; y: Map<string, number>; bottom: number }

/** ROWS GROW TO FIT THEIR STACKS. The first draft placed row r at PAD_Y + r·ROW_H regardless of
 *  how many offshoots hung off it, so six offshoots on Account classification ran straight down
 *  over the two rows beneath (seen on the first live render, 2026-09-10). Each row is now the sum
 *  of its bands, and each band is as tall as its sub-row or its tallest side's stack, whichever
 *  is taller. Pure geometry over lane-map.ts's rowBands. */
function rowGeometry(layout: LaneLayout, takesOf: (id: string) => readonly LaneTake[]): Geometry {
  const rows: RowGeom[] = [];
  const y = new Map<string, number>();
  let cur = PAD_Y;
  for (let r = 0; r < layout.rows; r++) {
    const cramId = layout.nodes.find((n) => n.lane === "cram" && n.row === r)?.id ?? "";
    const takes = takesOf(cramId);
    const hasSplits = takes.length > 1;
    const top = cur;
    let boxH = 0;
    const bands: BandGeom[] = [];
    for (const band of rowBands(layout, r, takes)) {
      const stack = Math.max(band.left.length, band.right.length);
      const stackH = stack ? stack * STEP - STACK_GAP + BAND_PAD : 0;
      const base = band.kind === "head" ? CRAM_H : band.kind === "split" ? SPLIT_H : 0;
      const height = Math.max(base, stackH);
      bands.push({ ...band, top: cur, height });
      band.left.forEach((n, k) => y.set(n.id, cur + k * STEP));
      band.right.forEach((n, k) => y.set(n.id, cur + k * STEP));
      if (band.kind !== "tail") boxH += height;
      cur += height;
    }
    if (!hasSplits) boxH = CRAM_H;
    y.set(cramId, top);
    rows.push({ row: r, cramId, top, boxH, bottom: cur, hasSplits, bands });
    cur += ROW_GAP;
  }
  return { rows, y, bottom: cur };
}

/** Where a branch's curve leaves its parent: the sub-row's edge, not the box's centre. */
function anchorY(row: RowGeom, band: BandGeom): number {
  if (band.kind === "split") return band.top + SPLIT_H / 2;
  if (band.kind === "tail") return row.top + row.boxH - 6;
  return row.top + CRAM_H / 2;
}

function curve(px: number, py: number, cx: number, cy: number): string {
  const mid = (px + cx) / 2;
  return `M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`;
}

interface DropTarget {
  parentId: string;
  takeHead: string | null;
  index: number;
  /** The band the drop highlights — null when an offshoot lands after a set that has no tail yet. */
  band: BandGeom | null;
  row: RowGeom;
  lineY: number;
}

/** THE TARGET UNDER THE POINTER. The cram row by y band, then the band by y within the row (the
 *  header, or above it, is the whole set), the lane fixed by what is being dragged, and the index
 *  by where the pointer sits among that split's existing branches. */
function hitTarget(geom: Geometry, p: { x: number; y: number }, drag: { id: string; lane: BranchLane }): DropTarget | null {
  const row = geom.rows.find((r) => p.y >= r.top - ROW_GAP / 2 && p.y < r.bottom + ROW_GAP / 2);
  if (!row || !row.bands.length) return null;
  const under = row.bands.find((b) => p.y >= b.top && p.y < b.top + b.height)
    ?? (p.y < row.bands[0].top ? row.bands[0] : row.bands[row.bands.length - 1]);
  const takeHead = under.takeHead;
  // The whole set has a home per lane: a pitch's is the header, an offshoot's is the tail.
  let band: BandGeom | null = under;
  if (takeHead == null && row.hasSplits) {
    band = drag.lane === "pitch" ? row.bands[0] : (row.bands.find((b) => b.kind === "tail") ?? null);
  }
  const side = band ? (drag.lane === "pitch" ? band.left : band.right) : [];
  const siblings = side.filter((n) => n.id !== drag.id && n.takeHead === takeHead);
  const ys = siblings.map((n) => geom.y.get(n.id) ?? 0);
  let index = ys.findIndex((y) => y + BRANCH_H / 2 > p.y);
  if (index < 0) index = siblings.length;
  let lineY: number;
  if (index < siblings.length) lineY = ys[index] - STACK_GAP / 2;
  else if (siblings.length) lineY = ys[siblings.length - 1] + BRANCH_H + STACK_GAP / 2;
  else if (!band) lineY = row.top + row.boxH + STACK_GAP / 2;
  else lineY = band.top + (band.kind === "split" ? SPLIT_H / 2 : band.kind === "head" ? CRAM_H / 2 : STACK_GAP);
  return { parentId: row.cramId, takeHead, index, band, row, lineY };
}

interface Drag {
  id: string;
  lane: BranchLane;
  pointerId: number;
  /** Pointer at press, SVG units. */
  sx: number;
  sy: number;
  /** Where on the node it was grabbed, so the ghost does not jump. */
  dx: number;
  dy: number;
  /** Pointer now. */
  x: number;
  y: number;
  /** True once the pointer has travelled DRAG_SLOP — before that, a press is a click. */
  active: boolean;
  target: DropTarget | null;
}

export function LaneMap({ layout, stage, count, runtime, takesOf, selected, onSelect, w = 960, expanded = true, onDrop, dragDisabled = false }: {
  layout: LaneLayout;
  stage: (setId: string) => StageInfo | null;
  count: (setId: string) => number | null;
  runtime?: (setId: string) => string | null;
  /** A cram set's splits, from its saved plan — sub-rows expanded, pills collapsed. */
  takesOf: (setId: string) => readonly LaneTake[];
  selected: string | null;
  onSelect: (setId: string) => void;
  w?: number;
  /** false = the cram path alone, one column, nothing hanging off it drawn. */
  expanded?: boolean;
  /** A branch was dragged somewhere new. Absent = branches do not drag. */
  onDrop?: (m: BranchMove) => void;
  dragDisabled?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const canDrag = expanded && !dragDisabled && !!onDrop;

  useEffect(() => {
    if (!drag?.active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrag(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag?.active]);

  const subline = (id: string): string => {
    const info = stage(id);
    const q = count(id);
    const rt = runtime?.(id) ?? null;
    return [info?.label ?? null, q === 0 ? "short" : q != null ? `${q} q` : null, rt].filter(Boolean).join(" · ");
  };
  const strokeOf = (n: LaneNode): string => selected === n.id ? V3_GOLD : (stage(n.id)?.color ?? LANE_STROKE[n.lane]);
  const hover = (n: LaneNode): string => {
    const off = n.lane === "cram" ? null : n.takeMissing ? "off a split the plan lost" : n.take ? `off ${n.take.name || `Split ${n.take.index + 1}`}` : null;
    const where = [off, subline(n.id)].filter(Boolean).join(" · ");
    return `${n.order ? `#${n.order} ` : ""}${n.name} — ${n.lane}${where ? ` · ${where}` : ""}`;
  };

  // ─── COLLAPSED: the cram path alone ───
  if (!expanded) {
    const cw = Math.max(BOX_W, Math.min(w - 2 * PAD_X, 420));
    const x = (w - cw) / 2;
    const crams = layout.nodes.filter((n) => n.lane === "cram" && !n.orphan).sort((a, b) => a.row - b.row);
    const tops: number[] = [];
    let y = PAD_Y;
    for (const n of crams) { tops.push(y); y += CRAM_H + (takesOf(n.id).length > 1 ? CRAM_TAKES_H : 0) + ROW_GAP; }
    const h = Math.max(PAD_Y * 2 + 40, y - ROW_GAP + PAD_Y);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Cram path: ${layout.rows} sets`}
        style={{ display: "block", maxWidth: w, fontFamily: "'Rubik', system-ui, sans-serif" }}>
        {crams.length > 1 && (
          <line x1={w / 2} y1={tops[0] + CRAM_H / 2} x2={w / 2} y2={tops[crams.length - 1] + CRAM_H / 2} stroke={V3_GOLD} strokeOpacity={0.28} strokeWidth={2} />
        )}
        {crams.map((n, i) => {
          const y0 = tops[i];
          const takes = takesOf(n.id);
          const boxH = CRAM_H + (takes.length > 1 ? CRAM_TAKES_H : 0);
          const on = selected === n.id;
          const stroke = strokeOf(n);
          const hanging = layout.nodes.filter((b) => b.row === n.row && !b.orphan && b.lane !== "cram").length;
          const badge = hanging ? `${hanging} to take it to an A` : "";
          const bw = badge ? 14 + badge.length * 5.4 : 0;
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
              <title>{hover(n)}</title>
              <rect x={x} y={y0} width={cw} height={boxH} rx={9} fill={`${stroke}22`} stroke={stroke} strokeWidth={on ? 1.8 : 1} />
              {n.order > 0 && (
                <>
                  <rect x={x - 9} y={y0 + 12} width={22} height={18} rx={9} fill="#0B0F1E" stroke={stroke} strokeWidth={1} />
                  <text x={x + 2} y={y0 + 25} fill={V3_CREAM} fontSize={9.5} fontWeight={800} textAnchor="middle">{n.order}</text>
                </>
              )}
              <text x={x + 18} y={y0 + 18} fill={V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(n.name, Math.max(18, Math.floor((cw - 30 - bw) / 7.2)))}</text>
              <text x={x + 18} y={y0 + 33} fill={V3_MUTED} fontSize={10.5}>{fit(subline(n.id), Math.floor((cw - 30) / 5.6))}</text>
              {badge && (
                <g>
                  <rect x={x + cw - bw - 8} y={y0 + 8} width={bw} height={16} rx={8} fill="#0B0F1E" stroke={LANE_STROKE.offshoot} strokeOpacity={0.7} strokeWidth={0.8} />
                  <text x={x + cw - 8 - bw / 2} y={y0 + 19.5} fill={LANE_STROKE.offshoot} fontSize={9} fontWeight={700} textAnchor="middle">{badge}</text>
                </g>
              )}
              {/* THE SPLITS, as pills. */}
              {takes.length > 1 && (
                <g>
                  {takes.map((t, i) => {
                    const label = fit(t.name || `S${i + 1}`, 14);
                    const pw = Math.min(90, 12 + label.length * 5.4);
                    const px = x + 18 + takes.slice(0, i).reduce((acc, tt, k) => acc + Math.min(90, 12 + fit(tt.name || `S${k + 1}`, 14).length * 5.4) + 4, 0);
                    if (px + pw > x + cw - 6) return null;
                    return (
                      <g key={t.headId}>
                        <rect x={px} y={y0 + CRAM_H - 4} width={pw} height={13} rx={4} fill="none" stroke={V3_GOLD} strokeOpacity={0.5} strokeWidth={0.8} />
                        <text x={px + pw / 2} y={y0 + CRAM_H + 5.5} fill={V3_GOLD} fontSize={8} textAnchor="middle" letterSpacing={0.3}>{label}</text>
                      </g>
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  // ─── EXPANDED: three columns, split sub-rows, drag and drop ───
  const colW = w / 3;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const geom = rowGeometry(layout, takesOf);
  const rowGeomOf = new Map(geom.rows.map((r) => [r.row, r]));
  const bandOf = (n: LaneNode): BandGeom | null => {
    const r = rowGeomOf.get(n.row);
    return r?.bands.find((b) => (n.lane === "pitch" ? b.left : b.right).some((m) => m.id === n.id)) ?? null;
  };
  const nodeY = (n: LaneNode): number => geom.y.get(n.id) ?? PAD_Y;
  const spineBottom = geom.rows.length ? geom.bottom - ROW_GAP : PAD_Y;
  const orphanTop = spineBottom + (layout.orphans ? 40 : 0);
  const h = Math.max(PAD_Y * 2 + 40, orphanTop + layout.orphans * (BRANCH_H + ROW_GAP) + PAD_Y);

  const toSvg = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (w / Math.max(1, r.width)), y: (e.clientY - r.top) * (h / Math.max(1, r.height)) };
  };
  const onBranchDown = (e: React.PointerEvent, n: LaneNode) => {
    if (!canDrag || e.button !== 0 || n.orphan || n.lane === "cram") return;
    movedRef.current = false;
    const p = toSvg(e);
    setDrag({ id: n.id, lane: n.lane, pointerId: e.pointerId, sx: p.x, sy: p.y, dx: p.x - nodeX(n.col, colW), dy: p.y - nodeY(n), x: p.x, y: p.y, active: false, target: null });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = toSvg(e);
    if (!drag.active) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < DRAG_SLOP) return;
      movedRef.current = true;
      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    }
    setDrag({ ...drag, active: true, x: p.x, y: p.y, target: hitTarget(geom, p, drag) });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    try { if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (drag.active && drag.target && onDrop) {
      const t = drag.target;
      const m = planDrop(layout, takesOf, { id: drag.id, lane: drag.lane }, { parentId: t.parentId, takeHead: t.takeHead, index: t.index });
      if (m) onDrop(m);
    }
    setDrag(null);
  };
  const onCancel = (e: React.PointerEvent) => { if (drag && e.pointerId === drag.pointerId) setDrag(null); };
  const onClickNode = (id: string) => {
    if (movedRef.current) { movedRef.current = false; return; }
    onSelect(id);
  };

  const ghost = drag?.active ? byId.get(drag.id) ?? null : null;
  const live = drag?.active && drag.target ? { lane: drag.lane, col: (drag.lane === "pitch" ? 0 : 2) as 0 | 2, target: drag.target } : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
      aria-label={`Cram path: ${layout.rows} sets, ${layout.nodes.length - layout.rows} hanging off them`}
      style={{ display: "block", maxWidth: w, fontFamily: "'Rubik', system-ui, sans-serif", userSelect: drag ? "none" : undefined }}
      onPointerMove={canDrag ? onMove : undefined}
      onPointerUp={canDrag ? onUp : undefined}
      onPointerCancel={canDrag ? onCancel : undefined}
    >
      {geom.rows.length > 1 && (
        <line x1={w / 2} y1={geom.rows[0].top + CRAM_H / 2} x2={w / 2} y2={geom.rows[geom.rows.length - 1].top + CRAM_H / 2} stroke={V3_GOLD} strokeOpacity={0.28} strokeWidth={2} />
      )}

      {layout.edges.map((e, i) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to || to.orphan) return null;
        if (e.kind === "split") {
          const x = w / 2 - BOX_W / 2 - 10;
          return (
            <path key={`s${i}`} fill="none" stroke={V3_MUTED} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 4"
              d={`M ${x} ${nodeY(from) + CRAM_H / 2} C ${x - 16} ${nodeY(from) + CRAM_H / 2}, ${x - 16} ${nodeY(to) + CRAM_H / 2}, ${x} ${nodeY(to) + CRAM_H / 2}`} />
          );
        }
        const row = rowGeomOf.get(from.row);
        const band = bandOf(to);
        if (!row || !band) return null;
        const left = to.col === 0;
        const px = nodeX(from.col, colW) + (left ? 0 : BOX_W);
        const cx = nodeX(to.col, colW) + (left ? BOX_W : 0);
        return (
          <path key={`b${i}`} d={curve(px, anchorY(row, band), cx, nodeY(to) + BRANCH_H / 2)} fill="none"
            stroke={to.takeMissing ? FLAG : LANE_STROKE[to.lane]} strokeOpacity={drag?.active && drag.id === to.id ? 0.2 : 0.55} strokeWidth={1.5}
            strokeDasharray={to.takeMissing ? "4 3" : undefined} />
        );
      })}

      {/* THE DROP TARGET: the band it lands on, and the line where it slots in. */}
      {live && (
        <g pointerEvents="none">
          {live.target.band && live.target.band.kind !== "tail" && (
            <rect x={nodeX(1, colW)} y={live.target.band.top} width={BOX_W}
              height={live.target.band.kind === "head" && !live.target.row.hasSplits ? CRAM_H : live.target.band.height}
              rx={live.target.band.kind === "head" ? 9 : 0} fill={LANE_STROKE[live.lane]} fillOpacity={0.16} />
          )}
          <line x1={nodeX(live.col, colW) - 6} y1={live.target.lineY} x2={nodeX(live.col, colW) + BOX_W + 6} y2={live.target.lineY}
            stroke={LANE_STROKE[live.lane]} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={nodeX(live.col, colW) + (live.lane === "pitch" ? BOX_W + 6 : -6)} cy={live.target.lineY} r={3.5} fill={LANE_STROKE[live.lane]} />
        </g>
      )}

      {layout.orphans > 0 && (
        <>
          <line x1={12} y1={orphanTop - 14} x2={w - 12} y2={orphanTop - 14} stroke={V3_EDGE} strokeDasharray="4 5" />
          <text x={12} y={orphanTop - 20} fill={V3_MUTED} fontSize={10} letterSpacing={1.4}>HANGING OFF NOTHING — GIVE THESE A CRAM SET</text>
        </>
      )}

      {layout.nodes.map((n) => {
        const on = selected === n.id;
        const stroke = strokeOf(n);
        const isCram = n.lane === "cram";
        const row = isCram && !n.orphan ? rowGeomOf.get(n.row) : undefined;
        const x = n.orphan ? nodeX(1, colW) : nodeX(n.col, colW);
        const y = n.orphan ? orphanTop + (n.row - layout.rows) * (BRANCH_H + ROW_GAP) : nodeY(n);
        const boxH = isCram && !n.orphan ? (row?.boxH ?? CRAM_H) : BRANCH_H;
        const dragging = drag?.active && drag.id === n.id;
        const branchHandlers = !isCram && !n.orphan && canDrag ? { onPointerDown: (e: React.PointerEvent) => onBranchDown(e, n) } : {};
        return (
          <g key={n.id} onClick={() => onClickNode(n.id)} {...branchHandlers}
            style={{ cursor: !isCram && !n.orphan && canDrag ? (dragging ? "grabbing" : "grab") : "pointer", touchAction: !isCram ? "none" : undefined }}
            opacity={dragging ? 0.35 : 1}>
            <title>{hover(n)}</title>
            <rect x={x} y={y} width={BOX_W} height={boxH} rx={9}
              fill={`${stroke}${isCram ? "22" : "18"}`} stroke={n.takeMissing ? FLAG : stroke} strokeWidth={on ? 1.8 : 1}
              strokeDasharray={n.orphan ? "5 4" : undefined} />
            {/* THE PRODUCTION NUMBER — what he films next. */}
            {n.order > 0 && (
              <>
                <rect x={x - 9} y={y + (isCram ? 12 : (BRANCH_H - 18) / 2)} width={22} height={18} rx={9} fill="#0B0F1E" stroke={stroke} strokeWidth={1} />
                <text x={x + 2} y={y + (isCram ? 25 : BRANCH_H / 2 + 3.5)} fill={V3_CREAM} fontSize={9.5} fontWeight={800} textAnchor="middle">{n.order}</text>
              </>
            )}
            {isCram ? (
              <>
                <text x={x + 18} y={y + 18} fill={V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(n.name, 24)}</text>
                <text x={x + 18} y={y + 33} fill={V3_MUTED} fontSize={10.5}>{fit(subline(n.id), 30)}</text>
                {/* THE SPLITS, one sub-row each — the targets a branch attaches to. */}
                {row?.hasSplits && row.bands.filter((b) => b.kind === "split").map((b, i) => (
                  <g key={b.takeHead ?? i}>
                    <line x1={x + 1} y1={b.top} x2={x + BOX_W - 1} y2={b.top} stroke={V3_GOLD} strokeOpacity={0.3} strokeWidth={0.8} />
                    <text x={x + 12} y={b.top + 15} fill={V3_GOLD} fontSize={10.5} fontWeight={600}>{fit(b.name || `Split ${i + 1}`, 28)}</text>
                  </g>
                ))}
              </>
            ) : (
              <text x={x + 18} y={y + BRANCH_H / 2 + 4.5} fill={n.takeMissing ? FLAG : V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(n.name, 26)}</text>
            )}
          </g>
        );
      })}

      {/* THE GHOST — the node in hand, on top of everything. */}
      {ghost && drag && (
        <g pointerEvents="none" opacity={0.85} transform={`translate(${drag.x - drag.dx}, ${drag.y - drag.dy})`}>
          <rect x={0} y={0} width={BOX_W} height={BRANCH_H} rx={9} fill="#0B0F1E" stroke={LANE_STROKE[ghost.lane]} strokeWidth={1.4} />
          <rect x={0} y={0} width={BOX_W} height={BRANCH_H} rx={9} fill={`${LANE_STROKE[ghost.lane]}22`} />
          {ghost.order > 0 && (
            <>
              <rect x={-9} y={(BRANCH_H - 18) / 2} width={22} height={18} rx={9} fill="#0B0F1E" stroke={LANE_STROKE[ghost.lane]} strokeWidth={1} />
              <text x={2} y={BRANCH_H / 2 + 3.5} fill={V3_CREAM} fontSize={9.5} fontWeight={800} textAnchor="middle">{ghost.order}</text>
            </>
          )}
          <text x={18} y={BRANCH_H / 2 + 4.5} fill={V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(ghost.name, 26)}</text>
        </g>
      )}
    </svg>
  );
}

export function LaneMapHeadings({ w = 960 }: { w?: number }) {
  const cell: React.CSSProperties = { flex: 1, fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center" };
  return (
    <div style={{ display: "flex", maxWidth: w, marginBottom: 6 }}>
      <div style={{ ...cell, color: LANE_STROKE.pitch }}>Pitches</div>
      <div style={{ ...cell, color: V3_GOLD }}>The cram path</div>
      <div style={{ ...cell, color: LANE_STROKE.offshoot }}>Offshoots · take it to an A</div>
    </div>
  );
}

export function laneColor(set: { lane?: unknown }): string { return LANE_STROKE[laneOf(set)]; }
