// ArrowEdge (PROMPT A) — the one edge renderer, registered under the type name
// "smoothstep" so every existing scene's edges upgrade without migration.
//
//  - real directional arrowhead (markerEnd rides in from the edge object)
//  - selected → a small × floats at the midpoint (delete via bus = undoable);
//    Delete/Backspace still works through RF's native path + onDelete recording
//  - click → one-shot PULSE along the length (route toggles data._pulse)
//  - DRAG PERF: while either endpoint node is mid-drag the route stamps
//    data._drag — we render a plain straight path (no smoothstep corner
//    math per frame) and restore the smoothstep on drop.
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, getStraightPath, useReactFlow, type EdgeProps } from "@xyflow/react";

import { removeEdgeCmd } from "./arrows";
import { bus, type RfLike } from "./commands";

export function ArrowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, style, markerEnd, data } = props;
  const rf = useReactFlow();
  const dragging = !!data?._drag;
  const [path, labelX, labelY] = dragging
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        className={data?._pulse ? "sa-edge-pulse" : undefined}
        interactionWidth={16}
      />
      {selected && !dragging && (
        <EdgeLabelRenderer>
          <button
            className="nodrag nopan grid h-5 w-5 place-items-center rounded-full text-[11px] font-black leading-none"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              color: "#FF5C6C",
              background: "#101B31",
              border: "1px solid rgba(255,92,122,0.6)",
              boxShadow: "0 4px 12px -4px rgba(0,0,0,0.6)",
            }}
            title="Delete arrow"
            onClick={(e) => {
              e.stopPropagation();
              const cmd = removeEdgeCmd(rf as unknown as RfLike, id);
              if (cmd) bus.dispatch(cmd);
            }}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Injected once by the canvas route. The pulse: a dash train sweeping the
 *  path once — reads as energy travelling source → target. LINE dots show on
 *  their own block's hover (not whole-node hover — per-line precision), plus
 *  whenever a connection drag is looking for targets. */
export const ARROW_EDGE_CSS = `
@keyframes sa-edge-dash { from { stroke-dashoffset: 120; } to { stroke-dashoffset: 0; } }
.sa-edge-pulse { stroke-dasharray: 14 10; animation: sa-edge-dash 700ms linear 1; }
/* SELECTED EDGE (#6): a SLOW, LOOPING dash march (source → target) that
   persists while selected — silver, matching the block-selection language —
   and returns to a static solid line on deselect. */
@keyframes sa-edge-march { to { stroke-dashoffset: -34; } }
.react-flow__edge.selected .react-flow__edge-path {
  stroke-width: 3px;
  stroke-dasharray: 10 7;
  animation: sa-edge-march 1.6s linear infinite;
  filter: drop-shadow(0 0 4px rgba(174,185,201,0.75));
}
.react-flow__node:hover .line-dot { opacity: 0; }
.je-row:hover .line-dot, .sa-connecting .line-dot { opacity: 1 !important; }
.line-dot.connectingto, .line-dot.valid { opacity: 1 !important; transform: scale(1.35); }
/* Ctrl held (multi-select): container boxes go transparent to the pointer so
   a Ctrl+drag STARTED INSIDE a lesson/region draws the marquee on the pane
   instead of dragging the box. Cards stay interactive (Ctrl+click toggles). */
body.sa-ctrl .react-flow__node-zone, body.sa-ctrl .react-flow__node-lesson { pointer-events: none !important; }
`;
