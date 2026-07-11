// Backstage rail — the filming flow. Staged cards are invisible on canvas and queue here
// in show order. Click an entry (or hit spacebar with nothing left to reveal) to SUMMON:
// the card fades/scales in at its pre-placed canvas position, selected, and leaves the rail.
// Drag entries to reorder the show. "Stage all" preps a whole scene in one click.
import { useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ChevronsLeft, ChevronsRight, Clapperboard, GripVertical } from "lucide-react";

import { bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { NEON } from "./theme";
import { nextStageOrder } from "./BaseCard";
import { CARD_KIND_LABEL } from "./templates";
import type { CardBase, CardData } from "./types";

const KIND_DOT: Record<string, string> = {
  je: NEON.pink,
  schedule: NEON.yellow,
  computation: NEON.yellow,
  taccount: NEON.cyan,
  ceq: NEON.pink,
  memorize: NEON.cyan,
  note: NEON.pinkSoft,
  video: NEON.pinkSoft,
  list: NEON.green,
};

/** Staged nodes in show order (stageOrder asc, stable fallback by id). */
export function stagedInOrder(nodes: { id: string; type?: string; data: Record<string, unknown> }[]) {
  return nodes
    .filter((n) => n.type !== "zone" && (n.data as unknown as CardBase).staged)
    .sort((a, b) => ((a.data as unknown as CardBase).stageOrder ?? 0) - ((b.data as unknown as CardBase).stageOrder ?? 0) || a.id.localeCompare(b.id));
}

export function BackstageRail({ onSummon }: { onSummon: (id: string) => void }) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const staged = stagedInOrder(nodes as never);

  const stageAll = () => {
    const nds = rf.getNodes();
    let next = nextStageOrder(nds);
    const c = compositeCmd(
      nds
        .filter((n) => n.type !== "zone" && !(n.data as unknown as CardBase).staged && !(n.data as unknown as CardBase).minimized)
        .map((n) => patchDataCmd(rf as unknown as RfLike, n.id, { staged: true, stageOrder: next++ }, "stage")),
      "stage all",
    );
    if (c) bus.dispatch(c);
  };

  /** Drop dragId in front of targetId (or at the end when targetId is null). */
  const reorder = (targetId: string | null) => {
    if (!dragId || dragId === targetId) return;
    const ids = staged.map((s) => s.id).filter((x) => x !== dragId);
    const at = targetId ? ids.indexOf(targetId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    const c = compositeCmd(
      ids.map((nid, idx) => patchDataCmd(rf as unknown as RfLike, nid, { stageOrder: idx }, "reorder")),
      "reorder show",
    );
    if (c) bus.dispatch(c);
    setDragId(null);
  };

  if (staged.length === 0 && collapsed) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title={`Backstage (${staged.length})`}
        className="absolute right-3 top-3 z-40 grid h-9 w-9 place-items-center rounded-lg"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.green }}
      >
        <Clapperboard className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside
      className="absolute right-3 top-3 z-40 flex max-h-[65vh] w-52 flex-col rounded-xl"
      style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => reorder(null)}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <Clapperboard className="h-3.5 w-3.5" style={{ color: NEON.green }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.green }}>
          Backstage <span style={{ color: NEON.muted }}>({staged.length})</span>
        </span>
        <button
          onClick={stageAll}
          title="Stage every card on the canvas"
          className="ml-auto rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase"
          style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
        >
          stage all
        </button>
        <button onClick={() => setCollapsed(true)} title="Collapse" style={{ color: NEON.muted }}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
        {staged.length === 0 && (
          <p className="px-1 py-2 text-[10.5px] italic leading-relaxed" style={{ color: NEON.muted }}>
            Empty. Stage cards with the <Clapperboard className="inline h-2.5 w-2.5" /> button or “s” —
            then spacebar summons them in order.
          </p>
        )}
        {staged.map((n, i) => {
          const d = n.data as unknown as CardData;
          return (
            <div
              key={n.id}
              draggable
              onDragStart={() => setDragId(n.id)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.stopPropagation(); reorder(n.id); }}
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors"
              style={{ border: `1px solid ${dragId === n.id ? NEON.green : NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}
              onClick={() => onSummon(n.id)}
              title="Summon to the canvas"
            >
              <GripVertical className="h-3 w-3 shrink-0 cursor-grab" style={{ color: NEON.muted }} />
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8.5px] font-bold" style={{ border: `1px solid ${NEON.green}`, color: NEON.green }}>
                {i + 1}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_DOT[d.kind] ?? NEON.pink }} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                {d.title || CARD_KIND_LABEL[d.kind] || d.kind}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
