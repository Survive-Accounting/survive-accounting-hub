// CEQ SET PREVIEWER (Lee) — a wide, center-screen modal for ORGANIZING a CEQ set
// before filming. Shows every question full (stem + all choices, correct marked),
// the total card count, and lets you REORDER them (drag or ↑/↓) into the exact
// pedagogical order they'll deal in. The set's `accounts` array order IS the deal
// order (dealSetIntoFrame reads it), so reordering here is the single source of
// truth. "Auto-sort" seeds an easy→hard starting order you then tweak.
//
// Phase 2 (memos in the previewer) lands on top of this shell.
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowDownUp, GripVertical, StickyNote, X } from "lucide-react";

import { correctFor, fillStem, filmOrder, type CeqSetAccount, type CeqSetDef, type CeqSetMemo } from "./ceq-set";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { NEON } from "./theme";
import { cardId, type MemoKind } from "./types";

const DIFF_TONE: Record<string, string> = { easy: "#3BF5A0", medium: NEON.yellow, hard: "#FF8B9E" };

// Category → memo kind (drives the card's icon/accent). Uncategorised ⇒ no kind ⇒ no icon.
const CAT_KIND: Record<string, MemoKind> = { STEPS: "note", "EXAM TRAPS": "trap", "CHEAT CODES": "cheat", "OTHER TIPS": "tip" };

/** A memo the previewer can attach a COPY of (from the scene's existing memos). */
export interface MemoLibraryItem { id: string; title?: string; body: string; memoKind?: MemoKind; category?: string }

// Where a memo sits relative to its dealt card (frame-local offset). The dealt
// stack card is ~560 wide; presets place the memo just outside each edge.
const MEMO_POS: Record<string, { dx: number; dy: number }> = {
  right: { dx: 580, dy: 20 },
  below: { dx: 0, dy: 540 },
  left: { dx: -300, dy: 20 },
  above: { dx: 0, dy: -140 },
};
const MEMO_POS_ORDER = ["right", "below", "left", "above"] as const;
const MEMO_POS_ARROW: Record<string, string> = { right: "→", below: "↓", left: "←", above: "↑" };
/** Which preset a memo's dx/dy currently matches (defaults to "right"). */
function memoPosKey(m: CeqSetMemo): (typeof MEMO_POS_ORDER)[number] {
  for (const k of MEMO_POS_ORDER) if (MEMO_POS[k].dx === m.dx && MEMO_POS[k].dy === m.dy) return k;
  return "right";
}

