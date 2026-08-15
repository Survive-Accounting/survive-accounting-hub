// IDEA BANK (P7) — the board + quick capture. Rendered by CeqStudio (top-bar
// 📌 icon + F7 quick-capture, both dead while filming/recording — that's what
// the physical notepad is for; nothing may steal keys from the film controller).
import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Copy, Download, Pin, X } from "lucide-react";

import { addIdea, editIdea, exportDigest, groupIdeas, IDEA_CATEGORIES, loadIdeas, saveIdeas, type IdeaCategory, type IdeaNote } from "./idea-bank";
import { NEON } from "./theme";

export function IdeaBank({ mode, onClose }: { mode: "board" | "capture"; onClose: () => void }) {
  const [ideas, setIdeas] = useState<IdeaNote[]>(() => loadIdeas());
  const [cat, setCat] = useState<IdeaCategory>("Ideas");
  const [text, setText] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = window.setTimeout(() => inputRef.current?.focus(), 40); return () => window.clearTimeout(t); }, []);
  const commit = (next: IdeaNote[]) => { setIdeas(next); saveIdeas(next); };
  const capture = () => {
    if (!text.trim()) return;
    commit(addIdea(ideas, text, cat));
    setText("");
    if (mode === "capture") onClose(); // one thought → filed → gone, under 5s
    else setNote("Filed.");
  };
  const doExport = async () => {
    const md = exportDigest(ideas);
    try { await navigator.clipboard.writeText(md); setNote("Digest copied to clipboard + downloading .md"); } catch { setNote("Clipboard blocked — downloading .md"); }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `idea-bank-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const capBox = (
    <div className="flex flex-col gap-1">
      <textarea ref={inputRef} rows={2} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); capture(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
        placeholder="capture the thought… Enter files it" className="w-full resize-none rounded bg-black/30 px-2 py-1.5 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} />
      <div className="flex flex-wrap items-center gap-1">
        {IDEA_CATEGORIES.map((c) => (
          <button key={c} className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: cat === c ? "#0B1322" : NEON.muted, background: cat === c ? NEON.yellow : "transparent", border: `1px solid ${cat === c ? NEON.yellow : NEON.borderSoft}` }} onClick={() => setCat(c)}>{c}</button>
        ))}
        <button className="ml-auto rounded px-2 py-0.5 text-[9px] font-black uppercase" style={{ color: "#0B1322", background: "#3BF5A0" }} onClick={capture} disabled={!text.trim()}>File it</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[74] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.55)" }} onClick={onClose}>
      <div className={`mt-12 flex max-h-[82vh] w-[${mode === "board" ? "520px" : "420px"}] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl`} style={{ width: mode === "board" ? 520 : 420, background: NEON.panelSolid, border: `1px solid ${NEON.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          <Pin className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }}>Idea bank</span>
          {note && <span className="text-[9px]" style={{ color: "#3BF5A0" }}>{note}</span>}
          {mode === "board" && (<>
            <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={doExport} title="Copy a markdown digest to the clipboard AND download it as .md — grouped by category, archived excluded, paste-ready for a chat"><Copy className="h-3 w-3" /><Download className="h-3 w-3" /> Export for Claude</button>
            <button className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: showArchived ? "#0B1322" : NEON.muted, background: showArchived ? NEON.cyan : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setShowArchived((v) => !v)}>archived</button>
          </>)}
          <button className={mode === "board" ? "grid h-5 w-5 place-items-center rounded" : "ml-auto grid h-5 w-5 place-items-center rounded"} style={{ color: NEON.muted }} onClick={onClose}><X className="h-3 w-3" /></button>
        </div>
        <div className="p-2">{capBox}</div>
        {mode === "board" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {groupIdeas(ideas, showArchived).map((g) => (
              <div key={g.category}>
                <div className="pb-0.5 pt-2 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>{g.category} · {g.items.length}</div>
                {g.items.map((n) => (
                  <div key={n.id} className="mb-1 flex items-start gap-1.5 rounded px-1.5 py-1" style={{ background: n.archived ? "rgba(0,0,0,0.15)" : "rgba(252,163,17,0.06)", border: `1px solid ${NEON.borderSoft}`, opacity: n.archived ? 0.55 : 1 }}>
                    <textarea rows={Math.max(1, Math.ceil(n.text.length / 58))} defaultValue={n.text} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== n.text) commit(editIdea(ideas, n.id, { text: e.target.value.trim() })); }} className="min-w-0 flex-1 resize-none bg-transparent text-[10.5px] leading-snug outline-none" style={{ color: NEON.text }} />
                    <span className="shrink-0 pt-0.5 text-[7.5px] tabular-nums" style={{ color: NEON.muted }}>{n.createdAt.slice(5, 10)}</span>
                    <button className="shrink-0 pt-0.5" style={{ color: NEON.muted }} onClick={() => commit(editIdea(ideas, n.id, { archived: !n.archived }))} title={n.archived ? "Restore" : "Archive (never hard-deletes)"}>{n.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}</button>
                  </div>
                ))}
              </div>
            ))}
            {groupIdeas(ideas, showArchived).length === 0 && <div className="px-1 py-3 text-[10px] italic" style={{ color: NEON.muted }}>Empty — F7 anywhere in the Studio captures a thought in under five seconds.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
