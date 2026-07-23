// CONNECTION DOTS (V2) — the one way cards and lessons grow arrows. Four dots
// (top/bottom/left/right) fade in when you hover a node or while a connection
// drag is in progress; drag from a dot → live smoothstep line → drop on
// another node's dot (React Flow lights up valid targets). ConnectionMode is
// LOOSE, so every dot both starts and receives. Replaces the old Ctrl+click
// arrow gesture entirely.
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

const SPOTS = [
  ["t", Position.Top],
  ["b", Position.Bottom],
  ["l", Position.Left],
  ["r", Position.Right],
] as const;

// memo (hardening run): output depends ONLY on `color` (stable per card), but
// it's rendered inside every card and re-runs on every card re-render. Shallow
// prop compare skips the 4-Handle re-render — pure, zero behavior change.
export const ConnectionDots = memo(function ConnectionDots({ color = "#4FA3E3" }: { color?: string }) {
  return (
    <>
      {SPOTS.map(([hid, pos]) => (
        <Handle
          key={hid}
          id={hid}
          type="source"
          position={pos}
          className="conn-dot"
          style={{ width: 9, height: 9, background: "#101B31", border: `2px solid ${color}`, borderRadius: 999 }}
        />
      ))}
    </>
  );
});

/** Injected once by the canvas route: dots are invisible until useful. */
export const CONNECTION_DOTS_CSS = `
.conn-dot { opacity: 0; transition: opacity 120ms ease; z-index: 30; }
.react-flow__node:hover .conn-dot,
.sa-connecting .conn-dot { opacity: 1; }
.conn-dot.connectingto, .conn-dot.valid { opacity: 1; transform: scale(1.35); }
.film-mode .conn-dot { opacity: 0 !important; pointer-events: none; }
`;
