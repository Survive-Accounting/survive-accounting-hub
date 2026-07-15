// Shared card shell — the card contract. Header (title + edit/duplicate/minimize/delete),
// resize, click-to-front z-order, neon frame. Every card type renders its body inside this.
import { useRef, useState } from "react";
import { NodeResizer, useReactFlow } from "@xyflow/react";
import { Lightbulb, Lock, LockOpen, Minus, Pencil, Plus, Copy, Scaling, X } from "lucide-react";
import { addNodesCmd, bus, patchDataCmd, patchDataFnCmd, removeNodesCmd, type RfLike } from "./commands";
import { ConnectionDots } from "./ConnectionDots";
import { DeckChip, useDecks } from "./DecksContext";
import { attachMemo } from "./MemoLightbulb";
import { useCardDim } from "./SpotlightContext";
import { NEON, PAPER } from "./theme";
import { cardId, clampScale, FRAME_CARD_SCALE, isElementKind, type CardBase } from "./types";

/** FILMING SCALE control (FF-2 UI) — the engine (useCardScale + clampScale) was
 *  live but headless. A corner grip + % readout: drag down-right to grow, up-left
 *  to shrink, clamped 25–100%. Each drag coalesces into ONE undo step (update()
 *  bursts on `d:<id>:scale`). Reused by BaseCard and the custom JE cluster so it
 *  covers ALL card kinds. */
export function CardScaleHandle({ scale, onScale, corner = "br" }: { scale: number; onScale: (s: number) => void; corner?: "br" | "bl" }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0, s: 1 });
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    start.current = { x: e.clientX, y: e.clientY, s: scale };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const d = ev.clientX - start.current.x + (ev.clientY - start.current.y);
      onScale(clampScale(start.current.s + d / 300)); // ~300 screen-px = full range
    };
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const pct = Math.round(scale * 100);
  return (
    <div className={`nodrag absolute bottom-1 z-[6] flex items-center gap-1 ${corner === "br" ? "right-7" : "left-1"}`} onPointerDown={(e) => e.stopPropagation()}>
      <span
        className={`rounded px-1 text-[9px] font-bold tabular-nums transition-opacity ${dragging ? "opacity-100" : "opacity-0 group-hover/shell:opacity-80 group-hover/cluster:opacity-80"}`}
        style={{ background: "rgba(251,249,244,0.92)", border: `1px solid ${PAPER.cardEdge}`, color: PAPER.inkMuted }}
      >
        {pct}%
      </span>
      <button
        title={`Scale ${pct}% — drag to resize this card on camera`}
        onPointerDown={down}
        className={`grid h-5 w-5 place-items-center rounded transition-opacity ${dragging ? "opacity-100" : "opacity-0 group-hover/shell:opacity-70 group-hover/cluster:opacity-70 hover:!opacity-100"}`}
        style={{ color: PAPER.inkMuted, background: "rgba(251,249,244,0.9)", border: `1px solid ${PAPER.cardEdge}`, cursor: "nwse-resize" }}
      >
        <Scaling className="h-3 w-3" />
      </button>
    </div>
  );
}

/** FF-2 filming scale for a card: explicit `data.scale` wins; otherwise a card
 *  parented to a FRAME defaults to the shot scale (~60%), everything else 1. */
export function useCardScale(id: string, data: CardBase): number {
  const rf = useReactFlow();
  if (typeof data.scale === "number") return data.scale;
  const p = rf.getNode(id)?.parentId;
  return p && rf.getNode(p)?.type === "frame" ? FRAME_CARD_SCALE : 1;
}

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

/** The lesson a joining card belongs to: its lesson parent, else null (Loose).
 *  Regions/zones don't scope decks — lessons are the teaching unit. */
export function deckLessonFor(rf: { getNode: (id: string) => { type?: string } | undefined }, parentId: string | undefined): string | null {
  if (!parentId) return null;
  return rf.getNode(parentId)?.type === "lesson" ? parentId : null;
}

