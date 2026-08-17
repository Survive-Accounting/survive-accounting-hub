// IDEA BANK — the board + quick capture. Rendered by CeqStudio (top-bar 📌 icon
// + F7 quick-capture, both dead while filming/recording — that's what the physical
// notepad is for; nothing may steal keys from the film controller).
//
// CAPTURE IS THE POINT: F7 → type → Enter → filed, box cleared, still open for the
// next thought. 1–7 pick the category before Enter. Esc closes. No dialog ever
// appears on file, and nothing steals focus back from the input.
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Copy, Download, Loader2, Pin, RefreshCw, X } from "lucide-react";

import {
  DEFAULT_CATEGORY, exportDigest, groupIdeas, IDEA_CATEGORIES, makeNote, mergeNotes,
  migrateCategory, migrationTable, touch, type IdeaCategory, type IdeaNote,
} from "./idea-bank";
import { bankState, commitLocal, flush, startBank, subscribeBank, type BankState } from "./idea-bank-sync";
import { NEON } from "./theme";

export function IdeaBank({ mode, onClose }: { mode: "board" | "capture"; onClose: () => void }) {
  const [st, setSt] = useState<BankState>(() => bankState());
  const [cat, setCat] = useState<IdeaCategory>(DEFAULT_CATEGORY);
  const [text, setText] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => subscribeBank(setSt), []);
  useEffect(() => {
    const rec = startBank();
    if (rec.recovered) setNote(`Recovered ${rec.recovered} orphaned note${rec.recovered === 1 ? "" : "s"} from ${rec.sources.join(", ")}`);
  }, []);
  // Focus the input, and keep it — capture must be typeable the instant F7 lands.
  useEffect(() => { const t = window.setTimeout(() => inputRef.current?.focus(), 30); return () => window.clearTimeout(t); }, []);

  const notes = st.notes;
  const commit = (next: IdeaNote[]) => {
    try { commitLocal(next); }
    catch (e) { setNote(`LOCAL SAVE FAILED — ${e instanceof Error ? e.message : String(e)}. Copy the text somewhere safe.`); }
  };

  const capture = () => {
    if (!text.trim()) return;
    commit([makeNote(text, cat), ...notes]);
    setText("");
    setCat(DEFAULT_CATEGORY);   // the next thought starts from the catch-all
    setNote(null);
    inputRef.current?.focus();  // STAYS OPEN — one F7, many thoughts
  };

  const doExport = async () => {
    const md = exportDigest(notes);   // the PERSISTED list, not a render-time copy
    try { await navigator.clipboard.writeText(md); setNote("Digest copied + downloading .md"); }
    catch { setNote("Clipboard blocked — downloading .md"); }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `idea-bank-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const table = useMemo(() => migrationTable(notes).filter((r) => r.from !== r.to), [notes]);
  const runMigration = () => {
    const now = new Date();
    commit(mergeNotes(notes.map((n) => (migrateCategory(n.category) === n.category ? n : touch(n, { category: migrateCategory(n.category) }, now))), []));
    setMigrateOpen(false);
    setNote(`Re-filed ${table.reduce((a, r) => a + r.count, 0)} note(s). Nothing was deleted.`);
  };

  /** 1–7 set the category for the note being typed. No mouse, no Tab. */
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();                       // the Studio never sees these keys
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); capture(); return; }
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= IDEA_CATEGORIES.length && (e.altKey || e.ctrlKey || e.metaKey || !text)) {
      // Bare 1–7 only while the box is EMPTY, so a digit never gets eaten
      // mid-sentence ("...by Q3"); Alt+digit works at any point.
      e.preventDefault();
      setCat(IDEA_CATEGORIES[n - 1]);
    }
  };

  const syncChip = st.pending > 0
    ? { text: st.syncing ? `syncing ${st.pending}…` : `${st.pending} not synced`, bg: st.syncing ? NEON.cyan : "#FFB020", fg: "#0B1322" }
    : st.loadedRemote ? { text: "all synced", bg: "transparent", fg: "#3BF5A0" }
    : { text: "local", bg: "transparent", fg: NEON.muted };

  const capBox = (
    <div className="flex flex-col gap-1">
      <textarea ref={inputRef} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
        placeholder="capture the thought… Enter files it · 1-7 category · Esc closes"
        className="w-full resize-none rounded bg-black/30 px-2 py-1.5 text-[11px] outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} />
      <div className="flex flex-wrap items-center gap-1">
        {IDEA_CATEGORIES.map((c, i) => (
          <button key={c} className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase"
            style={{ color: cat === c ? "#0B1322" : NEON.muted, background: cat === c ? NEON.yellow : "transparent", border: `1px solid ${cat === c ? NEON.yellow : NEON.borderSoft}` }}
            onMouseDown={(e) => { e.preventDefault(); setCat(c); inputRef.current?.focus(); }}
            title={`${i + 1} — set this category without touching the mouse`}>
            <span style={{ opacity: 0.6 }}>{i + 1}</span> {c}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[74] flex items-start justify-center" style={{ background: "rgba(4,7,14,0.55)" }} onClick={onClose}>
      <div className="mt-12 flex max-h-[82vh] max-w-[94vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ width: mode === "board" ? 560 : 440, background: NEON.panelSolid, border: `1px solid ${NEON.border}` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          <Pin className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }}>Idea bank</span>
          <span className="rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase" style={{ color: syncChip.fg, background: syncChip.bg, border: `1px solid ${NEON.borderSoft}` }}
            title={st.pending ? "These notes are saved on this machine and still owed to the server. They retry automatically on reconnect and on focus — nothing is dropped." : "Everything here is on the server."}>
            {syncChip.text}
          </span>
          {st.pending > 0 && (
            <button className="rounded px-1 py-0.5" style={{ color: NEON.cyan }} onClick={() => void flush()} title="Retry now">
              {st.syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
          )}
          {note && <span className="min-w-0 flex-1 truncate text-[9px]" style={{ color: "#3BF5A0" }}>{note}</span>}
          {mode === "board" && (<>
            {table.length > 0 && (
              <button className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => setMigrateOpen(true)} title="Some notes still use the old category names — review the mapping and re-file them">re-file {table.reduce((a, r) => a + r.count, 0)}</button>
            )}
            <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={doExport}
              title="Copy a markdown digest to the clipboard AND download it as .md — grouped by category, archived excluded, paste-ready"><Copy className="h-3 w-3" /><Download className="h-3 w-3" /> Export</button>
            <button className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: showArchived ? "#0B1322" : NEON.muted, background: showArchived ? NEON.cyan : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setShowArchived((v) => !v)}>archived</button>
          </>)}
          <button className={mode === "board" ? "grid h-5 w-5 place-items-center rounded" : "ml-auto grid h-5 w-5 place-items-center rounded"} style={{ color: NEON.muted }} onClick={onClose}><X className="h-3 w-3" /></button>
        </div>

        {/* A sync failure is never swallowed — it says so, and says it will retry. */}
        {st.error && (
          <div className="border-b px-3 py-1 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: "#FF8B9E" }}>
            sync: {st.error} — your notes are saved on this machine and will retry automatically.
          </div>
        )}

        <div className="p-2">{capBox}</div>

        {migrateOpen && (
          <div className="border-y px-3 py-2" style={{ borderColor: NEON.borderSoft, background: "rgba(252,163,17,0.07)" }}>
            <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: NEON.yellow }}>Re-file to the new categories</div>
            <table className="mt-1 text-[10px]" style={{ color: NEON.text }}>
              <tbody>
                {table.map((r) => (
                  <tr key={r.from}><td className="pr-2" style={{ color: NEON.muted }}>{r.from}</td><td className="pr-2">→</td><td className="pr-3 font-bold">{r.to}</td><td className="tabular-nums" style={{ color: NEON.muted }}>{r.count} note{r.count === 1 ? "" : "s"}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-[9px]" style={{ color: NEON.muted }}>Publishing → Filming: publishing is the back half of the filming pipeline (stitch, upload, Mux); Studio is the authoring surface. Re-filing is one click per note afterwards, and nothing is deleted.</div>
            <div className="mt-1.5 flex items-center gap-2">
              <button className="rounded px-2.5 py-1 text-[10px] font-black uppercase" style={{ background: NEON.yellow, color: "#0B1322" }} onClick={runMigration}>Re-file them</button>
              <button className="rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMigrateOpen(false)}>Not yet</button>
            </div>
          </div>
        )}

        {mode === "board" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {groupIdeas(notes, showArchived).map((g) => (
              <div key={g.category}>
                <div className="pb-0.5 pt-2 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan }}>{g.category} · {g.items.length}</div>
                {g.items.map((n) => (
                  <div key={n.id} className="mb-1 flex items-start gap-1.5 rounded px-1.5 py-1" style={{ background: n.archivedAt ? "rgba(0,0,0,0.15)" : "rgba(252,163,17,0.06)", border: `1px solid ${NEON.borderSoft}`, opacity: n.archivedAt ? 0.55 : 1 }}>
                    <textarea rows={Math.max(1, Math.ceil(n.text.length / 58))} defaultValue={n.text} onKeyDown={(e) => e.stopPropagation()}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== n.text) commit(notes.map((x) => (x.id === n.id ? touch(x, { text: v }) : x))); }}
                      className="min-w-0 flex-1 resize-none bg-transparent text-[10.5px] leading-snug outline-none" style={{ color: NEON.text }} />
                    {/* RE-FILING IS ONE CLICK — mis-categorising costs nothing, which is
                        what lets capture optimise for speed instead of accuracy. */}
                    <select value={n.category} onChange={(e) => commit(notes.map((x) => (x.id === n.id ? touch(x, { category: e.target.value as IdeaCategory }) : x)))}
                      className="shrink-0 rounded bg-black/40 text-[8px] uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title="Re-file this note">
                      {IDEA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="shrink-0 pt-0.5 text-[7.5px] tabular-nums" style={{ color: NEON.muted }} title={n.syncedAt ? "on the server" : "not synced yet"}>{n.createdAt.slice(5, 10)}{!n.syncedAt || n.syncedAt < n.updatedAt ? " •" : ""}</span>
                    <button className="shrink-0 pt-0.5" style={{ color: NEON.muted }} onClick={() => commit(notes.map((x) => (x.id === n.id ? touch(x, { archivedAt: n.archivedAt ? null : new Date().toISOString() }) : x)))} title={n.archivedAt ? "Restore" : "Archive (never hard-deletes)"}>{n.archivedAt ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}</button>
                  </div>
                ))}
              </div>
            ))}
            {groupIdeas(notes, showArchived).length === 0 && <div className="px-1 py-3 text-[10px] italic" style={{ color: NEON.muted }}>Empty — F7 anywhere in the Studio captures a thought in under three seconds.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
