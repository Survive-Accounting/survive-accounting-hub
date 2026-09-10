// THE MAP, drawn. Pure SVG — no ReactFlow, no store, no network.
//
// Lee, 2026-09-09: "you have a path in the middle and you have offshoots… to the right of the
// path" and pitch videos on the left. 2026-09-10: "connect them to the right splits, and this way
// I'll know what order of production I'm making the videos today."
//
// So a cram node shows its splits as pills, an offshoot says which split it hangs off, and every
// node carries its production number. Every number is looked up by id at render (stage, question
// count, runtime), so this component holds no state and can never disagree with the queue. The
// layout is lane-map.ts's; this file only turns it into shapes.
import { laneOf, type DeckLane } from "@/lib/deck-lane";
import type { LaneLayout, LaneNode, LaneTake } from "./lane-map";
import { rowDepth } from "./lane-map";
import type { StageInfo } from "./set-stage";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

const BOX_W = 214;
const BOX_H = 46;
/** A cram set with splits grows a third line of pills. */
const CRAM_TAKES_H = 18;
const ROW_H = 72;
/** How far a stacked child drops below its parent's row. */
const SUB_H = 54;
const PAD_Y = 18;

const LANE_STROKE: Record<DeckLane, string> = { cram: V3_GOLD, offshoot: "#7DD3FC", pitch: "#C4B5FD" };
const FLAG = "#FF9F43";

function fit(name: string, chars = 26): string {
  const n = name.trim();
  return n.length <= chars ? n : `${n.slice(0, chars - 1).trimEnd()}…`;
}
function nodeX(col: 0 | 1 | 2, colW: number): number { return col * colW + (colW - BOX_W) / 2; }

/** ROWS GROW TO FIT THEIR STACKS. The first draft placed row r at PAD_Y + r·ROW_H regardless of
 *  how many offshoots hung off it, so six offshoots on Account classification ran straight down
 *  over the two rows beneath (seen on the first live render, 2026-09-10). Each row's top is now the
 *  previous row's top plus whatever that row actually needed: its own box, or its tallest side's
 *  stack, whichever is taller. Pure geometry; the layout engine's `depth` already knew the answer. */
function rowTops(layout: LaneLayout, cramH: (id: string) => number): number[] {
  const tops: number[] = [];
  let y = PAD_Y;
  for (let r = 0; r < layout.rows; r++) {
    tops.push(y);
    const cramId = layout.nodes.find((n) => n.lane === "cram" && n.row === r)?.id;
    const own = cramId ? cramH(cramId) : BOX_H;
    const stack = Math.max(0, rowDepth(layout, r) - 1) * SUB_H + BOX_H;
    y += Math.max(ROW_H, Math.max(own, stack) + (ROW_H - BOX_H));
  }
  tops.push(y); // one past the last row: where the orphan rule / the bottom begins
  return tops;
}
function nodeYAt(tops: readonly number[], n: LaneNode): number { return (tops[n.row] ?? PAD_Y) + n.sub * SUB_H; }

function branchPath(tops: readonly number[], parent: LaneNode, child: LaneNode, colW: number, parentH: number): string {
  const left = child.col === 0;
  const px = nodeX(parent.col, colW) + (left ? 0 : BOX_W);
  const py = nodeYAt(tops, parent) + parentH / 2;
  const cx = nodeX(child.col, colW) + (left ? BOX_W : 0);
  const cy = nodeYAt(tops, child) + BOX_H / 2;
  const mid = (px + cx) / 2;
  return `M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`;
}

