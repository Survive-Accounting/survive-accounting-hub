// JE card v3 — TETRIS. No card rectangle: the entry is a CLUSTER of per-line
// blocks on the whiteboard. Debit blocks sit flush left, credit blocks offset
// right by the scene-wide jeIndent; every block is the same fixed width
// (jeCardWidth − jeIndent), so identical DR/CR patterns read as identical
// silhouettes. The transaction description floats above in marker font with a
// JE/ADJ/CL corner badge; chrome (deck/clone/gear/×) appears only on hover or
// selection; memos float to the RIGHT of their block with a leader line.
// Everything mutates through the command bus; popovers ride CardPopover.
import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Copy, Lightbulb, Plus, Repeat, Settings2, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { CoaPicker } from "./CoaPicker";
import { EditableNumber, fmtNum } from "../ui";
import { NEON, PAPER } from "../theme";
import {
  JE_PRESETS,
  amountOf,
  balanceState,
  effectiveSettings,
  groupLines,
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
  const { update, updateFn, remove, toFront, duplicate, stage } = useCardActions(id);
  const ctx = useCanvasSettings();
  const S = effectiveSettings(d.settings, ctx.jePreset, d.showAmounts);

  const [flipFeedback, setFlipFeedback] = useState<string | null>(null);
  const [dragLine, setDragLine] = useState<string | null>(null);
  const [hotSocket, setHotSocket] = useState<string | null>(null); // "side-index" under the dragged block
  const [memoView, setMemoView] = useState<Set<string>>(new Set()); // floating notes open
  const [memoEdit, setMemoEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [pickerFor, setPickerFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [gearAnchor, setGearAnchor] = useState<HTMLElement | null>(null);
  const selLine = (data as Record<string, unknown>)._selLine as string | undefined;
  const arrowPending = !!(data as Record<string, unknown>)._arrowPending;

  const blockW = ctx.jeCardWidth - ctx.jeIndent;

  const setLines = (mk: (lines: JeLine[]) => JeLine[]) => updateFn((prev) => ({ lines: mk((prev.lines as JeLine[]) ?? []) }));
  const patchLine = (lid: string, patch: Partial<JeLine>) => setLines((lines) => lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const selectLine = (lid: string | null) => rf.updateNodeData(id, { _selLine: lid ?? undefined }); // transient

  const effLines = d.lines.map(eff);
  const g = groupLines(effLines);
  const bal = balanceState(effLines);

  const addLine = (side: JeSide) =>
    setLines((lines) => {
      const nl: JeLine = { id: cardId("l"), account: "", dr: null, cr: null, side, label: "" };
      return moveLine([...lines, nl], nl.id, side, Number.MAX_SAFE_INTEGER);
    });

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
        {/* the block — outer edge drags the CLUSTER (no nodrag); inner row is the HTML5 line-drag */}
        <div
          className="group/block relative z-[1] rounded-lg px-1.5 py-1"
          style={{
            background: socketStyle ? "rgba(251,249,244,0.06)" : PAPER.card,
            border: socketStyle
              ? "2px dashed rgba(252,163,17,0.55)"
              : `1px solid ${trapOn ? "rgba(194,24,50,0.6)" : isSel ? "rgba(252,163,17,0.75)" : PAPER.cardEdge}`,
            boxShadow: socketStyle ? "none" : isSel ? "0 0 0 2px rgba(252,163,17,0.35), 0 10px 22px -12px rgba(0,0,0,0.6)" : "0 10px 22px -14px rgba(0,0,0,0.55)",
          }}
          onDragOver={(e) => { if (dragLine && dragLine !== l.id) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSwap(l.id); }}
        >
          <div
            className="nodrag flex cursor-grab items-center gap-1 active:cursor-grabbing"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragLine(l.id); }}
            onDragEnd={() => { setDragLine(null); setHotSocket(null); }}
          >
            {/* delete on hover, far left */}
            <button
              className="nodrag -ml-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 transition-opacity group-hover/block:opacity-100"
              style={{ color: PAPER.red, background: "rgba(194,24,50,0.08)" }}
              title="Delete line"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setLines((lines) => lines.filter((x) => x.id !== l.id)); }}
            >
              <X className="h-2.5 w-2.5" />
            </button>

            {/* ACCOUNT */}
            <button
              className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[13px]"
              style={{
                color: trapOn ? PAPER.red : empty ? (socketStyle ? "rgba(252,163,17,0.85)" : PAPER.inkMuted) : PAPER.ink,
                fontStyle: empty ? "italic" : undefined,
                background: dragLine === l.id ? "rgba(20,33,61,0.08)" : "transparent",
              }}
              title={eff(l).account || "Choose account"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                selectLine(isSel ? null : l.id);
                if (S.showPicker) setPickerFor(pickerFor?.id === l.id ? null : { id: l.id, anchor: e.currentTarget });
              }}
            >
              {eff(l).account || "Choose account"}
            </button>
            {pickerFor?.id === l.id && S.showPicker && (
              <CardPopover anchor={pickerFor.anchor} onClose={() => setPickerFor(null)}>
                <CoaPicker
                  groups={ctx.coa}
                  allowSearch={S.allowSearch}
                  showChips={S.showNormalChips}
                  onPick={(name) => { patchLine(l.id, { account: name }); setPickerFor(null); }}
                  onClose={() => setPickerFor(null)}
                />
              </CardPopover>
            )}
            {!S.showPicker && (
              <FreeTypeEditor line={l} onCommit={(v) => patchLine(l.id, { account: v })} names={[...(d.accountBank ?? []), ...ctx.coaNames]} cardId={id} />
            )}

            {/* AMOUNT — indents WITH its block; ??? until valued */}
            <div className="w-20 shrink-0 text-right" style={{ color: trapOn ? PAPER.red : PAPER.ink }}>
              {S.showAmounts ? (
                <EditableNumber
                  value={amt}
                  placeholder="???"
                  onChange={(v) => patchLine(l.id, side === "dr" ? { dr: v, cr: null, side } : { cr: v, dr: null, side })}
                />
              ) : (
                <span className="inline-block h-3 w-12 rounded-sm align-middle" style={{ background: "rgba(20,33,61,0.12)" }} />
              )}
            </div>

            {/* memo lightbulb on block hover */}
            {S.lightbulbs && (
              <button
                className={`nodrag grid h-5 w-5 shrink-0 place-items-center transition-opacity ${l.label ? "" : "opacity-0 group-hover/block:opacity-60"}`}
                style={{ color: l.label ? PAPER.gold : PAPER.inkMuted }}
                title={l.label ? "Show memo" : "Add memo"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (l.label) toggleMemoView(l.id);
                  else setMemoEdit({ id: l.id, anchor: e.currentTarget });
                }}
              >
                {l.label ? <Lightbulb className="h-3.5 w-3.5" /> : <Plus className="h-3 w-3" />}
              </button>
            )}
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
                className="nodrag cursor-text"
                title="Click to edit memo"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => setMemoEdit({ id: l.id, anchor: e.currentTarget as HTMLElement })}
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
            <div key={l.id} className="flex flex-col gap-2">
              {block(raw, side)}
              {socket(side, i + 1)}
            </div>
          );
        })}
        {dragLine && S.showGhosts ? (
          socket(side, list.length + 1, "new line")
        ) : (
          <button
            className="nodrag grid h-4 place-items-center rounded opacity-0 transition-opacity hover:!opacity-100 group-hover/cluster:opacity-30"
            style={{ color: NEON.muted, width: blockW, marginLeft: side === "cr" ? ctx.jeIndent : 0 }}
            title={side === "dr" ? "Add debit line" : "Add credit line"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); addLine(side); }}
          >
            <Plus className="h-3 w-3" />
          </button>
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

      {/* chrome strip — hover/selection only: deck-toggle · clone · gear · × */}
      <div
        className={`card-actions absolute -top-7 right-1 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover/cluster:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        <ChromeBtn title="Tuck into deck (s)" onClick={stage}>
          <span className="text-[11px] font-black leading-none">_</span>
        </ChromeBtn>
        <ChromeBtn title="Clone (stacks above)" onClick={duplicate}><Copy className="h-3 w-3" /></ChromeBtn>
        <button
          title="Card settings"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setGearAnchor(gearAnchor ? null : e.currentTarget); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: gearAnchor ? NEON.yellow : NEON.muted }}
        >
          <Settings2 className="h-3 w-3" />
        </button>
        <ChromeBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></ChromeBtn>
      </div>
      {gearAnchor && (
        <CardPopover anchor={gearAnchor} align="right" onClose={() => setGearAnchor(null)}>
          <GearPanel
            settings={S}
            entryType={entryType}
            onEntryType={(t) => update({ entryType: t })}
            onPatch={(p) => update({ settings: { ...(d.settings ?? {}), ...p } })}
            onPreset={(preset) => update({ settings: { ...JE_PRESETS[preset] } })}
            onClose={() => setGearAnchor(null)}
          />
        </CardPopover>
      )}

      {/* badge + floating description (marker font, no box) — drags the cluster */}
      <div className="mb-2 flex items-start gap-1.5">
        <span
          className="mt-0.5 shrink-0 rounded px-1 text-[9px] font-black tracking-wider"
          style={{ color: NEON.pink, border: `1px solid rgba(224,40,74,0.55)` }}
        >
          {BADGE[entryType]}
        </span>
        <TitleEditor value={d.caption} onCommit={(v) => update({ caption: v })} />
      </div>

      {/* the tetris blocks */}
      <div className="flex flex-col gap-2">
        {renderSide("dr")}
        {renderSide("cr")}
      </div>

      {flipFeedback && (
        <div className="mt-2 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.15)", color: "#FF8B9E", border: `1px solid rgba(194,24,50,0.4)`, width: blockW }}>
          {flipFeedback}
        </div>
      )}

      {/* balance pill floats bottom-right of the cluster */}
      {S.showAmounts && (
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

/** Floating description — marker font, light on the whiteboard, no box.
 *  At rest it DRAGS the cluster; click (no drag) opens the editor. */
function TitleEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span
        className="min-w-0 flex-1 cursor-text text-[14.5px] font-semibold leading-snug"
        style={{
          color: value ? "rgba(244,246,250,0.92)" : "rgba(147,160,180,0.7)",
          fontFamily: "'Comic Sans MS', 'Segoe Print', cursive",
          fontStyle: value ? undefined : "italic",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={value || "New entry"}
        onClick={() => { setLocal(value); setEditing(true); }}
      >
        {value || "New entry"}
      </span>
    );
  }
  return (
    <textarea
      rows={2}
      autoFocus
      className="nodrag min-w-0 flex-1 resize-none rounded bg-black/30 px-1 py-0.5 text-[14.5px] font-semibold leading-snug outline-none"
      style={{ color: "rgba(244,246,250,0.92)", fontFamily: "'Comic Sans MS', 'Segoe Print', cursive" }}
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

/** Free-text account entry when the picker is off (PRACTICE/BLIND): dbl-click to type. */
function FreeTypeEditor({ line, onCommit, names, cardId: cid }: { line: JeLine; onCommit: (v: string) => void; names: string[]; cardId: string }) {
  const listId = `bank-${cid}-${line.id}`;
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <span
        className="absolute inset-0 cursor-text"
        onDoubleClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Double-click to type the account"
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

function GearPanel({ settings, entryType, onEntryType, onPatch, onPreset, onClose }: {
  settings: JeSettings;
  entryType: (typeof ENTRY_TYPES)[number];
  onEntryType: (t: (typeof ENTRY_TYPES)[number]) => void;
  onPatch: (p: Partial<JeSettings>) => void;
  onPreset: (p: JePreset) => void;
  onClose: () => void;
}) {
  const toggles: { key: keyof JeSettings; label: string }[] = [
    { key: "showPicker", label: "Account picker" },
    { key: "allowSearch", label: "Picker search" },
    { key: "showNormalChips", label: "Normal-balance chips" },
    { key: "showGhosts", label: "Ghost template sockets" },
    { key: "lightbulbs", label: "Memo lightbulbs" },
    { key: "showAmounts", label: "Amounts visible" },
  ];
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
      {/* entry type lives here now; the corner badge follows (JE → ADJ → CL) */}
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
      {toggles.map((t) => (
        <label key={t.key} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11.5px]" style={{ color: PAPER.ink }}>
          <input type="checkbox" checked={settings[t.key]} onChange={(e) => onPatch({ [t.key]: e.target.checked })} style={{ accentColor: "#14213D" }} />
          {t.label}
        </label>
      ))}
      <div className="mt-1.5 flex gap-1">
        {(["guided", "practice", "blind"] as const).map((p) => (
          <button
            key={p}
            className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
            style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.35)" }}
            onClick={() => onPreset(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
