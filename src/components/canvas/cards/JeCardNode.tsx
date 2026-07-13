// JE card v3 — TETRIS. No card rectangle: the entry is a CLUSTER of per-line
// blocks on the whiteboard. Debit blocks sit flush left, credit blocks offset
// right by the scene-wide jeIndent; every block is the same fixed width
// (jeCardWidth − jeIndent), so identical DR/CR patterns read as identical
// silhouettes. The transaction description floats above in marker font with a
// JE/ADJ/CL corner badge; chrome (deck/clone/gear/×) appears only on hover or
// selection; memos float to the RIGHT of their block with a leader line.
// Everything mutates through the command bus; popovers ride CardPopover.
import { useEffect, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ArrowUpRight, ChevronDown, CircleHelp, CircleX, Copy, Lightbulb, Lock, LockOpen, Plus, Repeat, Settings2, Undo2, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { addNodesCmd, bus, type RfLike } from "../commands";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { CoaPicker } from "./CoaPicker";
import { EditableNumber, fmtNum } from "../ui";
import { JE_FONT, NEON, PAPER } from "../theme";
import {
  JE_PRESETS,
  amountOf,
  balanceState,
  blankFrom,
  effectiveMode,
  effectiveSettings,
  ensureMinLines,
  groupLines,
  hasAttempt,
  moveLine,
  swapLines,
  type JePreset,
  type JeSettings,
  type JeSide,
} from "../je-logic";
import { cardId, type JeCard, type JeLine } from "../types";

const ENTRY_TYPES = ["standard", "adjusting", "closing"] as const;
const BADGE: Record<(typeof ENTRY_TYPES)[number], string> = { standard: "JE", adjusting: "ADJ", closing: "CL" };

/** Effective line honoring a flipped trap (trap amounts may cross columns). */
function eff(l: JeLine): JeLine {
  if (!l.flipped || !l.trap) return l;
  const dr = l.trap.dr !== undefined ? l.trap.dr : l.dr;
  const cr = l.trap.cr !== undefined ? l.trap.cr : l.cr;
  return { ...l, account: l.trap.account ?? l.account, dr, cr, side: l.trap.dr !== undefined || l.trap.cr !== undefined ? undefined : l.side };
}

const SOCKET_PULSE_CSS = `
@keyframes je-socket-pulse { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
`;

export function JeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as JeCard;
  const rf = useReactFlow();
  const { update, updateFn, remove, toFront, addToDeck, tuck } = useCardActions(id);
  const ctx = useCanvasSettings();
  const S = effectiveSettings(d.settings, ctx.jePreset);
  const mode = effectiveMode(d.mode, ctx.jePreset);

  const [flipFeedback, setFlipFeedback] = useState<string | null>(null);
  const [dragLine, setDragLine] = useState<string | null>(null);
  const [hotSocket, setHotSocket] = useState<string | null>(null); // "side-index" under the dragged block
  const [memoView, setMemoView] = useState<Set<string>>(new Set()); // floating notes open
  const [memoEdit, setMemoEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [pickerFor, setPickerFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [gearAnchor, setGearAnchor] = useState<HTMLElement | null>(null);
  const selLine = (data as Record<string, unknown>)._selLine as string | undefined;
  const arrowPending = !!(data as Record<string, unknown>)._arrowPending;

  // A6: a stale _selLine outliving the card's selection made ←/→ move "the block
  // below the selected one" — clear it whenever the NODE deselects.
  useEffect(() => {
    if (!selected && selLine) rf.updateNodeData(id, { _selLine: undefined });
  }, [selected, selLine, rf, id]);

  const blockW = ctx.jeCardWidth - ctx.jeIndent;

  const setLines = (mk: (lines: JeLine[]) => JeLine[]) => updateFn((prev) => ({ lines: mk((prev.lines as JeLine[]) ?? []) }));
  const patchLine = (lid: string, patch: Partial<JeLine>) => setLines((lines) => lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const selectLine = (lid: string | null) => rf.updateNodeData(id, { _selLine: lid ?? undefined }); // transient

  const effLines = d.lines.map(eff);
  const g = groupLines(effLines);
  const bal = balanceState(effLines);

  // ---- REVIEW LOCK (A3): the answer-key state — review-only, no drag/edit ---
  const locked = !!d.reviewLock;
  const [cloneMenu, setCloneMenu] = useState<HTMLElement | null>(null);

  /** Clone lands to the RIGHT of the original (A5). asPractice = the student
   *  copy: blank silhouette + solution stamped + practice mode, unlocked. */
  const cloneAs = (asPractice: boolean) => {
    const node = rf.getNode(id);
    if (!node) return;
    const src = structuredClone(node.data) as unknown as JeCard;
    const key = src.solution?.length ? src.solution : src.lines;
    const data = asPractice
      ? {
          ...src,
          mode: "practice" as const,
          settings: { ...JE_PRESETS.practice },
          reviewLock: false,
          helpOpen: false,
          solution: structuredClone(key),
          lines: blankFrom(key, () => cardId("l")),
        }
      : src;
    bus.dispatch(
      addNodesCmd(
        rf as unknown as RfLike,
        [{ ...node, id: cardId("je"), selected: false, position: { x: node.position.x + ctx.jeCardWidth + 28, y: node.position.y }, data: data as unknown as Record<string, unknown> }],
        asPractice ? "clone as practice copy" : "duplicate card",
      ),
    );
    setCloneMenu(null);
  };

  // ---- CARD-FLIP HELP (A2): the tetris-card back doing double duty ----------
  const flipHelp = () => update({ helpOpen: !d.helpOpen });
  /** Reveal the correct answer: the stored solution wins; else unhide everything. */
  const revealCorrect = () =>
    updateFn((prev) => {
      const sol = prev.solution as JeLine[] | undefined;
      if (sol?.length) return { lines: structuredClone(sol), helpOpen: false };
      return { lines: ((prev.lines as JeLine[]) ?? []).map((l) => ({ ...l, hidden: false, flipped: false })), helpOpen: false };
    });
  const switchToGuided = () => update({ mode: "guided", settings: { ...JE_PRESETS.guided }, helpOpen: false });
  /** First line's memo — the hint. Solution memos win (practice copies blank lines). */
  const hint = (d.solution ?? d.lines).find((l) => l.label)?.label ?? null;

  const addLine = (side: JeSide) =>
    setLines((lines) => {
      const nl: JeLine = { id: cardId("l"), account: "", dr: null, cr: null, side, label: "" };
      return moveLine([...lines, nl], nl.id, side, Number.MAX_SAFE_INTEGER);
    });

  /** Delete honors THE INVARIANT: a side never drops below one block — deleting
   *  the last block on a side re-spawns a blank socket there. */
  const deleteLine = (lid: string) =>
    setLines((lines) => ensureMinLines(lines.filter((x) => x.id !== lid), () => cardId("l")));

  const onDropSlot = (side: JeSide, index: number) => {
    if (!dragLine) return;
    setLines((lines) => moveLine(lines, dragLine, side, index));
    setDragLine(null);
    setHotSocket(null);
  };
  const onDropSwap = (targetId: string) => {
    if (!dragLine || dragLine === targetId) { setDragLine(null); return; }
    setLines((lines) => swapLines(lines, dragLine, targetId));
    setDragLine(null);
    setHotSocket(null);
  };

  const toggleMemoView = (lid: string) =>
    setMemoView((prev) => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid);
      else next.add(lid);
      return next;
    });

  /** Dashed drop socket between blocks — clearly visible, pulsing, hot on hover. */
  const socket = (side: JeSide, index: number, label?: string) => {
    if (!dragLine || !S.showGhosts) return null;
    const key = `${side}-${index}`;
    const hot = hotSocket === key;
    return (
      <div
        className="nodrag grid h-7 place-items-center rounded-lg border-2 border-dashed text-[9.5px] font-bold uppercase tracking-wide"
        style={{
          width: blockW,
          marginLeft: side === "cr" ? ctx.jeIndent : 0,
          borderColor: hot ? NEON.yellow : "rgba(252,163,17,0.7)",
          color: hot ? NEON.yellow : "rgba(252,163,17,0.8)",
          background: hot ? "rgba(252,163,17,0.18)" : "rgba(252,163,17,0.07)",
          animation: "je-socket-pulse 1.1s ease-in-out infinite",
        }}
        onDragOver={(e) => { e.preventDefault(); setHotSocket(key); }}
        onDragLeave={() => setHotSocket((h) => (h === key ? null : h))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSlot(side, index); }}
      >
        {label ?? ""}
      </div>
    );
  };

  const block = (l: JeLine, side: JeSide) => {
    const isCr = side === "cr";
    const trapOn = !!l.flipped && !!l.trap;
    const amt = amountOf(eff(l));
    const isSel = selLine === l.id;
    const empty = !eff(l).account;
    // GUIDED: unfilled template lines render persistently as sockets to fill
    const socketStyle = empty && S.showGhosts;
    return (
      <div key={l.id} className="relative" style={{ marginLeft: isCr ? ctx.jeIndent : 0, width: blockW, opacity: l.hidden ? 0.15 : 1 }}>
        {/* the block — outer edge drags the CLUSTER (no nodrag); inner row is the HTML5 line-drag.
            Clicking ANYWHERE on the block selects it (A6) — the arrows then act on IT. */}
        <div
          className="group/block relative z-[1] rounded-lg px-1.5 py-1"
          style={{
            background: socketStyle ? "rgba(251,249,244,0.06)" : PAPER.card,
            border: socketStyle
              ? "2px dashed rgba(252,163,17,0.55)"
              : `1px solid ${trapOn ? "rgba(194,24,50,0.6)" : isSel ? "#FCA311" : PAPER.cardEdge}`,
            boxShadow: socketStyle
              ? isSel
                ? "0 0 0 2.5px rgba(252,163,17,0.55)"
                : "none"
              : isSel
                ? "0 0 0 2.5px rgba(252,163,17,0.55), 0 10px 22px -12px rgba(0,0,0,0.6)"
                : "0 10px 22px -14px rgba(0,0,0,0.55)",
          }}
          onClick={() => { if (!locked) selectLine(l.id); }}
          onDragOver={(e) => { if (dragLine && dragLine !== l.id) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSwap(l.id); }}
        >
          <div
            className={`nodrag flex items-center gap-1 ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
            draggable={!locked}
            onDragStart={(e) => { if (locked) return; e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragLine(l.id); }}
            onDragEnd={() => { setDragLine(null); setHotSocket(null); }}
          >
            {locked && !empty && <Lock className="h-2.5 w-2.5 shrink-0" style={{ color: PAPER.inkFaint }} />}

            {/* ACCOUNT — reads as an obvious DROPDOWN (A9): border + chevron + hover */}
            <button
              className="group/dd flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[13px] transition-colors"
              style={{
                color: trapOn ? PAPER.red : empty ? (socketStyle ? "rgba(252,163,17,0.85)" : PAPER.inkMuted) : PAPER.ink,
                fontStyle: empty ? "italic" : undefined,
                background: dragLine === l.id ? "rgba(20,33,61,0.08)" : locked ? "transparent" : "rgba(20,33,61,0.03)",
                border: locked ? "1px solid transparent" : "1px solid rgba(20,33,61,0.18)",
              }}
              title={eff(l).account || (S.showPicker ? "Choose account" : "Type the account")}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => { if (!locked) e.currentTarget.style.borderColor = "rgba(20,33,61,0.45)"; }}
              onMouseLeave={(e) => { if (!locked) e.currentTarget.style.borderColor = "rgba(20,33,61,0.18)"; }}
              onClick={(e) => {
                if (locked) return; // review-only
                e.stopPropagation();
                selectLine(l.id);
                if (S.showPicker) setPickerFor(pickerFor?.id === l.id ? null : { id: l.id, anchor: e.currentTarget });
              }}
            >
              <span className="min-w-0 flex-1 truncate">{eff(l).account || "Choose account"}</span>
              {!locked && S.showPicker && (
                <ChevronDown className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover/dd:opacity-90" style={{ color: PAPER.navy }} />
              )}
            </button>
            {pickerFor?.id === l.id && S.showPicker && (
              <CardPopover anchor={pickerFor.anchor} onClose={() => setPickerFor(null)}>
                <CoaPicker
                  groups={ctx.coa}
                  showChips={S.showNormalChips}
                  onPick={(name) => { patchLine(l.id, { account: name }); setPickerFor(null); }}
                  onClose={() => setPickerFor(null)}
                />
              </CardPopover>
            )}
            {!S.showPicker && !locked && (
              <FreeTypeEditor
                line={l}
                onOpen={() => selectLine(l.id)}
                onCommit={(v) => patchLine(l.id, { account: v })}
                names={[...(d.accountBank ?? []), ...ctx.coaNames]}
                cardId={id}
              />
            )}

            {/* AMOUNT — indents WITH its block; ??? IS the permanent no-value state
                and ONE click on it opens amount entry (A8) */}
            <div className="w-20 shrink-0 text-right" style={{ color: trapOn ? PAPER.red : PAPER.ink }}>
              {locked ? (
                <span className={`tabular-nums ${amt == null ? "opacity-30" : ""}`}>{amt == null ? "???" : fmtNum(amt)}</span>
              ) : (
                <EditableNumber
                  value={amt}
                  placeholder="???"
                  clickToEdit
                  onChange={(v) => patchLine(l.id, side === "dr" ? { dr: v, cr: null, side } : { cr: v, dr: null, side })}
                />
              )}
            </div>

            {memoEdit?.id === l.id && (
              <CardPopover anchor={memoEdit.anchor} align="right" onClose={() => setMemoEdit(null)}>
                <MemoPopover
                  value={l.label ?? ""}
                  onSave={(v) => { patchLine(l.id, { label: v }); setMemoEdit(null); }}
                  onClose={() => setMemoEdit(null)}
                />
              </CardPopover>
            )}

            {/* distractor flip */}
            {l.trap && (
              <button
                className="nodrag grid h-5 w-5 shrink-0 place-items-center rounded"
                style={{ color: trapOn ? PAPER.red : PAPER.inkMuted, background: trapOn ? "rgba(194,24,50,0.1)" : "transparent" }}
                title={trapOn ? "Flip back to the correct version" : "Flip to the trap version"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !l.flipped;
                  patchLine(l.id, { flipped: next });
                  setFlipFeedback(next ? l.trap!.feedback : null);
                }}
              >
                <Repeat className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* per-block controls — RIGHT of the block, OUTSIDE the grid (A4):
              lightbulb (memo) then ⊗ delete. Hover-only; review-lock hides edits. */}
          <div
            className="nodrag absolute top-1 z-[2] flex items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100"
            style={{ left: "100%", paddingLeft: 4 }}
          >
            {(S.lightbulbs || l.label) && (!locked || l.label) && (
              <button
                className="grid h-5 w-5 place-items-center rounded-full"
                style={{ color: l.label ? PAPER.gold : PAPER.inkMuted, background: "rgba(251,249,244,0.9)", border: `1px solid ${PAPER.cardEdge}` }}
                title={l.label ? "Show memo" : "Add memo"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (l.label) toggleMemoView(l.id);
                  else if (!locked) setMemoEdit({ id: l.id, anchor: e.currentTarget });
                }}
              >
                <Lightbulb className="h-3 w-3" />
              </button>
            )}
            {!locked && (
              <button
                className="grid h-5 w-5 place-items-center rounded-full"
                style={{ color: PAPER.red, background: "rgba(251,249,244,0.9)", border: "1px solid rgba(194,24,50,0.35)" }}
                title="Delete line"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deleteLine(l.id); }}
              >
                <CircleX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* floating memo note — node space, right of the block, leader line, z-behind */}
        {memoView.has(l.id) && l.label && (
          <div className="absolute top-0 z-0" style={{ left: "100%", width: 190, paddingLeft: 18 }}>
            <div className="absolute top-3 h-px" style={{ left: 0, width: 18, background: "rgba(252,163,17,0.5)" }} />
            <div className="relative rounded-md px-2 py-1 text-[11px] leading-snug" style={{ color: "rgba(244,246,250,0.85)", background: "rgba(20,33,61,0.35)", border: "1px solid rgba(252,163,17,0.25)" }}>
              <button
                className="nodrag absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full"
                style={{ color: NEON.muted, background: "#101B31", border: "1px solid rgba(147,160,180,0.4)" }}
                title="Dismiss"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => toggleMemoView(l.id)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <span
                className={`nodrag ${locked ? "" : "cursor-text"}`}
                title={locked ? undefined : "Click to edit memo"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { if (!locked) setMemoEdit({ id: l.id, anchor: e.currentTarget as HTMLElement }); }}
              >
                {l.label}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSide = (side: JeSide) => {
    const list = side === "dr" ? g.dr : g.cr;
    return (
      <>
        {socket(side, 0)}
        {list.map((l, i) => {
          const raw = d.lines.find((x) => x.id === l.id) ?? l;
          return (
            <div key={l.id} className="flex flex-col gap-1">
              {block(raw, side)}
              {socket(side, i + 1)}
            </div>
          );
        })}
        {dragLine && S.showGhosts ? (
          socket(side, list.length + 1, "new line")
        ) : (
          !locked && (
            // add-line "+" sits in the INDENT NOOK: under the leftmost edge of
            // its own column (A7) — a small chip, not a full-width row
            <button
              className="nodrag grid h-5 w-7 place-items-center rounded-md opacity-0 transition-opacity hover:!opacity-100 group-hover/cluster:opacity-40"
              style={{ color: NEON.muted, border: `1px dashed ${NEON.borderSoft}`, marginLeft: side === "cr" ? ctx.jeIndent : 0 }}
              title={side === "dr" ? "Add debit line" : "Add credit line"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); addLine(side); }}
            >
              <Plus className="h-3 w-3" />
            </button>
          )
        )}
      </>
    );
  };

  const entryType = d.entryType ?? "standard";

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/cluster animate-in fade-in zoom-in-95 relative rounded-2xl duration-150"
      style={{
        width: ctx.jeCardWidth,
        // card-level selection = soft ring around the cluster (no card box)
        boxShadow: arrowPending
          ? `0 0 0 2px ${NEON.cyan}, 0 0 30px -4px ${NEON.cyan}`
          : selected
            ? "0 0 0 1.5px rgba(224,40,74,0.45)"
            : undefined,
        padding: 4,
      }}
    >
      <style>{SOCKET_PULSE_CSS}</style>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* chrome strip — hover/selection only, exactly 3 (A4): deck-toggle · clone · × */}
      <div
        className={`card-actions absolute -top-7 right-1 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover/cluster:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        {d.deckMember ? (
          <ChromeBtn title="Tuck into deck (s)" onClick={tuck}>
            <span className="text-[11px] font-black leading-none">_</span>
          </ChromeBtn>
        ) : (
          <ChromeBtn title="Add to deck (top-right)" onClick={addToDeck}>
            <ArrowUpRight className="h-3 w-3" />
          </ChromeBtn>
        )}
        <button
          title={locked ? "Clone… (locked original stays the answer key)" : "Clone (lands to the right)"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (locked) setCloneMenu(cloneMenu ? null : e.currentTarget); else cloneAs(false); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: cloneMenu ? NEON.yellow : NEON.muted }}
        >
          <Copy className="h-3 w-3" />
        </button>
        <ChromeBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></ChromeBtn>
      </div>
      {cloneMenu && (
        <CardPopover anchor={cloneMenu} align="right" onClose={() => setCloneMenu(null)}>
          <div
            className="nodrag w-56 rounded-lg p-1.5 shadow-xl"
            style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold hover:bg-black/5"
              style={{ color: PAPER.navy }}
              onClick={() => cloneAs(true)}
            >
              Clone as Practice copy
              <span className="block text-[10px] font-normal" style={{ color: PAPER.inkMuted }}>
                blank silhouette for the student — this locked original stays the answer key
              </span>
            </button>
            <button
              className="block w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold hover:bg-black/5"
              style={{ color: PAPER.ink }}
              onClick={() => cloneAs(false)}
            >
              Exact clone
            </button>
          </div>
        </CardPopover>
      )}
      {gearAnchor && (
        <CardPopover anchor={gearAnchor} align="right" onClose={() => setGearAnchor(null)}>
          <GearPanel
            mode={mode}
            settings={S}
            entryType={entryType}
            onMode={(m) => update({ mode: m, settings: { ...JE_PRESETS[m] } })}
            onEntryType={(t) => update({ entryType: t })}
            onPatch={(p) => update({ settings: { ...(d.settings ?? {}), ...p } })}
            onReset={() =>
              updateFn((prev) => {
                const sol = prev.solution as JeLine[] | undefined;
                const cur = (prev.lines as JeLine[]) ?? [];
                return { lines: blankFrom(sol?.length ? sol : cur, () => cardId("l")), helpOpen: false };
              })
            }
            onClose={() => setGearAnchor(null)}
          />
        </CardPopover>
      )}

      {d.helpOpen ? (
        <HelpBack
          width={ctx.jeCardWidth - 8}
          caption={d.caption}
          hint={hint}
          mode={mode}
          mustAttempt={mode === "practice" && !hasAttempt(d.lines)}
          onReveal={revealCorrect}
          onGuided={switchToGuided}
          onFlipBack={flipHelp}
        />
      ) : (
        <>
          {/* badge + floating description (no box) — drags the cluster */}
          <div className="mb-2 flex items-start gap-1.5">
            <span
              className="mt-0.5 shrink-0 rounded px-1 text-[9px] font-black tracking-wider"
              style={{ color: NEON.pink, border: `1px solid rgba(224,40,74,0.55)`, fontFamily: JE_FONT }}
            >
              {BADGE[entryType]}
            </span>
            {locked && (
              <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center" title="Locked for review">
                <Lock className="h-3 w-3" style={{ color: NEON.yellow }} />
              </span>
            )}
            <TitleEditor value={d.caption} readOnly={locked} onCommit={(v) => update({ caption: v })} />
          </div>

          {/* the tetris blocks — tightened (A7): blocks sit close */}
          <div className="flex flex-col gap-1">
            {renderSide("dr")}
            {renderSide("cr")}
          </div>

          {flipFeedback && (
            <div className="mt-2 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.15)", color: "#FF8B9E", border: `1px solid rgba(194,24,50,0.4)`, width: blockW }}>
              {flipFeedback}
            </div>
          )}

          {/* balance pill floats bottom-right of the cluster */}
          <div className="mt-1.5 flex justify-end">
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums"
              style={
                bal.state === "balanced"
                  ? { color: NEON.green, border: `1px solid rgba(59,245,160,0.6)`, background: "rgba(59,245,160,0.1)" }
                  : bal.state === "off"
                    ? { color: "#FF8B9E", border: `1px solid rgba(194,24,50,0.5)`, background: "rgba(194,24,50,0.12)" }
                    : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }
              }
              title={bal.state === "unknown" ? "Some amounts are still ??? — balance unknown" : undefined}
            >
              {bal.state === "balanced" ? "✓ balanced" : bal.state === "off" ? `Δ ${fmtNum(Math.abs(bal.sumDr - bal.sumCr))} ${bal.sumDr - bal.sumCr > 0 ? "DR" : "CR"}` : "?"}
            </span>
          </div>
        </>
      )}

      {/* bottom-right corner group (A4): lock · gear · "?" */}
      <div
        className={`card-actions absolute -bottom-6 right-1 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected || d.helpOpen || locked ? "opacity-100" : "opacity-0 group-hover/cluster:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        <button
          title={locked ? "Unlock — allow drag + edits" : "Lock for review — no drag, no edits (the answer-key state)"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ reviewLock: !locked }); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: locked ? NEON.yellow : NEON.muted }}
        >
          {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </button>
        {!locked && (
          <button
            title="Card settings"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setGearAnchor(gearAnchor ? null : e.currentTarget); }}
            className="nodrag grid h-5 w-5 place-items-center rounded"
            style={{ color: gearAnchor ? NEON.yellow : NEON.muted }}
          >
            <Settings2 className="h-3 w-3" />
          </button>
        )}
        <ChromeBtn title={d.helpOpen ? "Flip back to the entry" : "Stuck? Flip for help"} onClick={flipHelp}>
          {d.helpOpen ? <Undo2 className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}
        </ChromeBtn>
      </div>
    </div>
  );
}

/** The BACK FACE (A2) — navy SURVIVE-back styling, the "stuck?" panel. Reveal is
 *  gated in PRACTICE: no attempt yet → "Try it first" with a Switch-to-Guided out.
 *  Every card type inherits this mechanism later (roadmap). */
function HelpBack({ width, caption, hint, mode, mustAttempt, onReveal, onGuided, onFlipBack }: {
  width: number;
  caption: string;
  hint: string | null;
  mode: JePreset;
  mustAttempt: boolean;
  onReveal: () => void;
  onGuided: () => void;
  onFlipBack: () => void;
}) {
  const [showHint, setShowHint] = useState(false);
  const [gate, setGate] = useState(false); // "Try it first" dialog
  const btn = (label: string, onClick: () => void, opts?: { gold?: boolean; disabled?: boolean }) => (
    <button
      className="nodrag w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold transition-colors disabled:opacity-40"
      style={{
        color: opts?.gold ? "#E8B84B" : "#F4EFE6",
        border: `1px solid ${opts?.gold ? "rgba(232,184,75,0.55)" : "rgba(244,239,230,0.25)"}`,
        background: "rgba(11,15,30,0.45)",
      }}
      disabled={opts?.disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {label}
    </button>
  );
  return (
    <div
      className="animate-in fade-in zoom-in-95 rounded-xl p-3 duration-150"
      style={{ width, background: "#14213D", border: "1px solid rgba(232,184,75,0.55)", boxShadow: "inset 0 0 0 3px rgba(232,184,75,0.25), 0 14px 34px -14px rgba(0,0,0,0.65)" }}
    >
      <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#E8B84B" }}>Stuck?</div>
      {caption && <div className="mb-2 text-[12px] leading-snug" style={{ color: "rgba(244,239,230,0.85)" }}>{caption}</div>}

      {gate ? (
        <div className="rounded-lg p-2" style={{ border: "1px solid rgba(232,184,75,0.4)", background: "rgba(232,184,75,0.08)" }}>
          <p className="mb-2 text-[11.5px] leading-snug" style={{ color: "#F4EFE6" }}>
            <b>Try it first.</b> Put down an account or an amount — even a wrong guess teaches more than peeking.
          </p>
          <div className="flex flex-col gap-1">
            {btn("OK — I'll try", () => { setGate(false); onFlipBack(); })}
            {btn("Switch to Guided instead", onGuided, { gold: true })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {btn("Reveal the correct answer", () => (mustAttempt ? setGate(true) : onReveal()), { gold: true })}
          {hint && btn(showHint ? "Hide hint" : "Hint", () => setShowHint((v) => !v))}
          {mode === "practice" && btn("Switch to Guided", onGuided)}
        </div>
      )}

      {showHint && hint && !gate && (
        <div className="mt-2 rounded px-2 py-1.5 text-[11.5px] leading-snug" style={{ color: "#F4EFE6", background: "rgba(232,184,75,0.12)", border: "1px solid rgba(232,184,75,0.4)" }}>
          <Lightbulb className="mr-1 inline h-3 w-3" style={{ color: "#E8B84B" }} />
          {hint}
        </div>
      )}
    </div>
  );
}

function ChromeBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag grid h-5 w-5 place-items-center rounded transition-colors"
      style={{ color: NEON.muted }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? "#FF5C6C" : "#FCA311")}
      onMouseLeave={(e) => (e.currentTarget.style.color = NEON.muted)}
    >
      {children}
    </button>
  );
}

/** Floating description — Poppins (A11), modern and clean, no box.
 *  At rest it DRAGS the cluster; click (no drag) opens the editor. */
function TitleEditor({ value, readOnly, onCommit }: { value: string; readOnly?: boolean; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing || readOnly) {
    return (
      <span
        className={`min-w-0 flex-1 text-[16.5px] leading-snug ${readOnly ? "" : "cursor-text"}`}
        style={{
          color: value ? "rgba(244,246,250,0.95)" : "rgba(147,160,180,0.7)",
          fontFamily: JE_FONT,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          fontStyle: value ? undefined : "italic",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={value || "New entry"}
        onClick={() => { if (!readOnly) { setLocal(value); setEditing(true); } }}
      >
        {value || "New entry"}
      </span>
    );
  }
  return (
    <textarea
      rows={2}
      autoFocus
      className="nodrag min-w-0 flex-1 resize-none rounded bg-black/30 px-1 py-0.5 text-[16.5px] leading-snug outline-none"
      style={{ color: "rgba(244,246,250,0.95)", fontFamily: JE_FONT, fontWeight: 600 }}
      value={local}
      placeholder="New entry"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { onCommit(local); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommit(local); setEditing(false); }
        if (e.key === "Escape") setEditing(false);
        e.stopPropagation();
      }}
    />
  );
}

/** Free-text account entry when the picker is off (PRACTICE): one click to type. */
function FreeTypeEditor({ line, onOpen, onCommit, names, cardId: cid }: { line: JeLine; onOpen?: () => void; onCommit: (v: string) => void; names: string[]; cardId: string }) {
  const listId = `bank-${cid}-${line.id}`;
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <span
        className="absolute inset-0 cursor-text"
        onClick={(e) => { e.stopPropagation(); onOpen?.(); setOpen(true); }}
        title="Click to type the account"
      />
    );
  }
  return (
    <>
      <datalist id={listId}>{[...new Set(names)].map((n) => <option key={n} value={n} />)}</datalist>
      <input
        autoFocus
        list={listId}
        defaultValue={line.account}
        placeholder="Account"
        className="nodrag absolute inset-0 w-full rounded bg-white px-1.5 py-0.5 text-[13px] outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
        style={{ color: PAPER.ink }}
        onBlur={(e) => { onCommit(e.target.value); setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit((e.target as HTMLInputElement).value); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
          e.stopPropagation();
        }}
      />
    </>
  );
}

function MemoPopover({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [local, setLocal] = useState(value);
  return (
    <div
      className="nodrag w-52 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFF9E8", border: "1px solid rgba(138,90,0,0.35)", boxShadow: "0 14px 30px -10px rgba(20,33,61,0.4)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <Lightbulb className="h-3 w-3" style={{ color: PAPER.gold }} />
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "#8A5A00" }}>Memo</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Dismiss"><X className="h-3 w-3" /></button>
      </div>
      <textarea
        rows={3}
        autoFocus
        className="w-full resize-none rounded bg-white/70 px-1.5 py-1 text-[11.5px] leading-snug outline-none"
        style={{ color: PAPER.ink, border: `1px solid ${PAPER.line}` }}
        value={local}
        placeholder="Why this line…"
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
      />
      <div className="mt-1 text-right">
        <button
          className="rounded px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.35)" }}
          onClick={() => onSave(local)}
        >
          save
        </button>
      </div>
    </div>
  );
}

/** Gear contents (A10): mode · entry type · normal-balance chips · RESET.
 *  Amounts-visible and picker-search are gone — they're always-on now. */
function GearPanel({ mode, settings, entryType, onMode, onEntryType, onPatch, onReset, onClose }: {
  mode: JePreset;
  settings: JeSettings;
  entryType: (typeof ENTRY_TYPES)[number];
  onMode: (m: JePreset) => void;
  onEntryType: (t: (typeof ENTRY_TYPES)[number]) => void;
  onPatch: (p: Partial<JeSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="nodrag w-52 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center">
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>This entry</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close"><X className="h-3 w-3" /></button>
      </div>
      {/* MODE — guided teaches, practice tests (reveal gated behind an attempt) */}
      <div className="mb-1.5 flex gap-1">
        {(["guided", "practice"] as const).map((m) => (
          <button
            key={m}
            className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
            style={{
              color: mode === m ? "#FFFFFF" : PAPER.navy,
              background: mode === m ? PAPER.navy : "transparent",
              border: "1px solid rgba(20,33,61,0.35)",
            }}
            title={m === "guided" ? "Picker + chips + memos; reveal is free" : "Free-type; reveal requires an attempt"}
            onClick={() => onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {/* entry type — the corner badge follows (JE → ADJ → CL) */}
      <div className="mb-1.5 flex gap-1">
        {ENTRY_TYPES.map((t) => (
          <button
            key={t}
            className="flex-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase"
            style={{
              color: entryType === t ? "#FFFFFF" : PAPER.navy,
              background: entryType === t ? PAPER.navy : "transparent",
              border: "1px solid rgba(20,33,61,0.35)",
            }}
            onClick={() => onEntryType(t)}
          >
            {BADGE[t]}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11.5px]" style={{ color: PAPER.ink }}>
        <input type="checkbox" checked={settings.showNormalChips} onChange={(e) => onPatch({ showNormalChips: e.target.checked })} style={{ accentColor: "#14213D" }} />
        Normal-balance chips
      </label>
      <button
        className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: PAPER.red, border: "1px solid rgba(194,24,50,0.4)", background: "rgba(194,24,50,0.05)" }}
        title="Blank the lines back to an unattempted silhouette (Ctrl+Z restores)"
        onClick={() => { onReset(); onClose(); }}
      >
        reset attempt
      </button>
    </div>
  );
}
