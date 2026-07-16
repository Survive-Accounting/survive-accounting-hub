// NAMED DECKS manager (P3) — the deck panel's first-class-deck section. Create
// CARD decks or MEMO decks; rename, duplicate, delete; toggle run mode
// (sequence↔shuffle) and skeletons; add the current SELECTION to a deck. Cards/
// memos join via data.deckId (+ deckMember for the roster). The deck definitions
// live in the scene (persisted); the canvas_decks table (0090) is the reusable
// library layer. Deal-into-grid + memo highlight render in P4.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNodes, useReactFlow } from "@xyflow/react";

import { fetchJeBrowserTree } from "@/lib/je-api";
import { Clapperboard, Copy, Grid3x3, Layers, ListChecks, Plus, RotateCcw, Shuffle, Sparkles, SquareStack, Trash2 } from "lucide-react";

import { addDeck, deckMembersOf, duplicateDeck, gridSlots, newDeckDef, normalBalanceCeqData, NORMAL_BALANCE_DRILL_FILTER, removeDeck, seedChapters, seedStartHereDecks, shuffledOrder, updateDeck, type SeedChapter } from "./deck-defs";
import { addNodesCmd, bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { nextStageOrder } from "./BaseCard";
import { useCanvasSettings } from "./CanvasSettingsContext";
import { DECK_DND_MIME, useDecks } from "./DecksContext";
import { absRectOf } from "./frames";
import { useFrameNav } from "./FrameNavContext";
import { cardId, isContainerType, type DeckDef } from "./types";
import { NEON } from "./theme";

export function DeckManager({ decks, setDecks }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void }) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const nav = useFrameNav();
  const { flashDeck } = useDecks();
  const { coa, courseId } = useCanvasSettings();
  // ITEM 6: the scene course's REAL chapters (active, in order) drive the seed —
  // no longer a hardcoded list. The tree query is shared/cached (300s staleTime).
  const tree = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 300_000, retry: 1, networkMode: "always" });
  const courseChapters: SeedChapter[] = (tree.data?.courses.find((c) => c.id === courseId)?.chapters ?? [])
    .filter((c) => c.id !== "__unassigned__" && c.status !== "archived" && c.chapter_name)
    .sort((a, b) => (a.chapter_number ?? 999) - (b.chapter_number ?? 999))
    .map((c) => ({ number: c.chapter_number, name: c.chapter_name as string }));
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // deck row a card is hovering over (item 4a)
  const [seedNote, setSeedNote] = useState<string | null>(null); // one-line result after seeding

  const create = (payloadType: "cards" | "memos") => setDecks((prev) => addDeck(prev, newDeckDef("", payloadType)));

  /** SEED START HERE (item 5) — stamp the empty authoring roadmap of named decks
   *  into the scene, wiring each chapter deck to the matching lesson. Idempotent. */
  const seedStartHere = () => {
    const lessons = rf.getNodes().filter((n) => n.type === "lesson").map((n) => ({ id: n.id, label: String((n.data as { label?: string }).label ?? "") }));
    const chs = seedChapters(courseChapters); // item 6: the course's REAL chapters, else the Foundations fallback
    setDecks((prev) => {
      const { toAdd, attached, unattached } = seedStartHereDecks(prev, chs, lessons);
      setSeedNote(toAdd.length === 0 ? "already seeded — nothing added" : `added ${toAdd.length} decks · ${attached}/${chs.length} chapters matched a lesson${unattached.length ? ` (loose: ${unattached.join(", ")})` : ""}`);
      return [...prev, ...toAdd];
    });
  };

  /** GENERATE NORMAL-BALANCE DRILL (item 6) — one DR/CR CEQ per COA account,
   *  tucked into this drill deck as skeletons. A CEQ variant, no new card kind. */
  const generateDrill = (deck: DeckDef) => {
    const accounts = coa.flatMap((g) => g.accounts.map((a) => ({ name: a.name, normal: a.normal })));
    if (accounts.length === 0) { setSeedNote("no chart of accounts loaded — set the scene's course first"); return; }
    if (deckMembersOf(rf.getNodes() as never, deck.id).length > 0) { setSeedNote("drill already generated — delete its cards to regenerate"); return; }
    const data = normalBalanceCeqData(accounts, () => cardId("ch"));
    const cols = Math.max(1, Math.ceil(Math.sqrt(data.length)));
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    const slots = gridSlots(data.length, { originX: Math.round(c.x - (cols * 290) / 2), originY: Math.round(c.y - 120), cellW: 260, cellH: 150, gapX: 30, gapY: 30 });
    const newNodes = data.map((q, i) => ({
      id: cardId("ceq"), type: "ceq", position: slots[i], selected: false,
      data: { kind: "ceq", title: "Normal balance", prompt: q.prompt, choices: q.choices, deckId: deck.id, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: "ceq:normal-balance", deckPos: slots[i] } as Record<string, unknown>,
    }));
    const cmd = addNodesCmd(rf as unknown as RfLike, newNodes as never, `generate ${newNodes.length} normal-balance drills`);
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => updateDeck(prev, deck.id, { slots }));
    setSeedNote(`generated ${newNodes.length} DR/CR questions from the course COA`);
  };

  /** ITEM 4a — a card/memo dragged from its chip onto this deck row (re)joins it.
   *  Elements/containers and the wrong payload type are rejected. One undo step. */
  const assignToDeck = (deck: DeckDef, nodeId: string) => {
    const n = rf.getNode(nodeId);
    if (!n || isContainerType(n.type)) return;
    const isMemo = n.type === "memo";
    if (deck.payloadType === "memos" ? !isMemo : isMemo) return; // card decks take cards; memo decks take memos
    const order = nextStageOrder(rf.getNodes() as never);
    const cmd = patchDataCmd(rf as unknown as RfLike, nodeId, { deckId: deck.id, deckMember: true, stageOrder: order }, `move to ${deck.name}`);
    if (cmd) bus.dispatch(cmd);
    flashDeck(deck.id);
  };

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
    flashDeck(deck.id);
  };

  type Member = { id: string; position: { x: number; y: number }; data?: { deckId?: string; stageOrder?: number; slotIndex?: number } };
  const membersOf = (deck: DeckDef) => deckMembersOf(rf.getNodes() as Member[], deck.id);

  /** LAY GRID (P4): arrange the deck's members into a near-square grid, record
   *  the slots, and tuck every member so the grid starts as skeletons. One step. */
  const layGrid = (deck: DeckDef) => {
    const members = membersOf(deck);
    if (members.length === 0) return;
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    let slots: { x: number; y: number }[];
    const frame = deck.frameId ? rf.getNode(deck.frameId) : null;
    if (frame) {
      // DECK ↔ FRAME (F3): lay the grid INSIDE the frame's bounds — the frame is
      // the deck's stage (a Check frame holding its CEQ grid).
      const byId = new Map(rf.getNodes().map((n) => [n.id, n]));
      const r = absRectOf(frame as never, byId as never);
      const rows = Math.ceil(members.length / cols);
      const pad = 40;
      const gap = 24;
      const cellW = Math.max(120, (r.w - 2 * pad - (cols - 1) * gap) / cols);
      const cellH = Math.max(90, (r.h - 2 * pad - (rows - 1) * gap) / rows);
      slots = gridSlots(members.length, { originX: Math.round(r.x + pad), originY: Math.round(r.y + pad), cols, cellW, cellH, gapX: gap, gapY: gap });
    } else {
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const c = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
      slots = gridSlots(members.length, { originX: Math.round(c.x - (cols * 360) / 2), originY: Math.round(c.y - 120), cellW: 320, cellH: 200, gapX: 40, gapY: 40 });
    }
    const cmd = compositeCmd(
      members.map((n, i) => patchDataCmd(rf as unknown as RfLike, n.id, { slotIndex: i, deckMember: true, tucked: true, staged: undefined, minimized: undefined, deckPos: slots[i] }, "lay grid")),
      `lay grid: ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => updateDeck(prev, deck.id, { slots }));
  };

  /** Attach the deck to the frame you're currently inside (or detach). */
  const toggleFrameAttach = (deck: DeckDef) => {
    const fid = nav.currentFrameId;
    setDecks((prev) => updateDeck(prev, deck.id, { frameId: deck.frameId ? null : fid ?? null }));
  };
  const frameTitleOf = (fid: string | null | undefined) => {
    if (!fid) return null;
    const f = rf.getNode(fid);
    return f ? (((f.data as { title?: string }).title || "Frame")) : null;
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
            const slotCount = deck.slots?.length ?? 0;
            const isDrop = dropTarget === deck.id;
            return (
              <div
                key={deck.id}
                className="rounded-md px-1.5 py-1"
                style={{ border: `1px solid ${isDrop ? NEON.yellow : NEON.borderSoft}`, background: isDrop ? "rgba(252,163,17,0.12)" : "rgba(0,0,0,0.25)", transition: "background 120ms, border-color 120ms" }}
                // ITEM 4a — drop a dragged card/memo here to (re)assign membership
                onDragOver={(e) => { if (e.dataTransfer.types.includes(DECK_DND_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropTarget !== deck.id) setDropTarget(deck.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget((t) => (t === deck.id ? null : t)); }}
                onDrop={(e) => { const nodeId = e.dataTransfer.getData(DECK_DND_MIME); setDropTarget(null); if (nodeId) { e.preventDefault(); assignToDeck(deck, nodeId); } }}
              >
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
                    // single click HIGHLIGHTS members on canvas (item 4e); double-click renames
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold"
                      style={{ color: NEON.text }}
                      title="Click: flash this deck's cards on the canvas · double-click: rename"
                      onClick={() => flashDeck(deck.id)}
                      onDoubleClick={() => setRenaming(deck.id)}
                    >
                      {deck.name}
                    </button>
                  )}
                  {deck.frameId && (
                    <span className="shrink-0 rounded px-1 text-[8px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title={`Attached to frame: ${frameTitleOf(deck.frameId) ?? "?"}`}>◈</span>
                  )}
                  {/* ITEM 4c — unambiguous MEMBER count ("3 cards"), slot count separate */}
                  <span className="shrink-0 text-[9px] tabular-nums" style={{ color: NEON.muted }} title={`${count} ${memo ? "memos" : "cards"} in this deck${slotCount ? ` · ${slotCount} grid slots` : ""}`}>
                    {count} {memo ? "memos" : "cards"}{slotCount ? ` · ${slotCount} slots` : ""}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <DeckMini title={deck.runMode === "shuffle" ? "Shuffle on reset" : "Deal in sequence"} active={deck.runMode === "shuffle"} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { runMode: deck.runMode === "shuffle" ? "sequence" : "shuffle" }))}>
                    <Shuffle className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title={deck.showSkeletons === false ? "Skeletons off" : "Skeletons on"} active={deck.showSkeletons !== false} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { showSkeletons: deck.showSkeletons === false }))}>
                    <SquareStack className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini
                    title={deck.frameId ? `Detach from frame (${frameTitleOf(deck.frameId) ?? "?"})` : nav.currentFrameId ? "Attach to the current frame — the grid lays inside it" : "Enter a frame first, then attach the deck to it"}
                    active={!!deck.frameId}
                    onClick={() => toggleFrameAttach(deck)}
                  >
                    <Clapperboard className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title={deck.frameId ? "Lay the skeleton grid INSIDE the attached frame" : "Lay a skeleton grid — arrange members into fixed slots, start tucked"} onClick={() => layGrid(deck)}><Grid3x3 className="h-3 w-3" /></DeckMini>
                  <DeckMini title={deck.runMode === "shuffle" ? "Reset — re-skeleton (shuffle slot order)" : "Reset — re-skeleton the grid"} onClick={() => resetDeck(deck)}><RotateCcw className="h-3 w-3" /></DeckMini>
                  {deck.filter === NORMAL_BALANCE_DRILL_FILTER && (
                    <DeckMini title="Generate the normal-balance drill from the course COA (DR/CR CEQ per account)" onClick={() => generateDrill(deck)}><Sparkles className="h-3 w-3" /></DeckMini>
                  )}
                  <DeckMini title="Duplicate deck" onClick={() => setDecks((prev) => duplicateDeck(prev, deck.id).defs)}><Copy className="h-3 w-3" /></DeckMini>
                  <DeckMini title="Delete deck" danger onClick={() => del(deck)}><Trash2 className="h-3 w-3" /></DeckMini>
                </div>
                {/* ITEM 4d — the add-selection action NAMES its target deck */}
                <button
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-0.5 text-[9.5px] font-semibold"
                  style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}
                  title={`Add the canvas selection to “${deck.name}”`}
                  onClick={() => addSelection(deck)}
                >
                  <Plus className="h-2.5 w-2.5" /> Add selected to “{deck.name}”
                </button>
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
          {/* SEED START HERE (item 5) — one click stamps the whole authoring roadmap */}
          <button
            className="flex w-full items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide"
            style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }}
            title="Create the empty Start Here decks (11 chapters × teaching + Check, Ch 3 normal-balance drill, 4 memo decks) and attach them to their lessons"
            onClick={seedStartHere}
          >
            <ListChecks className="h-3 w-3" /> seed Start Here decks
          </button>
          {seedNote && <div className="px-0.5 text-[9px] leading-snug" style={{ color: NEON.muted }}>{seedNote}</div>}
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
