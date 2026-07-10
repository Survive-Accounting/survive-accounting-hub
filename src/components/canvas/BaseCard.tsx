// Shared card shell — the card contract. Header (title + edit/duplicate/minimize/delete),
// resize, click-to-front z-order, neon frame. Every card type renders its body inside this.
import { Handle, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { Clapperboard, Pencil, Copy, Minus, X } from "lucide-react";
import { NEON } from "./theme";
import { cardId, type CardBase } from "./types";

/** Next stageOrder = one past the current max (append to the end of the show). */
export function nextStageOrder(nodes: { data: Record<string, unknown> }[]): number {
  let max = -1;
  for (const n of nodes) {
    const so = (n.data as unknown as CardBase).stageOrder;
    if (typeof so === "number" && so > max) max = so;
  }
  return max + 1;
}

let Z = 10;

export function useCardActions(id: string) {
  const rf = useReactFlow();
  return {
    update: (patch: Record<string, unknown>) => rf.updateNodeData(id, patch),
    /** Derive the patch from the LATEST node data — required for list mutations (lines,
     *  cells, steps): building from the render closure loses concurrent commits. */
    updateFn: (fn: (data: Record<string, unknown>) => Record<string, unknown>) =>
      rf.updateNodeData(id, (node) => fn(node.data as Record<string, unknown>)),
    remove: () => rf.setNodes((nds) => nds.filter((n) => n.id !== id)),
    toFront: () => rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, zIndex: ++Z } : n))),
    /** Backstage: hide from canvas, append to the rail (order = end of the show). */
    stage: () => rf.updateNodeData(id, { staged: true, stageOrder: nextStageOrder(rf.getNodes()) }),
    duplicate: () => {
      const node = rf.getNode(id);
      if (!node) return;
      const nid = cardId((node.data as unknown as CardBase).kind);
      rf.setNodes((nds) => [
        ...nds,
        { ...node, id: nid, selected: false, position: { x: node.position.x + 36, y: node.position.y + 36 }, zIndex: ++Z, data: structuredClone(node.data) },
      ]);
    },
  };
}

export function BaseCard({
  id,
  data,
  accent = NEON.pink,
  selected,
  headerRight,
  children,
}: {
  id: string;
  data: CardBase;
  accent?: string;
  selected?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { update, remove, toFront, duplicate, stage } = useCardActions(id);
  const title = data.title ?? "";
  // Ctrl/Cmd+click arrow flow: first click marks this card as the pending source.
  const arrowPending = !!(data as unknown as Record<string, unknown>)._arrowPending;

  if (data.minimized) {
    return (
      <div
        onClick={() => { toFront(); update({ minimized: false }); }}
        className="nodrag cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold"
        style={{ background: NEON.panelSolid, color: accent, border: `1px solid ${accent}`, boxShadow: NEON.glow }}
        title="Restore card"
      >
        ▸ {title || (data as { kind: string }).kind}
      </div>
    );
  }

  return (
    <div
      onPointerDownCapture={toFront}
      className="animate-in fade-in zoom-in-95 flex flex-col rounded-xl backdrop-blur-sm duration-150"
      style={{
        width: data.w ?? undefined,
        height: data.h ?? undefined,
        minWidth: 220,
        background: NEON.panel,
        border: `1px solid ${arrowPending ? NEON.cyan : selected ? accent : NEON.borderSoft}`,
        boxShadow: arrowPending
          ? `0 0 0 2px ${NEON.cyan}, 0 0 30px -4px ${NEON.cyan}`
          : selected
            ? `0 0 0 1px ${accent}, 0 0 26px -6px ${accent}`
            : "0 8px 30px -12px rgba(0,0,0,0.8)",
        color: NEON.text,
      }}
    >
      {/* invisible anchors for card-to-card arrows (edges are created programmatically) */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
      <NodeResizer
        isVisible={!!selected}
        minWidth={220}
        minHeight={90}
        lineStyle={{ borderColor: accent }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: accent, border: "none" }}
        onResize={(_, p) => update({ w: Math.round(p.width), h: Math.round(p.height) })}
      />
      {/* Header (drag handle for the whole card) */}
      <div
        className="flex items-center gap-1 rounded-t-xl px-2 py-1"
        style={{ borderBottom: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <input
          className="nodrag min-w-0 flex-1 bg-transparent text-[11px] font-semibold uppercase tracking-wide outline-none"
          style={{ color: NEON.muted }}
          value={title}
          placeholder={(data as { kind: string }).kind}
          onChange={(e) => update({ title: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div className="card-actions flex items-center gap-0.5">
          {headerRight}
          <IconBtn title="Send backstage (s)" onClick={stage}>
            <Clapperboard className="h-3 w-3" />
          </IconBtn>
          <IconBtn title="Edit card" active={data.editMode} onClick={() => update({ editMode: !data.editMode })}><Pencil className="h-3 w-3" /></IconBtn>
          <IconBtn title="Duplicate" onClick={duplicate}><Copy className="h-3 w-3" /></IconBtn>
          <IconBtn title="Minimize" onClick={() => update({ minimized: true })}><Minus className="h-3 w-3" /></IconBtn>
          <IconBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></IconBtn>
        </div>
      </div>
      <div className="nowheel min-h-0 flex-1 overflow-auto p-2.5">{children}</div>
    </div>
  );
}

export function IconBtn({ children, onClick, title, active, danger }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag grid h-5 w-5 place-items-center rounded transition-colors"
      style={{ color: active ? NEON.pink : NEON.muted, background: active ? "rgba(255,45,149,0.14)" : "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? NEON.red : NEON.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = active ? NEON.pink : NEON.muted)}
    >
      {children}
    </button>
  );
}
