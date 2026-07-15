// MEMO LIGHTBULB (M3) — the ONE gesture that attaches a memo to anything: a
// formula/equation COMPONENT, a list ITEM, or a whole CARD. Clicking it spawns a
// first-class MemoCard node beside the target and draws a pointer arrow (an
// ordinary RF edge) to a handle on the target. Because both are real nodes/edges,
// the memo drags freely (the arrow follows), edits in place, persists, and is
// collectable into a memo deck — all reused, nothing bespoke.
import { Lightbulb } from "lucide-react";
import { Handle, Position, useReactFlow } from "@xyflow/react";

import { bus, type RfLike } from "./commands";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { cardId } from "./types";

/** A stable target-handle id for a sub-element (segment/row). Whole-card memos
 *  reuse the card's own "l"/"r" ConnectionDots instead. */
export const memoAnchorId = (subId: string) => `anc:${subId}`;

/** The invisible target Handle a sub-element exposes so a memo arrow can anchor
 *  to THAT component (not just the card). Drop inside the segment/row element. */
export function MemoAnchor({ subId }: { subId: string }) {
  return (
    <Handle
      type="target"
      position={Position.Right}
      id={memoAnchorId(subId)}
      isConnectable={false}
      style={{ right: -2, width: 6, height: 6, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" }}
    />
  );
}

/** Attach a memo to `targetId` at `handleId` — spawns the MemoCard + arrow as ONE
 *  undoable command, staggering below any memos already pointing at the card. */
export function attachMemo(rf: ReturnType<typeof useReactFlow>, targetId: string, handleId: string, opts?: { kind?: string }) {
  const t = rf.getNode(targetId);
  if (!t) return;
  const w = (t.width ?? (t.data as { w?: number } | undefined)?.w ?? 240) as number;
  const already = rf.getEdges().filter((e) => e.target === targetId && String(e.id).startsWith("mre-")).length;
  const at = { x: t.position.x + w + 56, y: t.position.y + already * 74 };
  const memoId = cardId("memo");
  const edgeId = `mre-${cardId("e")}`;
  const memoNode = {
    id: memoId,
    type: "memo",
    parentId: t.parentId,
    position: at,
    selected: true,
    data: { kind: "memo", memoKind: opts?.kind ?? "note", body: "", w: 190 },
  } as never;
  const edge = {
    id: edgeId,
    source: memoId,
    sourceHandle: "l",
    target: targetId,
    targetHandle: handleId,
    type: "smoothstep",
    zIndex: EDGE_Z,
    style: { ...EDGE_STYLE },
    markerEnd: { ...EDGE_MARKER },
  } as never;
  const rfl = rf as unknown as RfLike;
  bus.dispatch({
    label: "attach memo",
    do: () => {
      rfl.setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), memoNode]);
      rfl.setEdges((eds) => [...eds, edge]);
    },
    undo: () => {
      rfl.setNodes((nds) => nds.filter((n) => n.id !== memoId));
      rfl.setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
  });
}

/** The hover-revealed lightbulb affordance. Place on a segment, a row, or a card. */
export function MemoLightbulb({ targetId, handleId, title = "Attach a memo", className, style }: {
  targetId: string;
  /** The handle id on the target to anchor to ("r" for a whole card, memoAnchorId(subId) for a component/item). */
  handleId: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rf = useReactFlow();
  return (
    <button
      className={`nodrag grid place-items-center rounded ${className ?? ""}`}
      title={title}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); attachMemo(rf, targetId, handleId); }}
    >
      <Lightbulb className="h-3 w-3" />
    </button>
  );
}
