// MEMO LIGHTBULB (M3) — the ONE gesture that attaches a memo to anything: a
// formula/equation COMPONENT, a list ITEM, or a whole CARD. Clicking it spawns a
// first-class MemoCard node beside the target and draws a pointer arrow (an
// ordinary RF edge) to a handle on the target. Because both are real nodes/edges,
// the memo drags freely (the arrow follows), edits in place, persists, and is
// collectable into a memo deck — all reused, nothing bespoke.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from "@xyflow/react";

import { bus, type RfLike } from "./commands";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { cardId } from "./types";

/** A stable target-handle id for a sub-element (segment/row). Whole-card memos
 *  reuse the card's own "l"/"r" ConnectionDots instead. */
export const memoAnchorId = (subId: string) => `anc:${subId}`;

/** The invisible target Handle a sub-element exposes so a memo arrow can anchor
 *  to THAT component (not just the card). Drop inside the segment/row element.
 *  Element-EDGE anchor — the fallback when a target has no measurable text. */
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

/** TEXT anchor (redesign Item 1) — wraps a target's TEXT run and drops the memo
 *  anchor handle ~7px past the END of the rendered text (not the padded container
 *  edge), so a memo arrow lands right at the glyphs. Measures the real text box
 *  (offset geometry, no per-frame tick) and re-resolves via updateNodeInternals when
 *  the text reflows (edit / resize) — a ResizeObserver on the run; node move/scale
 *  are handled by React Flow's own node observer. Empty text → element-edge fallback.
 *
 *  The handle stays Position.Right (the common right-approach case — Lee's repro).
 *  A wrapped/multi-line run reports its block box, so the anchor lands at the block's
 *  right edge + vertical centre. */
export function TextAnchor({ subId, nodeId, children, strike }: { subId: string; nodeId: string; children: ReactNode; strike?: boolean }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const ref = useRef<HTMLSpanElement>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (!el.offsetParent || el.offsetWidth === 0) { setEnd((p) => (p === null ? p : null)); return; }
      const x = el.offsetLeft + el.offsetWidth;
      const y = el.offsetTop + el.offsetHeight / 2;
      setEnd((p) => (p && p.x === x && p.y === y ? p : { x, y }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  // when the handle's position changes, tell RF to re-read this node's handles so the
  // edge re-routes to the new text-end anchor.
  useEffect(() => { updateNodeInternals(nodeId); }, [end, nodeId, updateNodeInternals]);
  return (
    <>
      {/* inline-block so a single-line run shrinks to the glyphs (anchor lands at the
          last glyph); wraps within the row at 100% for long text. NOTE: inline-block
          BREAKS text-decoration inheritance from the parent, so a wrong-answer
          strike (Lee) must be applied HERE, not on an ancestor. */}
      <span ref={ref} style={{ display: "inline-block", maxWidth: "100%", verticalAlign: "middle", textDecoration: strike ? "line-through" : undefined, textDecorationThickness: strike ? "0.12em" : undefined }}>{children}</span>
      <Handle
        type="target"
        position={Position.Right}
        id={memoAnchorId(subId)}
        isConnectable={false}
        style={end
          ? { left: end.x + 7, right: "auto", top: end.y, transform: "translate(-50%, -50%)", width: 6, height: 6, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" }
          : { right: -2, width: 6, height: 6, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" }}
      />
    </>
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
      className={`sa-chrome nodrag grid place-items-center rounded ${className ?? ""}`}
      title={title}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); attachMemo(rf, targetId, handleId); }}
    >
      <Lightbulb className="h-3 w-3" />
    </button>
  );
}
