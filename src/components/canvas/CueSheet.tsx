// CUE SHEET panel (AC4, Phase 1) — the frame's whole space-walk sequence, read
// LIVE from the canvas: deck deals (deck order), each card's reveal steps, its
// memos, then the advance. A "next" chip mirrors what Space will do. Click a
// deal/reveal cue to EXECUTE the frame up to that point (authoring). Deck deal
// cues reorder with ↑/↓ (same stageOrder the deck uses). Nothing here persists
// beyond the card data it already writes through the command bus.
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Layers, ListOrdered, MousePointerClick, StickyNote, X } from "lucide-react";

import { bus, type RfLike } from "./commands";
import { currentRevealCount, deriveFrameCues, frameCardOrder, revealPatchForCount, type Cue } from "./cue-sheet";
import { frameWalkNext } from "./frames";
import { NEON } from "./theme";
import { isContainerType, type CardData } from "./types";

type AnyNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data: CardData & { deckMember?: boolean; tucked?: boolean; stageOrder?: number; title?: string; memoKind?: string; body?: string } };

const KIND_META: Record<Cue["kind"], { icon: typeof Layers; color: string; verb: string }> = {
  deal: { icon: Layers, color: NEON.cyan, verb: "Deal" },
  reveal: { icon: MousePointerClick, color: "#7EF3C0", verb: "Reveal" },
  memo: { icon: StickyNote, color: "#FCA311", verb: "Memo" },
  advance: { icon: ChevronDown, color: NEON.muted, verb: "Advance" },
};