export function useCardActions(id: string) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  return {
    /** Absolute patch through the dispatcher (undoable). Bursts on the same keys —
     *  keystrokes in the title input, slider drags — coalesce into ONE undo step. */
    update: (patch: Record<string, unknown>) => {
      const c = patchDataCmd(rfl, id, patch, "edit card", `d:${id}:${Object.keys(patch).sort().join(",")}`);
      if (c) bus.dispatch(c);
    },
    /** Derive the patch from the LATEST node data — required for list mutations (lines,
     *  cells, steps): building from the render closure loses concurrent commits. */
    updateFn: (fn: (data: Record<string, unknown>) => Record<string, unknown>) => {
      const c = patchDataFnCmd(rfl, id, fn, "edit card");
      if (c) bus.dispatch(c);
    },
    remove: () => {
      const c = removeNodesCmd(rfl, [id], "delete card");
      if (c) bus.dispatch(c);
    },
    // z-order is view noise, deliberately NOT on the undo rail
    toFront: () => rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, zIndex: ++Z } : n))),
    /** Join the deck WITHOUT leaving the canvas (dealt member, end of order).
     *  A card parented to a LESSON joins that lesson's deck group (PROMPT C);
     *  loose cards join "Loose". ELEMENTS never deck — hard no-op. */
    addToDeck: () => {
      const node = rf.getNode(id);
      if (!node) return;
      const kind = (node.data as unknown as CardBase).kind;
      if (isElementKind(kind)) return;
      const entryType = (node.data as Record<string, unknown>).entryType as string | undefined;
      const c = patchDataCmd(
        rfl,
        id,
        {
          deckMember: true,
          tucked: false,
          stageOrder: nextStageOrder(rf.getNodes()),
          deckCategory: kind === "je" ? `je:${entryType ?? "standard"}` : kind,
          deckLessonId: deckLessonFor(rf, node.parentId),
        },
        "add to deck",
      );
      if (c) bus.dispatch(c);
    },
    /** TUCK: hide a member into the deck, remembering its spot (joins if loose).
     *  ELEMENTS never deck — hard no-op regardless of the caller. */
    tuck: () => {
      const node = rf.getNode(id);
      if (!node) return;
      const d = node.data as unknown as CardBase;
      const kind = d.kind;
      if (isElementKind(kind)) return;
      const entryType = (node.data as Record<string, unknown>).entryType as string | undefined;
      const c = patchDataCmd(
        rfl,
        id,
        {
          deckMember: true,
          tucked: true,
          stageOrder: d.deckMember ? d.stageOrder : nextStageOrder(rf.getNodes()),
          deckPos: { x: node.position.x, y: node.position.y },
          deckCategory: kind === "je" ? `je:${entryType ?? "standard"}` : kind,
          deckLessonId: d.deckMember ? (d.deckLessonId ?? deckLessonFor(rf, node.parentId)) : deckLessonFor(rf, node.parentId),
        },
        "tuck into deck",
      );
      if (c) bus.dispatch(c);
    },
    duplicate: () => {
      const node = rf.getNode(id);
      if (!node) return;
      const kind = (node.data as unknown as CardBase).kind;
      const nid = cardId(kind);
      // JE clones stack directly above the original — a visible layered pile
      const offset = kind === "je" ? { x: 10, y: -12 } : { x: 36, y: 36 };
      bus.dispatch(
        addNodesCmd(
          rfl,
          [{ ...node, id: nid, selected: false, position: { x: node.position.x + offset.x, y: node.position.y + offset.y }, zIndex: ++Z, data: structuredClone(node.data) }],
          "duplicate card",
        ),
      );
    },
  };
}

