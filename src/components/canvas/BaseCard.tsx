// Shared card shell — the card contract. Header (title + edit/duplicate/minimize/delete),
// resize, click-to-front z-order, neon frame. Every card type renders its body inside this.
import { useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Lightbulb, Lock, LockOpen, Minus, Pencil, Plus, Copy, Scaling, X } from "lucide-react";
import { addNodesCmd, bus, patchDataCmd, patchDataFnCmd, removeNodesCmd, type RfLike } from "./commands";
import { ConnectionDots } from "./ConnectionDots";
import { DeckChip, useDecks } from "./DecksContext";
import { attachMemo } from "./MemoLightbulb";
import { useCardDim, useCardEmphasis } from "./SpotlightContext";
import { NEON, PAPER } from "./theme";
import { nextZ } from "./zorder";
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
    <div className={`sa-chrome nodrag absolute bottom-1 z-[6] flex items-center gap-1 ${corner === "br" ? "right-7" : "left-1"}`} onPointerDown={(e) => e.stopPropagation()}>
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

/** Below this scale a card's text risks illegibility on a 1080p capture — we
 *  WARN (never block) so Lee knows a tiny card may not read on camera. */
export const MIN_LEGIBLE_SCALE = 0.4;

/** UNIFIED RESIZE FRAME (Item 1+2). transformOrigin is top-left, so the RIGHT /
 *  BOTTOM / BOTTOM-RIGHT grips grow the card toward the bottom-right WITHOUT
 *  moving it — that's the spec rule (resize never repositions; only the TOP edge
 *  moves). Every grip drives `data.scale` UNIFORMLY, so the card scales as ONE
 *  unit — box, padding and TEXT together (crisp CSS transform, same mechanism as
 *  the JE/note/CEQ cards). Proportional to the drag: the grip tracks the pointer's
 *  distance from the top-left anchor, so dragging a corner to ~58% renders ~58%.
 *  Grips are `nodrag` (they never trigger a node move) and hover-revealed, so an
 *  unselected shot is clean; they also survive film (no `.sa-chrome`, hover-only). */
