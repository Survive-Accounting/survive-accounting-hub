// CEQ SET PREVIEWER (Lee) — a wide, center-screen modal for ORGANIZING a CEQ set
// before filming. Shows every question full (stem + all choices, correct marked),
// the total card count, and lets you REORDER them (drag or ↑/↓) into the exact
// pedagogical order they'll deal in. The set's `accounts` array order IS the deal
// order (dealSetIntoFrame reads it), so reordering here is the single source of
// truth. "Auto-sort" seeds an easy→hard starting order you then tweak.
//
// Phase 2 (memos in the previewer) lands on top of this shell.
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowDownUp, GripVertical, X } from "lucide-react";

import { correctFor, fillStem, filmOrder, type CeqSetAccount, type CeqSetDef } from "./ceq-set";
import { NEON } from "./theme";

const DIFF_TONE: Record<string, string> = { easy: "#3BF5A0", medium: NEON.yellow, hard: "#FF8B9E" };

export function CeqSetPreviewer({ set, setCeqSets, onClose }: {
  set: CeqSetDef;
  setCeqSets: (fn: (prev: CeqSetDef[]) => CeqSetDef[]) => void;
  onClose: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const includedCount = set.accounts.filter((a) => a.include).length;

  const patchAccounts = (fn: (accs: CeqSetAccount[]) => CeqSetAccount[]) =>
    setCeqSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, accounts: fn(s.accounts) } : s)));

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    patchAccounts((accs) => { const arr = accs.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m); return arr; });
  };
  const move = (i: number, dir: -1 | 1) => reorder(i, i + dir);
  const toggleInclude = (accountId: string) =>
    patchAccounts((accs) => accs.map((a) => (a.accountId === accountId ? { ...a, include: !a.include } : a)));
  const autoSort = () =>
    patchAccounts((accs) => [...filmOrder(accs), ...accs.filter((a) => !a.include)]);

  // position label counts only INCLUDED cards (that's the deal order); excluded rows show "–".
  let dealPos = 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-6" style={{ background: "rgba(6,10,20,0.72)" }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>{set.name}</div>
            <div className="text-[10.5px]" style={{ color: NEON.muted }}>{includedCount} card{includedCount === 1 ? "" : "s"} · deal order = the order below · drag or ↑/↓ to reorder</div>
          </div>
          <button className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title="Seed a starting order: easy → hard, bouncing answer types so consecutive answers differ. You can then tweak by hand." onClick={autoSort}>
            <ArrowDownUp className="h-3 w-3" /> auto-sort
          </button>
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close (Esc)" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        {/* question list */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {set.accounts.length === 0 && <div className="grid place-items-center py-10 text-[12px]" style={{ color: NEON.muted }}>This set has no questions yet.</div>}
          {set.accounts.map((a, i) => {
            const answer = correctFor(a);
            const stem = fillStem(set, a.name);
            const on = a.include;
            if (on) dealPos += 1;
            const isDragging = dragFrom === i;
            const isOver = dragOver === i && dragFrom !== null && dragFrom !== i;
            return (
              <div
                key={a.accountId}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) reorder(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                className="flex items-start gap-2 rounded-lg p-2"
                style={{
                  background: on ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.25)",
                  border: `1px solid ${isOver ? NEON.yellow : NEON.borderSoft}`,
                  opacity: isDragging ? 0.4 : on ? 1 : 0.55,
                }}
              >
                {/* drag handle + up/down */}
                <div className="flex flex-col items-center gap-0.5 pt-0.5" style={{ color: NEON.muted }}>
                  <GripVertical className="h-3.5 w-3.5 cursor-grab active:cursor-grabbing" />
                  <button disabled={i === 0} className="grid h-4 w-4 place-items-center rounded transition-opacity disabled:opacity-25" title="Move earlier" onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></button>
                  <button disabled={i === set.accounts.length - 1} className="grid h-4 w-4 place-items-center rounded transition-opacity disabled:opacity-25" title="Move later" onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></button>
                </div>
                {/* deal position */}
                <div className="w-6 shrink-0 pt-0.5 text-center text-[11px] font-bold tabular-nums" style={{ color: on ? NEON.yellow : NEON.muted }}>{on ? dealPos : "–"}</div>
                {/* include toggle + difficulty */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  <input type="checkbox" checked={on} onChange={() => toggleInclude(a.accountId)} title={on ? "Included — click to exclude from the deal" : "Excluded — click to include"} style={{ accentColor: "#FCA311" }} />
                  <span className="rounded px-1 text-[8px] font-bold uppercase" style={{ color: DIFF_TONE[a.difficulty] ?? NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title={`Difficulty: ${a.difficulty}`}>{a.difficulty[0]}</span>
                </div>
                {/* stem + choices */}
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold leading-snug" style={{ color: NEON.text }}>{stem}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {set.options.map((opt) => {
                      const correct = opt === answer;
                      return (
                        <span key={opt} className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={correct
                            ? { color: "#0B1322", background: "#3BF5A0", border: "1px solid #3BF5A0" }
                            : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
                          title={correct ? "Correct answer" : undefined}>
                          {opt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 text-[9.5px]" style={{ color: NEON.muted, borderTop: `1px solid ${NEON.borderSoft}` }}>
          Reordering here sets the deal order. When you're ready, enter a frame and hit the stack-deal button on this set. (Memos in the previewer are next.)
        </div>
      </div>
    </div>
  );
}