export function BaseCard({
  id,
  data,
  accent = NEON.pink,
  selected,
  headerRight,
  titleNode,
  kindBadge,
  noEditBtn,
  fixedWidth,
  noResize,
  children,
}: {
  id: string;
  data: CardBase;
  accent?: string;
  selected?: boolean;
  headerRight?: React.ReactNode;
  /** Replaces the default title input (JE puts its description editor here). */
  titleNode?: React.ReactNode;
  /** Tiny corner kind label replacing the accent dot ("JE"). */
  kindBadge?: string;
  /** Hide the pencil (cards where everything is always inline-editable). */
  noEditBtn?: boolean;
  /** Scene-uniform width (JE) — overrides per-card w. */
  fixedWidth?: number;
  noResize?: boolean;
  children: React.ReactNode;
}) {
  const { update, remove, toFront, duplicate, addToDeck, tuck } = useCardActions(id);
  const rf = useReactFlow();
  const title = data.title ?? "";
  const scale = useCardScale(id, data);
  const dim = useCardDim(id);
  // ITEM 4e — pulse a bright ring while this card's deck is clicked in the panel.
  const { highlightId } = useDecks();
  const deckFlash = !!data.deckId && highlightId === data.deckId;

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/shell animate-in fade-in zoom-in-95 relative flex flex-col overflow-hidden rounded-xl duration-150"
      style={{
        width: fixedWidth ?? data.w ?? undefined,
        height: data.h ?? undefined,
        minWidth: 220,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
        // PAPER card: off-white "textbook flashcard" that pops off the navy table
        background: PAPER.card,
        border: `1px solid ${deckFlash ? NEON.yellow : selected ? accent : PAPER.cardEdge}`,
        boxShadow: deckFlash
          ? `0 0 0 3px ${NEON.yellow}, 0 0 22px -2px ${NEON.yellow}`
          : selected
            ? `0 0 0 1.5px ${accent}, 0 14px 34px -14px rgba(0,0,0,0.65)`
            : "0 12px 32px -14px rgba(0,0,0,0.6)",
        transition: "box-shadow 150ms ease",
        color: PAPER.ink,
        ...dim,
      }}
    >
      {/* hover connection dots — drag from one to grow an arrow (V2) */}
      <ConnectionDots />
      {!noResize && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={220}
          minHeight={90}
          lineStyle={{ borderColor: accent }}
          handleStyle={{ width: 8, height: 8, borderRadius: 2, background: accent, border: "none" }}
          onResize={(_, p) => update({ w: Math.round(p.width), h: Math.round(p.height) })}
        />
      )}
      {/* Header (drag handle for the whole card) — brand navy band */}
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ background: PAPER.header }}
      >
        {kindBadge ? (
          <span
            className="shrink-0 rounded px-1 text-[8.5px] font-bold uppercase tracking-wider"
            style={{ color: accent, border: `1px solid ${accent}66` }}
          >
            {kindBadge}
          </span>
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        )}
        {titleNode ?? (
          <input
            className="nodrag min-w-0 flex-1 bg-transparent text-[11px] font-semibold uppercase tracking-wide outline-none"
            style={{ color: PAPER.headerMuted }}
            value={title}
            placeholder={(data as { kind: string }).kind}
            onChange={(e) => update({ title: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        {/* DECK CHIP (item 4b) — names the card's deck + drag source to (re)assign */}
        <span className="shrink-0 opacity-0 transition-opacity group-hover/shell:opacity-100"><DeckChip nodeId={id} deckId={data.deckId} /></span>
        <div className="card-actions flex items-center gap-0.5">
          {headerRight}
          {/* membership vs presence: loose card joins (stays put); a member tucks away */}
          {data.deckMember ? (
            <IconBtn title="Tuck into deck (s)" onClick={tuck}>
              <Minus className="h-3 w-3" />
            </IconBtn>
          ) : (
            <IconBtn title="Add to deck" onClick={addToDeck}>
              <Plus className="h-3 w-3" />
            </IconBtn>
          )}
          {!noEditBtn && (
            <IconBtn title="Edit card" active={data.editMode} onClick={() => update({ editMode: !data.editMode })}><Pencil className="h-3 w-3" /></IconBtn>
          )}
          <IconBtn title="Attach a memo (floating note + arrow)" onClick={() => attachMemo(rf, id, "r")}><Lightbulb className="h-3 w-3" /></IconBtn>
          <IconBtn title="Duplicate" onClick={duplicate}><Copy className="h-3 w-3" /></IconBtn>
          <IconBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></IconBtn>
        </div>
      </div>
      <div className="nowheel min-h-0 flex-1 overflow-auto p-2.5">{children}</div>
      {/* POSITION LOCK (B2) — bottom-right: freezes the spot (no drag), edits
          still work. The JE review-lock is the stricter cousin (edits too). */}
      <button
        title={data.posLock ? "Unlock position" : "Lock in place — no accidental drags (edits still work)"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); update({ posLock: !data.posLock }); }}
        className={`nodrag absolute bottom-1 right-1 z-[5] grid h-5 w-5 place-items-center rounded transition-opacity ${data.posLock ? "opacity-90" : "opacity-0 group-hover/shell:opacity-70 hover:!opacity-100"}`}
        style={{ color: data.posLock ? "#8A5A00" : PAPER.inkMuted, background: "rgba(251,249,244,0.9)", border: `1px solid ${PAPER.cardEdge}` }}
      >
        {data.posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
      </button>
      {/* FILMING SCALE (FF-2 UI) — corner grip + % readout, undoable, persists */}
      <CardScaleHandle scale={scale} onScale={(s) => update({ scale: s })} />
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
      style={{ color: active ? NEON.pink : NEON.muted, background: active ? "rgba(224,40,74,0.14)" : "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? "#E0284A" : "#FCA311")}
      onMouseLeave={(e) => (e.currentTarget.style.color = active ? NEON.pink : NEON.muted)}
    >
      {children}
    </button>
  );
}