export function LaneMap({ layout, stage, count, runtime, takesOf, selected, onSelect, w = 960 }: {
  layout: LaneLayout;
  stage: (setId: string) => StageInfo | null;
  count: (setId: string) => number | null;
  runtime?: (setId: string) => string | null;
  /** A cram set's splits, from its saved plan — drawn as pills inside its box. */
  takesOf: (setId: string) => readonly LaneTake[];
  selected: string | null;
  onSelect: (setId: string) => void;
  w?: number;
}) {
  const colW = w / 3;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const cramH = (id: string) => BOX_H + (takesOf(id).length > 1 ? CRAM_TAKES_H : 0);
  const tops = rowTops(layout, cramH);
  const nodeY = (n: LaneNode) => nodeYAt(tops, n);
  const spineBottom = tops[layout.rows] ?? PAD_Y;
  const orphanTop = spineBottom + (layout.orphans ? 26 : 0);
  const h = Math.max(PAD_Y * 2 + 40, orphanTop + layout.orphans * ROW_H + PAD_Y);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
      aria-label={`Cram path: ${layout.rows} sets, ${layout.nodes.length - layout.rows} hanging off them`}
      style={{ display: "block", maxWidth: w, fontFamily: "'Rubik', system-ui, sans-serif" }}
    >
      {layout.rows > 1 && (
        <line x1={w / 2} y1={tops[0] + BOX_H / 2} x2={w / 2} y2={tops[layout.rows - 1] + BOX_H / 2} stroke={V3_GOLD} strokeOpacity={0.28} strokeWidth={2} />
      )}

      {layout.edges.map((e, i) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to || to.orphan) return null;
        if (e.kind === "split") {
          const x = w / 2 - BOX_W / 2 - 10;
          return (
            <path key={`s${i}`} fill="none" stroke={V3_MUTED} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 4"
              d={`M ${x} ${nodeY(from) + BOX_H / 2} C ${x - 16} ${nodeY(from) + BOX_H / 2}, ${x - 16} ${nodeY(to) + BOX_H / 2}, ${x} ${nodeY(to) + BOX_H / 2}`} />
          );
        }
        return <path key={`b${i}`} d={branchPath(tops, from, to, colW, cramH(from.id))} fill="none" stroke={to.takeMissing ? FLAG : LANE_STROKE[to.lane]} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray={to.takeMissing ? "4 3" : undefined} />;
      })}

      {layout.orphans > 0 && (
        <>
          <line x1={12} y1={orphanTop - 14} x2={w - 12} y2={orphanTop - 14} stroke={V3_EDGE} strokeDasharray="4 5" />
          <text x={12} y={orphanTop - 20} fill={V3_MUTED} fontSize={10} letterSpacing={1.4}>HANGING OFF NOTHING — GIVE THESE A CRAM SET</text>
        </>
      )}

      {layout.nodes.map((n) => {
        const info = stage(n.id);
        const q = count(n.id);
        const rt = runtime?.(n.id) ?? null;
        const x = n.orphan ? nodeX(1, colW) : nodeX(n.col, colW);
        const y = n.orphan ? orphanTop + (n.row - layout.rows) * ROW_H : nodeY(n);
        const on = selected === n.id;
        const stroke = on ? V3_GOLD : (info?.color ?? LANE_STROKE[n.lane]);
        const takes = n.lane === "cram" ? takesOf(n.id) : [];
        const boxH = n.lane === "cram" ? cramH(n.id) : BOX_H;
        const sub = [info?.label ?? null, q === 0 ? "short" : q != null ? `${q} q` : null, rt].filter(Boolean).join(" · ");
        // The second line of a branch says WHICH split it hangs off — the thing Lee arranges by.
        const where = n.lane === "cram" ? sub : n.takeMissing ? "off a split the plan lost" : n.take ? `off ${n.take.name || `Split ${n.take.index + 1}`}${sub ? ` · ${sub}` : ""}` : sub;
        return (
          <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
            <title>{`${n.order ? `#${n.order} ` : ""}${n.name} — ${n.lane}${where ? ` · ${where}` : ""}`}</title>
            <rect x={x} y={y} width={BOX_W} height={boxH} rx={9}
              fill={`${stroke}${n.lane === "cram" ? "22" : "18"}`} stroke={n.takeMissing ? FLAG : stroke} strokeWidth={on ? 1.8 : 1}
              strokeDasharray={n.orphan ? "5 4" : undefined} />
            {/* THE PRODUCTION NUMBER — what he films next. */}
            {n.order > 0 && (
              <>
                <rect x={x - 9} y={y + 12} width={22} height={18} rx={9} fill="#0B0F1E" stroke={stroke} strokeWidth={1} />
                <text x={x + 2} y={y + 25} fill={V3_CREAM} fontSize={9.5} fontWeight={800} textAnchor="middle">{n.order}</text>
              </>
            )}
            <text x={x + 18} y={y + 18} fill={V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(n.name, 24)}</text>
            <text x={x + 18} y={y + 33} fill={n.takeMissing ? FLAG : V3_MUTED} fontSize={10.5}>{fit(where, 30)}</text>
            {/* THE SPLITS, as pills — the targets an offshoot attaches to. */}
            {takes.length > 1 && (
              <g>
                {takes.slice(0, 5).map((t, i) => {
                  const label = fit(t.name || `S${i + 1}`, 9);
                  const pw = Math.min(58, 12 + label.length * 5.4);
                  const px = x + 18 + takes.slice(0, i).reduce((acc, tt, k) => acc + Math.min(58, 12 + fit(tt.name || `S${k + 1}`, 9).length * 5.4) + 4, 0);
                  if (px + pw > x + BOX_W - 6) return null;
                  return (
                    <g key={t.headId}>
                      <rect x={px} y={y + BOX_H - 4} width={pw} height={13} rx={4} fill="none" stroke={V3_GOLD} strokeOpacity={0.5} strokeWidth={0.8} />
                      <text x={px + pw / 2} y={y + BOX_H + 5.5} fill={V3_GOLD} fontSize={8} textAnchor="middle" letterSpacing={0.3}>{label}</text>
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