export function CeqSetPreviewer({ set, setCeqSets, memoLibrary, onClose }: {
  set: CeqSetDef;
  setCeqSets: (fn: (prev: CeqSetDef[]) => CeqSetDef[]) => void;
  memoLibrary: MemoLibraryItem[];
  onClose: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // which question's "+ memo" picker is open, the new-memo draft text, and its category.
  const [memoPickerFor, setMemoPickerFor] = useState<string | null>(null);
  const [newMemoText, setNewMemoText] = useState("");
  const [newMemoCat, setNewMemoCat] = useState<string>("OTHER TIPS");
  const includedCount = set.accounts.filter((a) => a.include).length;

  const patchAccounts = (fn: (accs: CeqSetAccount[]) => CeqSetAccount[]) =>
    setCeqSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, accounts: fn(s.accounts) } : s)));

  // ---- memos on a question (Phase 2) ----
  const patchMemos = (accountId: string, fn: (memos: CeqSetMemo[]) => CeqSetMemo[]) =>
    patchAccounts((accs) => accs.map((a) => (a.accountId === accountId ? { ...a, memos: fn(a.memos ?? []) } : a)));
  const attachMemo = (accountId: string, src: { title?: string; body: string; memoKind?: MemoKind; category?: string }) => {
    const memo: CeqSetMemo = { id: cardId("setmemo"), title: src.title, body: src.body, memoKind: src.memoKind, category: src.category, ...MEMO_POS.right };
    patchMemos(accountId, (ms) => [...ms, memo]);
  };
  const removeMemo = (accountId: string, memoId: string) =>
    patchMemos(accountId, (ms) => ms.filter((m) => m.id !== memoId));
  // Write + attach a brand-new memo with the chosen category (kind follows category).
  const addNewMemo = (accountId: string) => {
    const body = newMemoText.trim();
    if (!body) return;
    attachMemo(accountId, { body, category: newMemoCat || undefined, memoKind: newMemoCat ? CAT_KIND[newMemoCat] : undefined });
    setNewMemoText("");
  };
  const cycleMemoPos = (accountId: string, memoId: string) =>
    patchMemos(accountId, (ms) => ms.map((m) => {
      if (m.id !== memoId) return m;
      const next = MEMO_POS_ORDER[(MEMO_POS_ORDER.indexOf(memoPosKey(m)) + 1) % MEMO_POS_ORDER.length];
      return { ...m, ...MEMO_POS[next] };
    }));

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
                  {/* MEMOS attached to this question (Phase 2) — travel with the set,
                      materialise positioned near the card on every deal. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <StickyNote className="h-3 w-3" style={{ color: NEON.muted }} />
                    {(a.memos ?? []).map((m) => (
                      <span key={m.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px]" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
                        <button title="Cycle position around the card (right → below → left → above)" className="font-bold" style={{ color: NEON.cyan }} onClick={() => cycleMemoPos(a.accountId, m.id)}>{MEMO_POS_ARROW[memoPosKey(m)]}</button>
                        <span className="max-w-[150px] truncate">{m.title || m.body}</span>
                        <button title="Remove memo" style={{ color: NEON.muted }} onClick={() => removeMemo(a.accountId, m.id)}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    ))}
                    <button className="rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} title="Attach a memo to this question" onClick={() => { setMemoPickerFor(memoPickerFor === a.accountId ? null : a.accountId); setNewMemoText(""); }}>
                      {memoPickerFor === a.accountId ? "close" : "+ memo"}
                    </button>
                  </div>
                  {memoPickerFor === a.accountId && (
                    <div className="mt-1 rounded-md p-1.5" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${NEON.borderSoft}` }}>
                      {memoLibrary.length > 0 && (
                        <div className="mb-1.5">
                          <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Reuse from your memo library</div>
                          <div className="mt-0.5 flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                            {memoLibrary.map((lm) => (
                              <button key={lm.id} className="truncate rounded px-1.5 py-0.5 text-left text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Attach a copy of this memo" onClick={() => attachMemo(a.accountId, { title: lm.title, body: lm.body, memoKind: lm.memoKind, category: lm.category })}>
                                {lm.title ? <span className="font-bold">{lm.title}: </span> : null}{lm.body}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Or write a new one</div>
                      {/* category chips — click the active one again to leave it uncategorised */}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {MEMO_CATEGORIES.map((c) => {
                          const on = newMemoCat === c;
                          return (
                            <button key={c} className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide"
                              style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.yellow : "transparent", border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}` }}
                              title={on ? "Selected — click to leave uncategorised" : `Categorise new memo as ${c}`}
                              onClick={() => setNewMemoCat(on ? "" : c)}>
                              {c}
                            </button>
                          );
                        })}
                        {!newMemoCat && <span className="self-center text-[8.5px] italic" style={{ color: NEON.muted }}>uncat.</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          value={newMemoText}
                          onChange={(e) => setNewMemoText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addNewMemo(a.accountId); }}
                          placeholder="New memo text…"
                          className="min-w-0 flex-1 rounded px-1.5 py-1 text-[10px] outline-none"
                          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                        />
                        <button className="rounded px-2 py-1 text-[9.5px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} disabled={!newMemoText.trim()} onClick={() => addNewMemo(a.accountId)}>add</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 text-[9.5px]" style={{ color: NEON.muted, borderTop: `1px solid ${NEON.borderSoft}` }}>
          Reordering sets the deal order; memos attach per question and deal with their card. When you're ready, enter a frame and hit the stack-deal button on this set.
        </div>
      </div>
    </div>
  );
}