export function CardResizeFrame({ scale, onScale, accent }: { scale: number; onScale: (s: number) => void; accent: string }) {
  const [pct, setPct] = useState<number | null>(null);
  const begin = (axis: "d" | "x" | "y") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const nodeEl = (e.currentTarget as HTMLElement).closest(".react-flow__node") as HTMLElement | null;
    if (!nodeEl) return;
    const r = nodeEl.getBoundingClientRect();
    const ax = r.left, ay = r.top; // top-left = the transformOrigin anchor
    const base = axis === "x" ? r.width : axis === "y" ? r.height : Math.hypot(r.width, r.height);
    if (base <= 0) return;
    const s0 = scale;
    const move = (ev: PointerEvent) => {
      const cur = axis === "x" ? ev.clientX - ax : axis === "y" ? ev.clientY - ay : Math.hypot(ev.clientX - ax, ev.clientY - ay);
      const s = clampScale(s0 * Math.max(0.05, cur / base));
      setPct(Math.round(s * 100));
      onScale(s);
    };
    const up = () => {
      setPct(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // hidden → pointer-events:none so an invisible grip never eats a content click
  const g = "nodrag absolute z-[7] opacity-0 pointer-events-none transition-opacity group-hover/shell:opacity-90 group-hover/shell:pointer-events-auto group-hover/cluster:opacity-90 group-hover/cluster:pointer-events-auto";
  const dot = { background: accent, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" };
  return (
    <>
      {/* RIGHT edge — resize (uniform scale) */}
      <div title="Drag to resize" onPointerDown={begin("x")} className={`${g} right-0 top-1/2 h-9 w-[7px] -translate-y-1/2 rounded-l`} style={{ ...dot, cursor: "ew-resize" }} />
      {/* BOTTOM edge — resize (uniform scale) */}
      <div title="Drag to resize" onPointerDown={begin("y")} className={`${g} bottom-0 left-1/2 h-[7px] w-9 -translate-x-1/2 rounded-t`} style={{ ...dot, cursor: "ns-resize" }} />
      {/* BOTTOM-RIGHT corner — the primary uniform-resize grip */}
      <div title="Drag to resize" onPointerDown={begin("d")} className={`${g} bottom-0 right-0 h-3.5 w-3.5 rounded-tl`} style={{ ...dot, cursor: "nwse-resize" }} />
      {/* live % while dragging — authoring aid (sa-chrome → off camera in film) */}
      {pct !== null && (
        <span className="sa-chrome nodrag absolute bottom-1 left-1 z-[8] rounded px-1 text-[9px] font-bold tabular-nums" style={{ background: "rgba(251,249,244,0.92)", border: `1px solid ${PAPER.cardEdge}`, color: PAPER.inkMuted }}>
          {pct}%
        </span>
      )}
      {/* legibility floor — warn, don't block. Authoring aid (sa-chrome → never on camera) */}
      {scale < MIN_LEGIBLE_SCALE && (
        <span className="sa-chrome nodrag absolute right-1 top-1 z-[8] rounded px-1 py-px text-[8.5px] font-bold" style={{ background: "#3a0d12", color: "#ffb3bd", border: "1px solid rgba(224,40,74,0.6)" }} title="This card may be too small to read on a 1080p capture">
          ⚠ tiny
        </span>
      )}
    </>
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
    // z-order is view noise, deliberately NOT on the undo rail. INTERACTION
    // RAISES within the node's tier (container < frame < element < card < memo),
    // so touching a card lifts it above its peers but never above a memo.
    toFront: () => rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, zIndex: nextZ(n.type, (n.data as { kind?: string })?.kind) } : n))),
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
          [{ ...node, id: nid, selected: false, position: { x: node.position.x + offset.x, y: node.position.y + offset.y }, zIndex: nextZ(node.type, kind), data: structuredClone(node.data) }],
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
  clipX,
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
  /** Clip horizontal overflow (the body scrolls only vertically) — the list card
   *  wants its numbers always visible, never scrolled off to the left. */
  clipX?: boolean;
  children: React.ReactNode;
}) {
  const { update, remove, toFront, duplicate, addToDeck, tuck } = useCardActions(id);
  const rf = useReactFlow();
  const [hover, setHover] = useState(false);
  const title = data.title ?? "";
  const scale = useCardScale(id, data);
  const dim = useCardDim(id);
  // A lit target (spotlight pill or super flame) scales its row 1.2–1.4× from the
  // left edge; while any is on, UNCLIP the card so that enlarged row spills past
  // the card border and stays fully legible instead of being cut off. Same in film.
  const emphasized = useCardEmphasis(id);
  // ITEM 4e — pulse a bright ring while this card's deck is clicked in the panel.
  const { highlightId } = useDecks();
  const deckFlash = !!data.deckId && highlightId === data.deckId;

  return (
    <div
      onPointerDownCapture={toFront}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // ALT+CLICK (#288): toggle the header/chrome off for a clean on-camera card.
      // ALT+CLICK toggles chrome — but ONLY pure Alt (Ctrl+Alt+Shift is the 🚨 warn super).
      onClickCapture={(e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.stopPropagation(); update({ hideChrome: !data.hideChrome }); } }}
      className="group/shell animate-in fade-in zoom-in-95 relative flex flex-col overflow-hidden rounded-xl duration-150"
      style={{
        width: fixedWidth ?? data.w ?? undefined,
        height: data.h ?? undefined,
        minWidth: 220,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
        // PAPER card: off-white "textbook flashcard" that pops off the navy table
        background: PAPER.card,
        // A spotlit row inside this card carries the CARD's paper colour (Lee) so the
        // lit item looks like it literally pops OUT of the card — spotStyle reads it.
        ["--spot-bg" as string]: PAPER.card,
        border: `1px solid ${deckFlash ? NEON.yellow : selected ? accent : PAPER.cardEdge}`,
        boxShadow: deckFlash
          ? `0 0 0 3px ${NEON.yellow}, 0 0 22px -2px ${NEON.yellow}`
          : selected
            ? `0 0 0 1.5px ${accent}, 0 14px 34px -14px rgba(0,0,0,0.65)`
            : "0 12px 32px -14px rgba(0,0,0,0.6)",
        transition: "box-shadow 150ms ease",
        color: PAPER.ink,
        // UNCLIP while a target is lit so the enlarged row escapes the card edge;
        // lift the card above its neighbours so the spill isn't overlapped.
        ...(emphasized ? { overflow: "visible", zIndex: 20 } : {}),
        ...dim,
      }}
    >
      {/* hover connection dots — drag from one to grow an arrow (V2) */}
      <ConnectionDots />
      {/* UNIFIED RESIZE (Item 1+2): grips on the right/bottom/corner drive uniform
          SCALE so the text scales with the card; they never move it. The TOP edge
          is the move handle (header when shown; the strip below when chrome hidden). */}
      {!noResize && <CardResizeFrame scale={scale} onScale={(s) => update({ scale: s })} accent={accent} />}
      {/* TOP MOVE STRIP — only needed when the header (the natural top drag zone) is
          hidden; NOT nodrag, so a pointer-down here drags the whole card. */}
      {data.hideChrome && (
        <div
          className="sa-move-grip absolute left-0 right-0 top-0 z-[6] h-3 cursor-move opacity-0 transition-opacity group-hover/shell:opacity-100"
          title="Drag to move"
          style={{ background: "linear-gradient(rgba(147,160,180,0.35), transparent)" }}
        />
      )}
      {/* Header (drag handle for the whole card) — brand navy band. Alt+click the
          card hides it (#288) for a clean on-camera look. */}
      {!data.hideChrome && (
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
      )}
      {/* BODY is `nodrag`: the card moves ONLY from the top (header / move strip),
          never by grabbing its middle — so reaching for a resize grip never nudges
          the card (Item 1). Content clicks/edits are unaffected. */}
      <div className={`nodrag nowheel min-h-0 flex-1 p-2.5 ${clipX ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"}`} style={emphasized ? { overflow: "visible" } : undefined}>{children}</div>
      {/* POSITION LOCK (B2) — bottom-right: freezes the spot (no drag), edits
          still work. The JE review-lock is the stricter cousin (edits too). */}
      <button
        title={data.posLock ? "Unlock position" : "Lock in place — no accidental drags (edits still work)"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); update({ posLock: !data.posLock }); }}
        className={`sa-chrome nodrag absolute bottom-1 right-1 z-[5] grid h-5 w-5 place-items-center rounded transition-opacity ${data.posLock ? "opacity-90" : "opacity-0 group-hover/shell:opacity-70 hover:!opacity-100"}`}
        style={{ color: data.posLock ? "#8A5A00" : PAPER.inkMuted, background: "rgba(251,249,244,0.9)", border: `1px solid ${PAPER.cardEdge}` }}
      >
        {data.posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
      </button>
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
