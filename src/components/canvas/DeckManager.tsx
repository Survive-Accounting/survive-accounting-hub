// NAMED DECKS manager (P3) — the deck panel's first-class-deck section. Create
// CARD decks or MEMO decks; rename, duplicate, delete; toggle run mode
// (sequence↔shuffle) and skeletons; add the current SELECTION to a deck. Cards/
// memos join via data.deckId (+ deckMember for the roster). The deck definitions
// live in the scene (persisted); the canvas_decks table (0090) is the reusable
// library layer. Deal-into-grid + memo highlight render in P4.
import { useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { Copy, Grid3x3, Layers, Plus, RotateCcw, Shuffle, SquareStack, Trash2 } from "lucide-react";

import { addDeck, deckMembersOf, duplicateDeck, gridSlots, newDeckDef, removeDeck, shuffledOrder, updateDeck } from "./deck-defs";
import { bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { nextStageOrder } from "./BaseCard";
import { isContainerType, type DeckDef } from "./types";
import { NEON } from "./theme";

export function DeckManager({ decks, setDecks }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void }) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);

  const create = (payloadType: "cards" | "memos") => setDecks((prev) => addDeck(prev, newDeckDef("", payloadType)));

  /** Stamp the current selection into a deck (elements/containers skipped for a
   *  CARD deck; only memo nodes for a MEMO deck). ONE undoable command. */
  const addSelection = (deck: DeckDef) => {
    const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type));
    const eligible = sel.filter((n) => (deck.payloadType === "memos" ? n.type === "memo" : n.type !== "memo"));
    if (eligible.length === 0) return;
    let order = nextStageOrder(rf.getNodes() as never);
    const cmd = compositeCmd(
      eligible.map((n) =>
        patchDataCmd(rf as unknown as RfLike, n.id, { deckId: deck.id, deckMember: true, stageOrder: order++ }, "add to deck"),
      ),
      `add ${eligible.length} to ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
  };

  type Member = { id: string; position: { x: number; y: number }; data?: { deckId?: string; stageOrder?: number; slotIndex?: number } };
  const membersOf = (deck: DeckDef) => deckMembersOf(rf.getNodes() as Member[], deck.id);

  /** LAY GRID (P4): arrange the deck's members into a near-square grid, record
   *  the slots, and tuck every member so the grid starts as skeletons. One step. */
  const layGrid = (deck: DeckDef) => {
    const members = membersOf(deck);
    if (members.length === 0) return;
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const slots = gridSlots(members.length, { originX: Math.round(c.x - (cols * 360) / 2), originY: Math.round(c.y - 120), cellW: 320, cellH: 200, gapX: 40, gapY: 40 });
    const cmd = compositeCmd(
      members.map((n, i) => patchDataCmd(rf as unknown as RfLike, n.id, { slotIndex: i, deckMember: true, tucked: true, staged: undefined, minimized: undefined, deckPos: slots[i] }, "lay grid")),
      `lay grid: ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => updateDeck(prev, deck.id, { slots }));
  };

  /** Deck RESET: re-skeleton the whole grid (tuck all members back to slots).
   *  SHUFFLE (run_mode) reassigns which member lands in which slot first. */
  const resetDeck = (deck: DeckDef) => {
    const members = membersOf(deck);
    if (members.length === 0) return;
    const order = deck.runMode === "shuffle" ? shuffledOrder(members.length) : members.map((_, i) => i);
    const cmd = compositeCmd(
      members.map((n, i) => {
        const slotIdx = order[i];
        const slot = deck.slots?.[slotIdx] ?? n.position;
        return patchDataCmd(rf as unknown as RfLike, n.id, { slotIndex: slotIdx, deckMember: true, tucked: true, staged: undefined, minimized: undefined, deckPos: slot }, "reset deck");
      }),
      `reset ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
  };

  const del = (deck: DeckDef) => {
    // drop membership from this deck's members, then remove the def — one step
    const members = deckMembersOf(rf.getNodes() as { data?: { deckId?: string; stageOrder?: number }; id: string }[], deck.id);
    const cmd = compositeCmd(
      members.map((n) => patchDataCmd(rf as unknown as RfLike, n.id, { deckId: undefined }, "unassign deck")),
      `delete deck ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => removeDeck(prev, deck.id));
  };

  return (
    <div className="px-2 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
      <button className="flex w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }} onClick={() => setOpen((v) => !v)}>
        <Layers className="h-3 w-3" />
        Named decks <span style={{ color: NEON.muted }}>({decks.length})</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1">
          {decks.map((deck) => {
            const count = deckMembersOf(nodes as { data?: { deckId?: string; stageOrder?: number }; id: string }[], deck.id).length;
            const memo = deck.payloadType === "memos";
            return (
              <div key={deck.id} className="rounded-md px-1.5 py-1" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}>
                <div className="flex items-center gap-1">
                  <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ color: memo ? NEON.pinkSoft : NEON.yellow, border: `1px solid ${memo ? "rgba(224,40,74,0.4)" : "rgba(252,163,17,0.4)"}` }}>
                    {memo ? "memo" : "cards"}
                  </span>
                  {renaming === deck.id ? (
                    <input
                      autoFocus
                      defaultValue={deck.name}
                      className="min-w-0 flex-1 rounded bg-black/40 px-1 text-[11.5px] outline-none"
                      style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
                      onBlur={(e) => { setDecks((prev) => updateDeck(prev, deck.id, { name: e.target.value.trim() || deck.name })); setRenaming(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); e.stopPropagation(); }}
                    />
                  ) : (
                    <button className="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold" style={{ color: NEON.text }} title="Rename" onClick={() => setRenaming(deck.id)}>
                      {deck.name}
                    </button>
                  )}
                  <span className="shrink-0 text-[9.5px]" style={{ color: NEON.muted }}>{count}</span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <DeckMini title={deck.runMode === "shuffle" ? "Shuffle on reset" : "Deal in sequence"} active={deck.runMode === "shuffle"} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { runMode: deck.runMode === "shuffle" ? "sequence" : "shuffle" }))}>
                    <Shuffle className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title={deck.showSkeletons === false ? "Skeletons off" : "Skeletons on"} active={deck.showSkeletons !== false} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { showSkeletons: deck.showSkeletons === false }))}>
                    <SquareStack className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title="Lay a skeleton grid — arrange members into fixed slots, start tucked" onClick={() => layGrid(deck)}><Grid3x3 className="h-3 w-3" /></DeckMini>
                  <DeckMini title={deck.runMode === "shuffle" ? "Reset — re-skeleton (shuffle slot order)" : "Reset — re-skeleton the grid"} onClick={() => resetDeck(deck)}><RotateCcw className="h-3 w-3" /></DeckMini>
                  <button className="ml-auto rounded px-1 py-0.5 text-[9.5px] font-semibold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title="Add the selected cards/memos to this deck" onClick={() => addSelection(deck)}>
                    + sel
                  </button>
                  <DeckMini title="Duplicate deck" onClick={() => setDecks((prev) => duplicateDeck(prev, deck.id).defs)}><Copy className="h-3 w-3" /></DeckMini>
                  <DeckMini title="Delete deck" danger onClick={() => del(deck)}><Trash2 className="h-3 w-3" /></DeckMini>
                </div>
              </div>
            );
          })}
          <div className="flex gap-1">
            <button className="flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => create("cards")}>
              <Plus className="h-3 w-3" /> card deck
            </button>
            <button className="flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.pinkSoft, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => create("memos")}>
              <Plus className="h-3 w-3" /> memo deck
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeckMini({ children, onClick, title, active, danger }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded"
      style={{ color: danger ? NEON.red : active ? NEON.yellow : NEON.muted, border: `1px solid ${active ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }}
    >
      {children}
    </button>
  );
}
