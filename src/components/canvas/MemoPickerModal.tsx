// MEMO PICKER MODAL (Lee — memo library workflow) — the in-app replacement for the
// old window.prompt("New memo text") on the +💡 button. Search-first: typing live-
// searches ALL memos (label + body); each result row shows a category badge + a
// usage ×N (the "shared — edits ripple" signal) and CHAINS to the choice on click.
// A "Create new" row turns the typed text into a fresh memo (category picker, default
// OTHER TIPS) chained in one step. Keyboard: ↑/↓ move, Enter selects, Esc closes.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, Plus, Search, X } from "lucide-react";

import { NEON } from "./theme";

export interface MemoPick { id: string; label: string; body: string; category: string }

export function MemoPickerModal({ memos, usageCount, categories, defaultCategory, onPick, onCreate, onClose }: {
  memos: MemoPick[];
  usageCount: (id: string) => number;
  categories: readonly string[];
  defaultCategory: string;
  onPick: (memoId: string) => void;
  onCreate: (text: string, category: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState(defaultCategory);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() =>
    (q ? memos.filter((m) => m.label.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)) : memos)
      .slice(0, 60),
    [memos, q]);
  const canCreate = q.length > 0;
  const total = results.length + (canCreate ? 1 : 0);
  // Keep the active row in range as the list changes.
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, total - 1))); }, [total]);

  const choose = (idx: number) => {
    if (canCreate && idx === results.length) { onCreate(query.trim(), cat); return; }
    const m = results[idx];
    if (m) onPick(m.id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (total ? (a + 1) % total : 0)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (total ? (a - 1 + total) % total : 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); choose(active); return; }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center" style={{ background: "rgba(2,5,12,0.55)" }} onMouseDown={onClose}>
      <div className="mt-[12vh] flex w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: "rgba(11,19,34,0.98)", border: `1px solid ${NEON.border}` }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          <Lightbulb className="h-4 w-4 shrink-0" style={{ color: NEON.yellow }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Add a memo to this choice</span>
          <button className="ml-auto grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 px-3 pt-2.5">
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: NEON.muted }} />
          <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search memos, or type a new memo…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" style={{ color: NEON.text }} />
        </div>
        <div className="mt-1 max-h-[46vh] min-h-[80px] overflow-y-auto p-1.5">
          {results.length === 0 && !canCreate && <div className="px-2 py-3 text-center text-[11px] italic" style={{ color: NEON.muted }}>No memos yet — type to create one.</div>}
          {results.map((m, i) => { const n = usageCount(m.id); const on = active === i; return (
            <button key={m.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left" style={{ background: on ? "rgba(79,163,227,0.16)" : "transparent", border: `1px solid ${on ? NEON.border : "transparent"}` }} onMouseEnter={() => setActive(i)} onClick={() => choose(i)} title="Chain this memo to the choice (shared — edits ripple everywhere it's used)">
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: NEON.text }}>{m.label || "(untitled memo)"}</span>
              {n > 1 && <span className="shrink-0 rounded px-1 text-[8.5px] font-bold tabular-nums" style={{ color: "#7CC4FF", border: "1px solid rgba(124,196,255,0.5)" }} title={`Chained in ${n} places — editing ripples to all`}>×{n}</span>}
              {m.category && <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{m.category === "ELEMENT" ? "🧩" : m.category}</span>}
            </button>
          ); })}
          {canCreate && (() => { const i = results.length; const on = active === i; return (
            <button className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left" style={{ background: on ? "rgba(59,245,160,0.14)" : "transparent", border: `1px dashed ${on ? "rgba(59,245,160,0.6)" : NEON.borderSoft}` }} onMouseEnter={() => setActive(i)} onClick={() => choose(i)} title="Create a new memo from this text and chain it">
              <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: "#3BF5A0" }} />
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: NEON.text }}>Create “{query.trim()}”</span>
              <span className="shrink-0 text-[8.5px] uppercase" style={{ color: NEON.muted }}>as</span>
            </button>
          ); })()}
        </div>
        <div className="flex items-center gap-2 border-t px-3 py-2 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
          <span className="font-bold uppercase">New memo category</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="rounded bg-black/40 px-1 py-0.5 text-[10px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Category for a newly created memo">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="ml-auto">↑/↓ move · Enter select · Esc close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
