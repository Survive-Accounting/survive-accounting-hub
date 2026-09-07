// THE MAP'S BIRD'S-EYE — a pure SVG of the field: the field rectangle, each node as a labelled
// box tinted by kind, the edges as arrows, and the shots as numbered camera rectangles in gold
// (the active one solid). Lee, 2026-09-07: "see the entire cluster from birds eye view in the
// frame, but we can go swim around for it in the capture window". This is the Editor's view of
// what the assistant built — it is not the renderer (the phone stage draws the real thing) and
// it is the seed of the week-2 driver: `spec`, `shot`, `onShot?`, `w`, nothing else. The shot
// chips under it set which rectangle is solid; the owner holds that state.
//
// Pure: no store, no network, no side effects.
import { cameraRect, shotsOf, type ClusterNodeKind, type ClusterSpec } from "./cluster-spec";

/** The kind's tint in the schematic — the same family the Editor's chips use. */
export const MAP_KIND_COLOR: Record<ClusterNodeKind, string> = {
  equation: "#FCA311", accounts: "#7DD3FC", je: "#3BF5A0", taccount: "#C4B5FD", tb: "#F9A8D4", ceq: "#F4EFE6", callout: "#FF9F43", note: "#9AA3B8",
};
export const MAP_KIND_LABEL: Record<ClusterNodeKind, string> = {
  equation: "A = L + E", accounts: "list", je: "entry", taccount: "T", tb: "trial balance", ceq: "card", callout: "callout", note: "note",
};

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const EDGE = "rgba(244,239,230,0.16)";

/** How the field maps onto `w` CSS pixels: the scale, and the drawn height. Exported so a
 *  driver can turn a pointer position back into field coordinates the same way. */
export function schematicScale(field: { w: number; h: number }, w: number): { s: number; h: number } {
  const s = w / field.w;
  return { s, h: Math.round(field.h * s) };
}

export function MapSchematic({ spec, shot, onShot, w = 280 }: {
  spec: ClusterSpec;
  /** Which shot's camera is solid (index into shotsOf(spec)); null = none. */
  shot: number | null;
  onShot?: (i: number) => void;
  /** Drawn width in CSS pixels; the height follows the field's aspect. */
  w?: number;
}) {
  const { s, h } = schematicScale(spec.field, w);
  const shots = shotsOf(spec);
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const centre = (id: string) => { const n = byId.get(id); return n ? { x: (n.x + n.w / 2) * s, y: (n.y + n.h / 2) * s } : null; };
  const fontPx = Math.max(7, Math.min(11, w / 26));
  return (
    <div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Bird's-eye of the map: ${spec.nodes.length} nodes, ${shots.length} shots`} style={{ display: "block", borderRadius: 6, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}` }}>
        <defs>
          <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} />
          </marker>
        </defs>
        {/* the field */}
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill="none" stroke={EDGE} strokeDasharray="3 3" />
        {/* edges, under the boxes */}
        {spec.edges.map((e, i) => {
          const a = centre(e.from), b = centre(e.to);
          if (!a || !b) return null;
          return (
            <g key={`e${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MUTED} strokeWidth={1} strokeDasharray={e.kind === "link" ? "3 2" : undefined} markerEnd="url(#map-arrow)" opacity={0.8} />
              {e.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2} fontSize={fontPx - 1} fill={MUTED} textAnchor="middle">{e.label}</text>}
            </g>
          );
        })}
        {/* nodes */}
        {spec.nodes.map((n) => {
          const c = MAP_KIND_COLOR[n.data.kind];
          const bw = Math.max(2, n.w * s), bh = Math.max(2, n.h * s);
          return (
            <g key={n.id}>
              <rect x={n.x * s} y={n.y * s} width={bw} height={bh} rx={2} fill={`${c}22`} stroke={c} strokeWidth={1} />
              <text x={n.x * s + 3} y={n.y * s + fontPx + 2} fontSize={fontPx} fontWeight={700} fill={CREAM} style={{ pointerEvents: "none" }}>
                {(n.title ?? MAP_KIND_LABEL[n.data.kind]).slice(0, Math.max(3, Math.floor(bw / (fontPx * 0.6))))}
              </text>
              {bh > fontPx * 2.4 && <text x={n.x * s + 3} y={n.y * s + fontPx * 2 + 3} fontSize={fontPx - 1} fill={c} style={{ pointerEvents: "none" }}>{MAP_KIND_LABEL[n.data.kind]}</text>}
            </g>
          );
        })}
        {/* the cameras — gold at 30 %, the active one solid and on top */}
        {shots.map((sh, i) => {
          const r = cameraRect(sh.camera);
          const on = i === shot;
          return (
            <g key={sh.id} onClick={onShot ? () => onShot(i) : undefined} style={{ cursor: onShot ? "pointer" : "default" }}>
              <rect x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} fill={on ? `${GOLD}14` : "none"} stroke={GOLD} strokeWidth={on ? 1.5 : 1} opacity={on ? 1 : 0.3} />
              <text x={r.x * s + 3} y={r.y * s + r.h * s - 3} fontSize={fontPx} fontWeight={800} fill={GOLD} opacity={on ? 1 : 0.5}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
      {shots.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {shots.map((sh, i) => {
            const on = i === shot;
            return (
              <button key={sh.id} type="button" title={sh.note ? `${sh.label ?? `shot ${i + 1}`} — ${sh.note}` : sh.label ?? `shot ${i + 1}`} onClick={() => onShot?.(i)}
                style={{ border: `1px solid ${on ? GOLD : EDGE}`, background: on ? `${GOLD}22` : "transparent", color: on ? GOLD : CREAM, borderRadius: 7, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, cursor: onShot ? "pointer" : "default", fontVariantNumeric: "tabular-nums" }}>
                {i + 1}{sh.label ? ` · ${sh.label}` : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