export function CueSheet({ frameId, onClose }: { frameId: string; onClose: () => void }) {
  const rf = useReactFlow();
  const nodes = useNodes() as unknown as AnyNode[];
  const edges = useEdges() as unknown as { id: string; source: string; target: string }[];

  const children = nodes.filter((n) => n.parentId === frameId);
  const cards = children.filter((n) => !isContainerType(n.type) && n.data.kind !== "memo");
  const memos = children.filter((n) => n.data.kind === "memo");
  const hasNext = !!frameWalkNext(nodes as never, frameId);
  const cues = deriveFrameCues(cards as never, memos as never, edges, hasNext);

  // "you are here": each deal/reveal cue is DONE when the card is dealt / has
  // that many steps revealed. The NEXT cue is the first not-yet-done one.
  const byId = new Map(cards.map((c) => [c.id, c]));
  const cueDone = (c: Cue): boolean => {
    const card = c.cardId ? byId.get(c.cardId) : undefined;
    if (c.kind === "deal") return !!card && !card.data.tucked;
    if (c.kind === "reveal") return !!card && currentRevealCount(card.data) >= (c.revealCount ?? 0);
    return false;
  };
  const nextIdx = cues.findIndex((c) => (c.kind === "deal" || c.kind === "reveal") && !cueDone(c));

  /** Execute the frame up to (and including) cue `idx`: replay the deals + reveals,
   *  patch every frame card's tucked + reveal state in ONE undoable command. */
  const jumpToCue = (idx: number) => {
    const dealt = new Set<string>();
    const revealTo = new Map<string, number>();
    cues.slice(0, idx + 1).forEach((c) => {
      if (c.kind === "deal" && c.cardId) dealt.add(c.cardId);
      if (c.kind === "reveal" && c.cardId) revealTo.set(c.cardId, c.revealCount ?? 0);
    });
    const before = new Map(cards.map((c) => [c.id, { ...c.data }]));
    const after = new Map<string, CardData>();
    for (const c of cards) {
      const isDeck = !!c.data.deckMember;
      const isDealt = isDeck ? dealt.has(c.id) : true;
      const rc = isDealt ? (revealTo.get(c.id) ?? 0) : 0;
      after.set(c.id, { ...c.data, ...revealPatchForCount(c.data, rc), ...(isDeck ? { tucked: !isDealt } : {}) } as CardData);
    }
    const apply = (m: Map<string, CardData>) => rf.setNodes((nds) => nds.map((n) => (m.has(n.id) ? { ...n, data: { ...m.get(n.id) } } : n)));
    bus.dispatch({ label: "cue → here", do: () => apply(after), undo: () => apply(before as Map<string, CardData>) });
    const cid = cues[idx]?.cardId;
    if (cid) rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === cid) ? { ...n, selected: n.id === cid } : n)));
  };

  /** Reorder a deck deal cue — swap this card's stageOrder with its deck neighbour. */
  const moveDeal = (cardId: string, dir: -1 | 1) => {
    const deck = frameCardOrder(cards as never).filter((c) => c.data.deckMember);
    const i = deck.findIndex((c) => c.id === cardId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= deck.length) return;
    const a = deck[i], b = deck[j];
    const soA = a.data.stageOrder ?? i, soB = b.data.stageOrder ?? j;
    const rfl = rf as unknown as RfLike;
    bus.dispatch({
      label: "reorder deal",
      do: () => rfl.setNodes((nds) => nds.map((n) => (n.id === a.id ? { ...n, data: { ...n.data, stageOrder: soB } } : n.id === b.id ? { ...n, data: { ...n.data, stageOrder: soA } } : n))),
      undo: () => rfl.setNodes((nds) => nds.map((n) => (n.id === a.id ? { ...n, data: { ...n.data, stageOrder: soA } } : n.id === b.id ? { ...n, data: { ...n.data, stageOrder: soB } } : n))),
    });
  };

  return (
    <div
      className="absolute bottom-4 right-4 z-40 flex max-h-[70vh] w-72 flex-col rounded-xl"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 20px 50px -18px rgba(0,0,0,0.75)" }}
    >
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <ListOrdered className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Cue sheet</span>
        <span className="text-[9.5px]" style={{ color: NEON.muted }}>{cues.length} cues</span>
        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Close" onClick={onClose}><X className="h-3 w-3" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {cues.length === 0 && <div className="px-2 py-3 text-center text-[10.5px]" style={{ color: NEON.muted }}>No cues yet — add cards to this frame.</div>}
        <ol className="space-y-0.5">
          {cues.map((c, i) => {
            const m = KIND_META[c.kind];
            const Icon = m.icon;
            const done = cueDone(c);
            const isNext = i === nextIdx;
            const clickable = c.kind === "deal" || c.kind === "reveal";
            return (
              <li key={c.id}>
                <div
                  className="group/cue flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]"
                  style={{
                    background: isNext ? "rgba(252,163,17,0.14)" : done ? "rgba(126,243,192,0.06)" : "transparent",
                    border: `1px solid ${isNext ? "rgba(252,163,17,0.55)" : "transparent"}`,
                    opacity: done && !isNext ? 0.6 : 1,
                    cursor: clickable ? "pointer" : "default",
                  }}
                  onClick={clickable ? () => jumpToCue(i) : undefined}
                  title={clickable ? "Play the frame up to this cue" : undefined}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ color: m.color }}><Icon className="h-3 w-3" /></span>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide" style={{ color: m.color }}>{m.verb}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }}>{c.target}</span>
                  {isNext && <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ background: "rgba(252,163,17,0.9)", color: "#0B1322" }}>next</span>}
                  {c.kind === "deal" && (
                    <span className="flex shrink-0 opacity-0 transition-opacity group-hover/cue:opacity-100">
                      <button className="grid h-4 w-4 place-items-center" title="Deal earlier" onClick={(e) => { e.stopPropagation(); moveDeal(c.cardId!, -1); }} style={{ color: NEON.muted }}><ChevronUp className="h-3 w-3" /></button>
                      <button className="grid h-4 w-4 place-items-center" title="Deal later" onClick={(e) => { e.stopPropagation(); moveDeal(c.cardId!, 1); }} style={{ color: NEON.muted }}><ChevronDown className="h-3 w-3" /></button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="border-t px-2.5 py-1 text-[9px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
        Click a cue to play to it · ↑/↓ reorders a deal
      </div>
    </div>
  );
}
