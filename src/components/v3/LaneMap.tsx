// THE MAP, drawn. Pure SVG — no ReactFlow, no store, no network.
//
// Lee, 2026-09-09: "I can just picture the UI being really cool for this… you have a path in the
// middle and you have offshoots… to the right of the path" and pitch videos on the left. "It'll
// be great for a tutor in the future… creating that optionality for students is really what's
// going to make the platform scale."
//
// Every number a node shows is looked up by id at render (stage, question count, runtime), so
// this component holds no state and can never disagree with the queue. The layout is
// lane-map.ts's; this file only turns it into shapes.
import { laneOf, type DeckLane } from "@/lib/deck-lane";
import type { LaneLayout, LaneNode } from "./lane-map";
import { rowDepth } from "./lane-map";
import type { StageInfo } from "./set-stage";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

const BOX_W = 208;
const BOX_H = 44;
const ROW_H = 66;
/** How far a stacked child drops below its parent's row. */
const SUB_H = 52;
const PAD_Y = 18;

const LANE_STROKE: Record<DeckLane, string> = { cram: V3_GOLD, offshoot: "#7DD3FC", pitch: "#C4B5FD" };

/** Cut a name to what the box can hold — the full name is in the node's <title>. */
function fit(name: string, chars = 26): string {
  const n = name.trim();
  return n.length <= chars ? n : `${n.slice(0, chars - 1).trimEnd()}…`;
}

function nodeX(col: 0 | 1 | 2, colW: number): number {
  return col * colW + (colW - BOX_W) / 2;
}

function nodeY(n: LaneNode): number {
  return PAD_Y + n.row * ROW_H + n.sub * SUB_H;
}

/** A cubic from the cram box's side to the child's near side — flat at both ends so it reads as
 *  "hangs off" rather than "flows into". */
function branchPath(parent: LaneNode, child: LaneNode, colW: number): string {
  const left = child.col === 0;
  const px = nodeX(parent.col, colW) + (left ? 0 : BOX_W);
  const py = nodeY(parent) + BOX_H / 2;
  const cx = nodeX(child.col, colW) + (left ? BOX_W : 0);
  const cy = nodeY(child) + BOX_H / 2;
  const mid = (px + cx) / 2;
  return `M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`;
}

export function LaneMap({ layout, stage, count, runtime, selected, onSelect, w = 960 }: {
  layout: LaneLayout;
  /** The queue's own chip for this set, so the map and the queue tell one story. */
  stage: (setId: string) => StageInfo | null;
  /** Live questions in the set — "short" when zero, the way /v3 says it. */
  count: (setId: string) => number | null;
  /** "0:48–1:48", or null when the set has no saved plan yet. */
  runtime?: (setId: string) => string | null;
  selected: string | null;
  onSelect: (setId: string) => void;
  w?: number;
}) {
  const colW = w / 3;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const spineBottom = PAD_Y + layout.rows * ROW_H;
  // The tallest stack on the last row still has to fit, and the orphans sit under a rule below it.
  const lastDepth = layout.rows > 0 ? rowDepth(layout, layout.rows - 1) : 0;
  const orphanTop = spineBottom + Math.max(0, lastDepth - 1) * SUB_H + (layout.orphans ? 26 : 0);
  const h = Math.max(
    PAD_Y * 2 + 40,
    orphanTop + layout.orphans * ROW_H + PAD_Y,
  );

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
      aria-label={`Cram path: ${layout.rows} sets, ${layout.nodes.length - layout.rows} hanging off them`}
      style={{ display: "block", maxWidth: w, fontFamily: "'Rubik', system-ui, sans-serif" }}
    >
      {/* THE SPINE — one quiet line down the middle so the path reads as a path. */}
      {layout.rows > 1 && (
        <line
          x1={w / 2} y1={PAD_Y + BOX_H / 2} x2={w / 2} y2={PAD_Y + (layout.rows - 1) * ROW_H + BOX_H / 2}
          stroke={V3_GOLD} strokeOpacity={0.28} strokeWidth={2}
        />
      )}

      {/* EDGES first, so a box always sits on top of its own line. */}
      {layout.edges.map((e, i) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to || to.orphan) return null;
        if (e.kind === "split") {
          // Provenance: this row was cut out of that one. Dashed, to the left of the spine, quiet.
          const x = w / 2 - BOX_W / 2 - 10;
          return (
            <path
              key={`s${i}`} fill="none" stroke={V3_MUTED} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 4"
              d={`M ${x} ${nodeY(from) + BOX_H / 2} C ${x - 16} ${nodeY(from) + BOX_H / 2}, ${x - 16} ${nodeY(to) + BOX_H / 2}, ${x} ${nodeY(to) + BOX_H / 2}`}
            />
          );
        }
        return (
          <path key={`b${i}`} d={branchPath(from, to, colW)} fill="none"
            stroke={LANE_STROKE[to.lane]} strokeOpacity={0.5} strokeWidth={1.5} />
        );
      })}

      {/* THE ORPHAN RULE — everything under it names a parent we could not find. */}
      {layout.orphans > 0 && (
        <>
          <line x1={12} y1={orphanTop - 14} x2={w - 12} y2={orphanTop - 14} stroke={V3_EDGE} strokeDasharray="4 5" />
          <text x={12} y={orphanTop - 20} fill={V3_MUTED} fontSize={10} letterSpacing={1.4}>
            HANGING OFF NOTHING — GIVE THESE A CRAM SET
          </text>
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
        const sub = [
          info?.label ?? null,
          q === 0 ? "short" : q != null ? `${q} q` : null,
          rt,
        ].filter(Boolean).join(" · ");
        return (
          <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
            <title>{`${n.name} — ${n.lane}${sub ? ` · ${sub}` : ""}`}</title>
            <rect
              x={x} y={y} width={BOX_W} height={BOX_H} rx={9}
              fill={`${stroke}${n.lane === "cram" ? "22" : "18"}`}
              stroke={stroke} strokeWidth={on ? 1.8 : 1}
              strokeDasharray={n.orphan ? "5 4" : undefined}
            />
            <text x={x + 11} y={y + 18} fill={V3_CREAM} fontSize={12.5} fontWeight={700}>{fit(n.name)}</text>
            <text x={x + 11} y={y + 33} fill={V3_MUTED} fontSize={10.5}>{fit(sub, 30)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The column headings, drawn once above a topic's map. Kept out of the SVG so they can be plain
 *  DOM text — easier to read at small sizes and selectable. */
export function LaneMapHeadings({ w = 960 }: { w?: number }) {
  const cell: React.CSSProperties = {
    flex: 1, fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center",
  };
  return (
    <div style={{ display: "flex", maxWidth: w, marginBottom: 6 }}>
      <div style={{ ...cell, color: LANE_STROKE.pitch }}>Pitches</div>
      <div style={{ ...cell, color: V3_GOLD }}>The cram path</div>
      <div style={{ ...cell, color: LANE_STROKE.offshoot }}>Offshoots · take it to an A</div>
    </div>
  );
}

/** The lane a set is on, as the map colours it — exported so a row elsewhere can match. */
export function laneColor(set: { lane?: unknown }): string {
  return LANE_STROKE[laneOf(set)];
}
