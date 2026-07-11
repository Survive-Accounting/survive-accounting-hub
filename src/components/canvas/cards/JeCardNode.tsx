// JE card v2 — header IS the transaction description; lines are draggable chips
// with ghost slots (move) and drop-onto-swap; amounts render "???" until valued
// (distinct from the reveal system's covered blanks); memos live behind
// lightbulbs; every card shares the scene-wide width; a gear holds the toggles
// + GUIDED / PRACTICE / BLIND presets. Every mutation is a dispatcher command.
import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Lightbulb, Plus, Repeat, Settings2, X } from "lucide-react";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
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

/** Effective line honoring a flipped trap. Trap amounts may cross columns, so a
 *  flipped line drops its explicit side and re-derives from the trap amounts. */
function eff(l: JeLine): JeLine {
  if (!l.flipped || !l.trap) return l;
  const dr = l.trap.dr !== undefined ? l.trap.dr : l.dr;
  const cr = l.trap.cr !== undefined ? l.trap.cr : l.cr;
  return { ...l, account: l.trap.account ?? l.account, dr, cr, side: l.trap.dr !== undefined || l.trap.cr !== undefined ? undefined : l.side };
}

export function JeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as JeCard;
  const rf = useReactFlow();
  const { update, updateFn } = useCardActions(id);
  const ctx = useCanvasSettings();
  const S = effectiveSettings(d.settings, ctx.jePreset, d.showAmounts);

  const [flipFeedback, setFlipFeedback] = useState<string | null>(null);
  const [dragLine, setDragLine] = useState<string | null>(null);
  const [memoOpen, setMemoOpen] = useState<string | null>(null); // lightbulb popover / memo editor
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const selLine = (data as Record<string, unknown>)._selLine as string | undefined;

  // All line mutations run through the dispatcher via updateFn (absolute patches).
  const setLines = (mk: (lines: JeLine[]) => JeLine[]) => updateFn((prev) => ({ lines: mk((prev.lines as JeLine[]) ?? []) }));
  const patchLine = (lid: string, patch: Partial<JeLine>) => setLines((lines) => lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)));

  const effLines = d.lines.map(eff);
  const g = groupLines(effLines);
  const bal = balanceState(effLines);

  const selectLine = (lid: string | null) => rf.updateNodeData(id, { _selLine: lid ?? undefined }); // transient, not undoable

  const addLine = (side: JeSide) =>
    setLines((lines) => {
      const nl: JeLine = { id: cardId("l"), account: "", dr: null, cr: null, side, label: "" };
      return moveLine([...lines, nl], nl.id, side, Number.MAX_SAFE_INTEGER);
    });

  // ---- drag & drop (HTML5; chips are nodrag so React Flow ignores them) ----
  const onDropSlot = (side: JeSide, index: number) => {
    if (!dragLine) return;
    setLines((lines) => moveLine(lines, dragLine, side, index));
    setDragLine(null);
  };
  const onDropSwap = (targetId: string) => {
    if (!dragLine || dragLine === targetId) { setDragLine(null); return; }
    setLines((lines) => swapLines(lines, dragLine, targetId));
    setDragLine(null);
  };

  const slot = (side: JeSide, index: number, label?: string) =>
    dragLine && S.showGhosts ? (
      <div
        className="nodrag my-0.5 grid h-5 place-items-center rounded border border-dashed text-[9px] font-semibold uppercase tracking-wide"
        style={{
          borderColor: "rgba(20,33,61,0.35)",
          color: PAPER.inkMuted,
          background: "rgba(20,33,61,0.04)",
          marginLeft: side === "cr" ? 22 : 0,
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSlot(side, index); }}
      >
        {label ?? ""}
      </div>
    ) : null;

  const lineRow = (l: JeLine, side: JeSide) => {
    const isCr = side === "cr";
    const trapOn = !!l.flipped && !!l.trap;
    const amt = amountOf(eff(l));
    const isSel = selLine === l.id;
    return (
      <div
        className="group/line relative flex items-center gap-1 py-0.5"
        style={{ opacity: l.hidden ? 0.18 : 1, paddingLeft: isCr ? 22 : 0 }}
      >
        {/* delete appears on hover, left of the account */}
        <button
          className="nodrag absolute top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity group-hover/line:opacity-100"
          style={{ color: PAPER.red, background: "rgba(194,24,50,0.08)", left: isCr ? 2 : -6 }}
          title="Delete line"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setLines((lines) => lines.filter((x) => x.id !== l.id)); }}
        >
          <X className="h-2.5 w-2.5" />
        </button>

        {/* ACCOUNT CHIP — draggable; drop another chip on it to SWAP sides */}
        <div
          className="nodrag relative min-w-0 flex-1"
          draggable
          onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragLine(l.id); }}
          onDragEnd={() => setDragLine(null)}
          onDragOver={(e) => { if (dragLine && dragLine !== l.id) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSwap(l.id); }}
        >
          <button
            className="w-full cursor-grab truncate rounded px-1.5 py-0.5 text-left text-[13px] active:cursor-grabbing"
            style={{
              color: trapOn ? PAPER.red : (l.flipped && l.trap?.account) || l.account ? PAPER.ink : PAPER.inkMuted,
              background: isSel ? "rgba(252,163,17,0.14)" : dragLine === l.id ? "rgba(20,33,61,0.08)" : "transparent",
              border: `1px solid ${isSel ? "rgba(252,163,17,0.6)" : "transparent"}`,
              fontStyle: l.account ? undefined : "italic",
              ...(trapOn ? { color: PAPER.red } : {}),
            }}
            title={eff(l).account || "Choose account"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              selectLine(isSel ? null : l.id);
              if (S.showPicker) setPickerFor(pickerFor === l.id ? null : l.id);
            }}
          >
            {eff(l).account || "Choose account"}
          </button>
          {pickerFor === l.id && S.showPicker && (
            <CoaPicker
              groups={ctx.coa}
              allowSearch={S.allowSearch}
              showChips={S.showNormalChips}
              onPick={(name) => { patchLine(l.id, { account: name }); setPickerFor(null); }}
              onClose={() => setPickerFor(null)}
            />
          )}
          {!S.showPicker && (
            <FreeTypeEditor line={l} onCommit={(v) => patchLine(l.id, { account: v })} names={[...(d.accountBank ?? []), ...ctx.coaNames]} cardId={id} />
          )}
        </div>

        {/* AMOUNT — "???" until valued (distinct from the reveal system's cover) */}
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

        {/* MEMO: hover + adds; lightbulb shows */}
        {S.lightbulbs && (
          <div className="relative w-5 shrink-0">
            {l.label ? (
              <button
                className="nodrag grid h-5 w-5 place-items-center"
                style={{ color: PAPER.gold }}
                title="Show memo"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setMemoOpen(memoOpen === l.id ? null : l.id); }}
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                className="nodrag grid h-5 w-5 place-items-center opacity-0 transition-opacity group-hover/line:opacity-60"
                style={{ color: PAPER.inkMuted }}
                title="Add memo"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setMemoOpen(l.id); }}
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {memoOpen === l.id && (
              <MemoPopover
                value={l.label ?? ""}
                onSave={(v) => { patchLine(l.id, { label: v }); setMemoOpen(null); }}
                onClose={() => setMemoOpen(null)}
              />
            )}
          </div>
        )}

        {/* distractor flip stays as-is */}
        {l.trap && (
          <IconBtn
            title={trapOn ? "Flip back to the correct version" : "Flip to the trap version"}
            active={trapOn}
            onClick={() => {
              const next = !l.flipped;
              patchLine(l.id, { flipped: next });
              setFlipFeedback(next ? l.trap!.feedback : null);
            }}
          >
            <Repeat className="h-3 w-3" />
          </IconBtn>
        )}
      </div>
    );
  };

  const renderSide = (side: JeSide) => {
    const list = side === "dr" ? g.dr : g.cr;
    return (
      <div>
        {slot(side, 0)}
        {list.map((l, i) => {
          const raw = d.lines.find((x) => x.id === l.id) ?? l;
          return (
            <div key={l.id}>
              {lineRow(raw, side)}
              {slot(side, i + 1)}
            </div>
          );
        })}
        {dragLine && S.showGhosts ? (
          slot(side, list.length + 1, "new line")
        ) : (
          <button
            className="nodrag grid h-4 w-full place-items-center rounded opacity-0 transition-opacity hover:!opacity-100 group-hover/card:opacity-35"
            style={{ color: PAPER.inkMuted, marginLeft: side === "cr" ? 22 : 0, width: side === "cr" ? "calc(100% - 22px)" : "100%" }}
            title={side === "dr" ? "Add debit line" : "Add credit line"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); addLine(side); }}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const entryType = d.entryType ?? "standard";

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.pink}
      kindBadge="JE"
      noEditBtn
      noResize
      fixedWidth={ctx.jeCardWidth}
      titleNode={
        <div className="nodrag min-w-0 flex-1" onPointerDown={(e) => e.stopPropagation()}>
          <TitleEditor value={d.caption} onCommit={(v) => update({ caption: v })} />
        </div>
      }
      headerRight={
        <>
          <button
            title={`Entry type: ${entryType} (click to cycle)`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              update({ entryType: ENTRY_TYPES[(ENTRY_TYPES.indexOf(entryType) + 1) % ENTRY_TYPES.length] });
            }}
            className="nodrag rounded px-1 text-[8.5px] font-bold uppercase tracking-wide"
            style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.45)" }}
          >
            {entryType.slice(0, 3)}
          </button>
          <IconBtn title="Card settings" active={gearOpen} onClick={() => setGearOpen((v) => !v)}>
            <Settings2 className="h-3 w-3" />
          </IconBtn>
        </>
      }
    >
      <div className="group/card relative">
        {gearOpen && (
          <GearPanel
            settings={S}
            onPatch={(p) => update({ settings: { ...(d.settings ?? {}), ...p } })}
            onPreset={(preset) => update({ settings: { ...JE_PRESETS[preset] } })}
            onClose={() => setGearOpen(false)}
          />
        )}

        {renderSide("dr")}
        {renderSide("cr")}

        {flipFeedback && (
          <div className="mt-1.5 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.07)", color: PAPER.red, border: `1px solid rgba(194,24,50,0.3)` }}>
            {flipFeedback}
          </div>
        )}

        <div className="mt-1.5 flex items-center">
          {S.showAmounts && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-all"
              style={
                bal.state === "balanced"
                  ? { color: PAPER.green, border: `1px solid ${PAPER.green}`, background: "rgba(30,127,79,0.08)" }
                  : bal.state === "off"
                    ? { color: PAPER.red, border: `1px solid rgba(194,24,50,0.4)` }
                    : { color: PAPER.inkMuted, border: `1px solid ${PAPER.line}` }
              }
              title={bal.state === "unknown" ? "Some amounts are still ??? — balance unknown" : undefined}
            >
              {bal.state === "balanced" ? "✓ balanced" : bal.state === "off" ? `Δ ${fmtNum(Math.abs(bal.sumDr - bal.sumCr))} ${bal.sumDr - bal.sumCr > 0 ? "DR" : "CR"}` : "?"}
            </span>
          )}
        </div>
      </div>
    </BaseCard>
  );
}

