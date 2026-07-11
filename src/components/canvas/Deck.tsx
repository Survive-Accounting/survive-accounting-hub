// The DECK — ONE holding system for off-canvas cards (the old backstage rail and
// the minimized tray, merged). Cards enter by minimize/stage/sweep, remember
// their canvas spot, and DEAL back to it (or viewport center). Spacebar deals
// the next card when nothing is left to reveal. Face-down dealing renders the
// SURVIVE card back until flipped. Every mutation is a dispatcher command.
import { useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ChevronsRight, EyeOff, Hand, Layers3, Shuffle } from "lucide-react";

import { bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { CardBack } from "./CardBack";
import { nextStageOrder } from "./BaseCard";
import { CARD_KIND_LABEL } from "./templates";
import { NEON } from "./theme";
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
  image: NEON.cyan,
  legend: NEON.yellow,
};

/** Deck entries in deal order (stageOrder asc; legacy minimized cards ride along). */
export function deckInOrder(nodes: { id: string; type?: string; data: Record<string, unknown> }[]) {
  return nodes
    .filter((n) => n.type !== "zone" && ((n.data as unknown as CardBase).staged || (n.data as unknown as CardBase).minimized))
    .sort((a, b) => ((a.data as unknown as CardBase).stageOrder ?? 0) - ((b.data as unknown as CardBase).stageOrder ?? 0) || a.id.localeCompare(b.id));
}

/** Category stamp stored on deck entry (spec: the filtering hook, cheap today). */
export function categoryOf(d: CardData): string {
  return d.kind === "je" ? `je:${(d as { entryType?: string }).entryType ?? "standard"}` : d.kind;
}

export function Deck({
  onDeal,
  dealFaceDown,
  setDealFaceDown,
  hideFdLabels,
  setHideFdLabels,
}: {
  onDeal: (id: string) => void;
  dealFaceDown: boolean;
  setDealFaceDown: (v: boolean) => void;
  hideFdLabels: boolean;
  setHideFdLabels: (v: boolean) => void;
}) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const deck = deckInOrder(nodes as never);

  const dealNext = () => {
    if (deck[0]) onDeal(deck[0].id);
  };

  const shuffle = () => {
    if (deck.length < 2) return;
    const ids = deck.map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const c = compositeCmd(
      ids.map((id, idx) => patchDataCmd(rf as unknown as RfLike, id, { stageOrder: idx }, "shuffle")),
      "shuffle deck",
    );
    if (c) bus.dispatch(c);
  };

  /** SWEEP: every on-canvas card returns to the deck (remembers its spot). */
  const sweep = () => {
    const nds = rf.getNodes();
    let order = nextStageOrder(nds);
    const c = compositeCmd(
      nds
        .filter((n) => n.type !== "zone" && !(n.data as unknown as CardBase).staged && !(n.data as unknown as CardBase).minimized)
        .map((n) =>
          patchDataCmd(
            rf as unknown as RfLike,
            n.id,
            {
              staged: true,
              minimized: false,
              stageOrder: order++,
              deckPos: { x: n.position.x, y: n.position.y },
              deckCategory: categoryOf(n.data as unknown as CardData),
            },
            "sweep",
          ),
        ),
      "sweep to deck",
    );
    if (c) bus.dispatch(c);
  };

  /** Drop dragId in front of targetId (or at the end when targetId is null). */
  const reorder = (targetId: string | null) => {
    if (!dragId || dragId === targetId) return;
    const ids = deck.map((s) => s.id).filter((x) => x !== dragId);
    const at = targetId ? ids.indexOf(targetId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    const c = compositeCmd(
      ids.map((nid, idx) => patchDataCmd(rf as unknown as RfLike, nid, { stageOrder: idx }, "reorder")),
      "reorder deck",
    );
    if (c) bus.dispatch(c);
    setDragId(null);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title={`Deck (${deck.length})`}
        className="absolute right-3 top-3 z-40 overflow-hidden rounded-lg"
        style={{ border: `1px solid ${NEON.border}` }}
      >
        <CardBack small width={38} height={53} label={`${deck.length}`} />
      </button>
    );
  }

  return (
    <aside
      className="absolute right-3 top-3 z-40 flex max-h-[70vh] w-56 flex-col rounded-xl"
      style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => reorder(null)}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <Layers3 className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>
          Deck <span style={{ color: NEON.muted }}>({deck.length})</span>
        </span>
        <button onClick={() => setCollapsed(true)} title="Collapse" className="ml-auto" style={{ color: NEON.muted }}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* actions */}
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <DeckBtn title="Deal the next card (space)" onClick={dealNext} disabled={deck.length === 0}>
          <Hand className="h-3 w-3" /> deal
        </DeckBtn>
        <DeckBtn title="Randomize deal order" onClick={shuffle} disabled={deck.length < 2}>
          <Shuffle className="h-3 w-3" /> shuffle
        </DeckBtn>
        <DeckBtn title="Return every card on the canvas to the deck" onClick={sweep}>
          <Layers3 className="h-3 w-3" /> sweep
        </DeckBtn>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <label className="flex cursor-pointer items-center gap-1 text-[9.5px]" style={{ color: dealFaceDown ? NEON.yellow : NEON.muted }}>
          <input type="checkbox" checked={dealFaceDown} onChange={(e) => setDealFaceDown(e.target.checked)} style={{ accentColor: "#FCA311" }} />
          deal face down
        </label>
        {dealFaceDown && (
          <label className="flex cursor-pointer items-center gap-1 text-[9.5px]" style={{ color: hideFdLabels ? NEON.yellow : NEON.muted }} title='Quiz mode: banners show "???"'>
            <input type="checkbox" checked={hideFdLabels} onChange={(e) => setHideFdLabels(e.target.checked)} style={{ accentColor: "#FCA311" }} />
            <EyeOff className="h-2.5 w-2.5" /> hide labels
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
        {deck.length === 0 && (
          <p className="px-1 py-2 text-[10.5px] italic leading-relaxed" style={{ color: NEON.muted }}>
            Empty. Send cards here with the clapperboard, “s”, or SWEEP — spacebar deals them back in order.
          </p>
        )}
        {deck.map((n, i) => {
          const d = n.data as unknown as CardData;
          return (
            <div
              key={n.id}
              draggable
              onDragStart={() => setDragId(n.id)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.stopPropagation(); reorder(n.id); }}
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors"
              style={{ border: `1px solid ${dragId === n.id ? NEON.yellow : NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}
              onClick={() => onDeal(n.id)}
              title="Deal to the canvas"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8.5px] font-bold" style={{ border: `1px solid ${NEON.yellow}`, color: NEON.yellow }}>
                {i + 1}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_DOT[d.kind] ?? NEON.pink }} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                {d.title || (d.kind === "je" && (d as { caption?: string }).caption) || CARD_KIND_LABEL[d.kind] || d.kind}
              </span>
              {(d as CardBase).deckCategory?.startsWith("je:") && (d as CardBase).deckCategory !== "je:standard" && (
                <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.4)" }}>
                  {(d as CardBase).deckCategory!.slice(3, 6)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function DeckBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
      style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "rgba(252,163,17,0.6)"; }}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = NEON.borderSoft)}
    >
      {children}
    </button>
  );
}