/** Header description editor — inline, truncated at rest, textarea while editing. */
function TitleEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        className="block w-full truncate text-left text-[12px] font-semibold"
        style={{ color: "#E8EDF6", fontStyle: value ? undefined : "italic", opacity: value ? 1 : 0.65 }}
        title={value || "New entry"}
        onClick={() => { setLocal(value); setEditing(true); }}
      >
        {value || "New entry"}
      </button>
    );
  }
  return (
    <textarea
      rows={2}
      autoFocus
      className="w-full resize-none rounded bg-black/25 px-1 py-0.5 text-[12px] font-semibold outline-none"
      style={{ color: "#E8EDF6" }}
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

/** Free-text account entry when the picker is off (PRACTICE/BLIND): dbl-click to type;
 *  datalist autocomplete stays wired to the COA + the card's account bank. */
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
      className="nodrag absolute right-0 top-6 z-30 w-52 rounded-lg p-2 shadow-xl"
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

function GearPanel({ settings, onPatch, onPreset, onClose }: {
  settings: JeSettings;
  onPatch: (p: Partial<JeSettings>) => void;
  onPreset: (p: JePreset) => void;
  onClose: () => void;
}) {
  const toggles: { key: keyof JeSettings; label: string }[] = [
    { key: "showPicker", label: "Account picker" },
    { key: "allowSearch", label: "Picker search" },
    { key: "showNormalChips", label: "Normal-balance chips" },
    { key: "showGhosts", label: "Ghost template slots" },
    { key: "lightbulbs", label: "Memo lightbulbs" },
    { key: "showAmounts", label: "Amounts visible" },
  ];
  return (
    <div
      className="nodrag absolute right-0 top-0 z-40 w-48 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center">
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>This card</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close"><X className="h-3 w-3" /></button>
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
