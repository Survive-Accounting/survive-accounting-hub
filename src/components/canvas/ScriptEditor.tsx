// SCRIPT EDITOR V2 — Lee's planning surface. Every frame in the outline hierarchy
// (lesson › beat › frame) with its entry / beats / exit inline-editable, PLUS:
//  • @ CARD MARKS — type "@" in beats to pick a card kind; it inserts a "@Kind"
//    token and stores a structured mark (kind + note + optional link) on the
//    frame. Marks are INTENT, not cards — they never auto-create anything.
//  • BUILD CHECKLIST — each frame lists its marks as chips; a mark can LINK to a
//    real card once built. A course-wide "unlinked marks" filter = the build queue.
//  • ADD / REORDER / DELETE frames from the modal (respecting the 5-per-beat cap;
//    a deleted frame's cards go loose to the lesson).
//  • PER-LESSON COLLAPSE that persists (default: only the current lesson open),
//    collapse/expand all, and a title filter box.
//  • PASTE-FRIENDLY — pasting a script recognises "@Word" tokens as marks.
// Fast + keyboard-first: Enter / Ctrl+Enter move between fields; nothing blocks on
// a save (edits ride the undoable command bus, coalesced).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronRight, Download, Filter, Link2, Link2Off, Plus, ScrollText, Trash2, X } from "lucide-react";

import { addNodesCmd, bus, patchDataCmd, patchDataFnCmd, type RfLike } from "./commands";
import { blankFrameData, BEAT_COLUMNS, beatColOf, columnX, framesInBeat, nextSubIndex, RESERVED_ROWS, rowY, subIndexOf } from "./frames";
import { isUnlinked, MARK_KINDS, markLabel, newMark, parseAtTokens } from "./card-marks";
import { downloadText } from "./export";
import { courseScriptMarkdown, hasScript, scriptTree } from "./script-doc";
import { NEON } from "./theme";
import { cardId, FRAME_H, FRAME_W, isContainerType, type Beat, type CardMark, type FrameScript, type MarkKind } from "./types";

const FIELD_BG = "rgba(255,255,255,0.05)";
const FIELD_BORDER = `1px solid ${NEON.borderSoft}`;
type AnyNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data: Record<string, unknown> };

/** Focus the next scriptable field in document order (Enter / Ctrl+Enter flow). */
function focusNextField(cur: HTMLElement) {
  const all = [...document.querySelectorAll<HTMLElement>("[data-sefield]")];
  const next = all[all.indexOf(cur) + 1];
  if (next) { next.focus(); if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) next.select(); next.scrollIntoView({ block: "nearest" }); }
}

const BEAT_LABEL: Record<Beat, string> = { hook: "Hook", teach: "Teach", model_practice: "Model · Practice", check: "Check" };

export function ScriptEditor({ courseName, currentFrameId, onClose, statusCell, lessonControl }: {
  courseName: string;
  currentFrameId?: string | null;
  onClose: () => void;
  statusCell?: (frameId: string, status: import("./types").FilmStatus) => React.ReactNode;
  /** Per-lesson control in the header (the Publish button + status). */
  lessonControl?: (lessonId: string) => React.ReactNode;
}) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes() as unknown as AnyNode[];
  const tree = useMemo(() => scriptTree(nodes as never), [nodes]);
  const totals = tree.reduce((a, l) => ({ s: a.s + l.scripted, t: a.t + l.total }), { s: 0, t: 0 });

  const [filter, setFilter] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [picker, setPicker] = useState<{ frameId: string; ta: HTMLTextAreaElement; rect: DOMRect } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [linkFor, setLinkFor] = useState<{ frameId: string; markId: string; rect: DOMRect } | null>(null);
  const [focusFrameId, setFocusFrameId] = useState<string | null>(null);

  const cardExists = useMemo(() => { const s = new Set(nodes.map((n) => n.id)); return (id: string) => s.has(id); }, [nodes]);
  const lessonOpen = useMemo(() => new Map(nodes.filter((n) => n.type === "lesson").map((n) => [n.id, n.data.scriptOpen as boolean | undefined])), [nodes]);
  const currentLessonId = useMemo(() => {
    const f = currentFrameId ? nodes.find((n) => n.id === currentFrameId) : null;
    return f?.parentId ?? null;
  }, [currentFrameId, nodes]);

  // Esc closes (capture, ahead of the canvas's Esc ladder) — but let an open
  // picker swallow Esc first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (picker) { setPicker(null); e.stopPropagation(); return; }
      if (linkFor) { setLinkFor(null); e.stopPropagation(); return; }
      e.stopPropagation(); onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose, picker, linkFor]);

  // focus a freshly-added frame's entry field
  useEffect(() => {
    if (!focusFrameId) return;
    const el = document.querySelector<HTMLElement>(`[data-frame-entry="${focusFrameId}"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: "center" }); setFocusFrameId(null); }
  }, [focusFrameId, nodes]);

  // ---- script + mark writes (undoable; keystrokes coalesce) ------------------
  const patchScript = (frameId: string, key: "entry" | "beats" | "exit", value: string) => {
    const c = patchDataFnCmd(rfl, frameId, (prev) => ({ script: { ...((prev.script as FrameScript) ?? {}), [key]: value } }), "edit script", `d:${frameId}:script:${key}`);
    if (c) bus.dispatch(c);
  };
  const patchMarks = (frameId: string, fn: (marks: CardMark[]) => CardMark[], burst?: string) => {
    const c = patchDataFnCmd(rfl, frameId, (prev) => { const s = (prev.script as FrameScript) ?? {}; return { script: { ...s, marks: fn(s.marks ?? []) } }; }, "edit card marks", burst);
    if (c) bus.dispatch(c);
  };
  const setNote = (frameId: string, id: string, note: string) => patchMarks(frameId, (m) => m.map((x) => (x.id === id ? { ...x, note: note || undefined } : x)), `d:${frameId}:note:${id}`);
  const removeMark = (frameId: string, id: string) => patchMarks(frameId, (m) => m.filter((x) => x.id !== id));
  const linkMark = (frameId: string, id: string, cid: string | null) => patchMarks(frameId, (m) => m.map((x) => (x.id === id ? { ...x, linkedCardId: cid } : x)));

  // ---- @ picker: insert a "@Kind" token + a structured mark -----------------
  const openPicker = (frameId: string, ta: HTMLTextAreaElement) => { setPickerQuery(""); setPicker({ frameId, ta, rect: ta.getBoundingClientRect() }); };
  // insert the "@Kind" token AND append the mark in ONE command — two separate
  // dispatches would race and the second `script` write would clobber the first.
  const pickMark = (kind: MarkKind) => {
    if (!picker) return;
    const { frameId, ta } = picker;
    const token = `@${markLabel(kind).replace(/\s+/g, "")} `;
    const start = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + token + ta.value.slice(ta.selectionEnd ?? start);
    const beats = ta.value;
    const c = patchDataFnCmd(rfl, frameId, (prev) => { const s = (prev.script as FrameScript) ?? {}; return { script: { ...s, beats, marks: [...(s.marks ?? []), newMark(kind)] } }; }, "add card mark");
    if (c) bus.dispatch(c);
    setPicker(null);
    requestAnimationFrame(() => { ta.focus(); const cp = start + token.length; ta.setSelectionRange(cp, cp); });
  };

  const onBeatsPaste = (frameId: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const found = parseAtTokens(pasted);
    if (!found.length) return;
    const ta = e.currentTarget;
    // let the native paste land, then sync beats + append the pasted marks (ONE command)
    setTimeout(() => {
      const beats = ta.value;
      const c = patchDataFnCmd(rfl, frameId, (prev) => { const s = (prev.script as FrameScript) ?? {}; return { script: { ...s, beats, marks: [...(s.marks ?? []), ...found.map((f) => newMark(f.kind, f.note))] } }; }, "paste script marks");
      if (c) bus.dispatch(c);
    }, 0);
  };

  // ---- collapse state --------------------------------------------------------
  // default expand: the current lesson (or the first, when none is current) so the
  // modal never opens fully empty.
  const defaultOpenId = currentLessonId ?? tree[0]?.lessonId ?? null;
  const isOpen = (lessonId: string) => {
    if (filter.trim() || unlinkedOnly) return true; // filters force-expand matches
    return lessonOpen.get(lessonId) ?? lessonId === defaultOpenId;
  };
  const setLessonOpen = (lessonId: string, open: boolean) => { const c = patchDataCmd(rfl, lessonId, { scriptOpen: open }, "toggle lesson"); if (c) bus.dispatch(c); };
  const setAllLessons = (open: boolean) => {
    const ids = tree.map((l) => l.lessonId);
    const before = new Map(ids.map((id) => [id, lessonOpen.get(id)]));
    bus.dispatch({
      label: open ? "expand all lessons" : "collapse all lessons",
      do: () => rf.setNodes((nds) => nds.map((n) => (ids.includes(n.id) ? { ...n, data: { ...n.data, scriptOpen: open } } : n))),
      undo: () => rf.setNodes((nds) => nds.map((n) => (before.has(n.id) ? { ...n, data: { ...n.data, scriptOpen: before.get(n.id) } } : n))),
    });
  };

  // ---- frame ops (add / reorder / delete) ------------------------------------
  const gridPos = (beat: Beat, sub: number) => ({ x: columnX(BEAT_COLUMNS.indexOf(beat)), y: rowY(sub) });

  const addFrameEnd = (lessonId: string, beat: Beat) => {
    const col = framesInBeat(nodes as never, lessonId, beat);
    if (col.length >= RESERVED_ROWS) return;
    const at = nextSubIndex(nodes as never, lessonId, beat);
    const fid = cardId("frame");
    const node = { id: fid, type: "frame", parentId: lessonId, position: gridPos(beat, at), width: FRAME_W, height: FRAME_H, data: { ...blankFrameData(beat, at), title: "" } } as never;
    bus.dispatch(addNodesCmd(rfl, [node], "add frame"));
    setFocusFrameId(fid);
  };

  const insertFrameAfter = (afterFrameId: string) => {
    const f = nodes.find((n) => n.id === afterFrameId);
    if (!f?.parentId) return;
    const beat = beatColOf(f as never);
    const col = framesInBeat(nodes as never, f.parentId, beat);
    if (col.length >= RESERVED_ROWS) return;
    const at = subIndexOf(f as never) + 1;
    const shiftIds = col.filter((c) => subIndexOf(c as never) >= at).map((c) => c.id);
    const fid = cardId("frame");
    const node = { id: fid, type: "frame", parentId: f.parentId, position: gridPos(beat, at), width: FRAME_W, height: FRAME_H, data: { ...blankFrameData(beat, at), title: "" } } as never;
    const shift = (nds: AnyNode[], d: 1 | -1) => nds.map((n) => { if (!shiftIds.includes(n.id)) return n; const s = (n.data.subIndex as number ?? 0) + d; return { ...n, data: { ...n.data, subIndex: s }, position: gridPos(beat, s) }; });
    bus.dispatch({
      label: "insert frame",
      do: () => rf.setNodes((nds) => [...shift(nds as never, 1), node] as never),
      undo: () => rf.setNodes((nds) => shift((nds as AnyNode[]).filter((n) => n.id !== fid), -1) as never),
    });
    setFocusFrameId(fid);
  };

  const moveFrame = (frameId: string, dir: -1 | 1) => {
    const f = nodes.find((n) => n.id === frameId);
    if (!f?.parentId) return;
    const beat = beatColOf(f as never);
    const col = framesInBeat(nodes as never, f.parentId, beat);
    const i = col.findIndex((x) => x.id === frameId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= col.length) return;
    const a = col[i].id, b = col[j].id;
    bus.dispatch({
      label: "reorder frame",
      do: () => rf.setNodes((nds) => nds.map((n) => (n.id === a ? { ...n, data: { ...n.data, subIndex: j }, position: gridPos(beat, j) } : n.id === b ? { ...n, data: { ...n.data, subIndex: i }, position: gridPos(beat, i) } : n))),
      undo: () => rf.setNodes((nds) => nds.map((n) => (n.id === a ? { ...n, data: { ...n.data, subIndex: i }, position: gridPos(beat, i) } : n.id === b ? { ...n, data: { ...n.data, subIndex: j }, position: gridPos(beat, j) } : n))),
    });
  };

  const deleteFrame = (frameId: string) => {
    const f = nodes.find((n) => n.id === frameId);
    if (!f?.parentId) return;
    const lessonId = f.parentId;
    const kids = nodes.filter((n) => n.parentId === frameId);
    const before = kids.map((k) => ({ id: k.id, parentId: k.parentId, position: { ...k.position } }));
    const frameSnapshot = { ...(rf.getNode(frameId) as object) };
    bus.dispatch({
      label: "delete frame",
      // remove the frame; its cards go loose to the lesson (absolute position kept)
      do: () => rf.setNodes((nds) => (nds as AnyNode[]).filter((n) => n.id !== frameId).map((n) => (n.parentId === frameId ? { ...n, parentId: lessonId, position: { x: n.position.x + f.position.x, y: n.position.y + f.position.y } } : n)) as never),
      undo: () => rf.setNodes((nds) => { const restored = (nds as AnyNode[]).map((n) => { const b = before.find((x) => x.id === n.id); return b ? { ...n, parentId: b.parentId, position: b.position } : n; }); return [...restored, frameSnapshot] as never; }),
    });
  };

  const exportScript = () => {
    const stem = courseName.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "") || "course";
    downloadText(`${stem}.script.md`, courseScriptMarkdown(tree, courseName), "text/markdown");
  };
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 220)}px`; };

  // ---- filtering -------------------------------------------------------------
  const q = filter.trim().toLowerCase();
  const frameCardsOf = (frameId: string) => nodes.filter((n) => n.parentId === frameId && !isContainerType(n.type)).map((n) => ({ id: n.id, kind: (n.data.kind as string) ?? n.type ?? "card", label: (n.data.title as string) || (n.data.caption as string) || (n.data.name as string) || (n.data.account as string) || (n.data.text as string) || (n.data.kind as string) || "card" }));
  const frameVisible = (frameId: string, title: string, marks: CardMark[], lessonMatch: boolean) => {
    if (unlinkedOnly && !marks.some((m) => isUnlinked(m, cardExists))) return false;
    if (q && !lessonMatch && !title.toLowerCase().includes(q)) return false;
    return true;
  };

  const filterActive = !!q || unlinkedOnly;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.85)" }}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: NEON.borderSoft }}>
          <ScrollText className="h-4 w-4" style={{ color: NEON.yellow }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Course script</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color: NEON.muted, border: FIELD_BORDER }}>{totals.s}/{totals.t} scripted</span>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold" style={{ color: NEON.cyan, border: FIELD_BORDER }} title="Export the whole course script as one markdown doc" onClick={exportScript}><Download className="h-3 w-3" /> Export</button>
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} title="Close (Esc)" onClick={onClose}><X className="h-3.5 w-3.5" /></button>
        </div>

        {/* toolbar — filter box, unlinked queue, collapse/expand all */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-1.5" style={{ borderColor: NEON.borderSoft }}>
          <div className="flex items-center gap-1 rounded px-1.5" style={{ border: FIELD_BORDER, background: FIELD_BG }}>
            <Filter className="h-3 w-3" style={{ color: NEON.muted }} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter lessons / frames" className="w-44 bg-transparent py-1 text-[11px] outline-none" style={{ color: NEON.text }} />
            {filter && <button className="text-[10px]" style={{ color: NEON.muted }} onClick={() => setFilter("")}>✕</button>}
          </div>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-bold uppercase" style={{ color: unlinkedOnly ? "#0B1322" : NEON.muted, background: unlinkedOnly ? NEON.yellow : "transparent", border: FIELD_BORDER }} title="Show only frames with card marks not yet linked to a built card — the build queue" onClick={() => setUnlinkedOnly((v) => !v)}>
            <Link2Off className="h-3 w-3" /> unlinked marks
          </button>
          <span className="flex-1" />
          <button className="rounded px-2 py-1 text-[10.5px] font-semibold" style={{ color: NEON.text, border: FIELD_BORDER }} onClick={() => setAllLessons(true)}>expand all</button>
          <button className="rounded px-2 py-1 text-[10.5px] font-semibold" style={{ color: NEON.text, border: FIELD_BORDER }} onClick={() => setAllLessons(false)}>collapse all</button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {tree.length === 0 && <div className="py-10 text-center text-[12px]" style={{ color: NEON.muted }}>No lessons yet — "Add region scaffold" builds the course structure first.</div>}
          {tree.map((l) => {
            const lessonMatch = !q || l.label.toLowerCase().includes(q);
            const beatsWithVisibleFrames = BEAT_COLUMNS.map((beat) => {
              const group = l.beats.find((g) => g.beat === beat);
              const frames = (group?.frames ?? []).filter((f) => frameVisible(f.frameId, f.title, f.script.marks ?? [], lessonMatch));
              return { beat, frames, hasAny: !!group?.frames.length };
            });
            const anyVisibleFrame = beatsWithVisibleFrames.some((b) => b.frames.length > 0);
            // when filtering, drop lessons with nothing to show
            if (filterActive && !anyVisibleFrame && !(q && lessonMatch)) return null;
            const open = isOpen(l.lessonId);
            const unlinkedCount = l.beats.flatMap((g) => g.frames).reduce((a, f) => a + (f.script.marks ?? []).filter((m) => isUnlinked(m, cardExists)).length, 0);
            return (
              <section key={l.lessonId} className="mb-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setLessonOpen(l.lessonId, !open)} disabled={filterActive} title={open ? "Collapse" : "Expand"}>
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <h3 className="text-[12.5px] font-black uppercase tracking-wide" style={{ color: l.lessonId === currentLessonId ? NEON.yellow : NEON.text }}>{l.label}</h3>
                  <span className="text-[9.5px] tabular-nums" style={{ color: NEON.muted }}>{l.scripted}/{l.total} scripted{statusCell ? ` · ${l.filmed}/${l.total} filmed` : ""}</span>
                  {unlinkedCount > 0 && <span className="rounded px-1 text-[8.5px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.yellow}66` }}>{unlinkedCount} to build</span>}
                  <span className="flex-1" />
                  {lessonControl?.(l.lessonId)}
                </div>
                {open && beatsWithVisibleFrames.map(({ beat, frames, hasAny }) => (
                  (frames.length > 0 || (!filterActive && !hasAny)) && (
                    <div key={beat} className="mb-2 ml-6">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: NEON.cyan }}>{BEAT_LABEL[beat]}</span>
                        <button className="inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold" style={{ color: NEON.muted, border: FIELD_BORDER }} title={`Add a frame to ${BEAT_LABEL[beat]} (max ${RESERVED_ROWS})`} onClick={() => addFrameEnd(l.lessonId, beat)}><Plus className="h-2.5 w-2.5" /> frame</button>
                      </div>
                      <div className="space-y-1.5">
                        {frames.map((f) => {
                          const marks = f.script.marks ?? [];
                          return (
                            <div key={f.frameId} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${hasScript(f.script) ? "rgba(126,243,192,0.25)" : NEON.borderSoft}` }}>
                              <div className="mb-1 flex items-center gap-1.5">
                                <span className="rounded px-1 text-[9px] font-bold tabular-nums" style={{ color: NEON.yellow, border: FIELD_BORDER }}>F{f.n}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: NEON.text }}>{f.title || "untitled frame"}</span>
                                {statusCell?.(f.frameId, f.filmStatus)}
                                <span className="flex shrink-0 items-center">
                                  <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Move up" onClick={() => moveFrame(f.frameId, -1)}>▲</button>
                                  <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Move down" onClick={() => moveFrame(f.frameId, 1)}>▼</button>
                                  <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Insert a frame after this one" onClick={() => insertFrameAfter(f.frameId)}><Plus className="h-3 w-3" /></button>
                                  <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.red }} title="Delete frame (its cards go loose)" onClick={() => deleteFrame(f.frameId)}><Trash2 className="h-3 w-3" /></button>
                                </span>
                              </div>
                              <div className="grid gap-1">
                                <input data-sefield data-frame-entry={f.frameId} className="w-full rounded px-1.5 py-1 text-[11.5px] outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} placeholder="Entry line" defaultValue={f.script.entry ?? ""} onChange={(e) => patchScript(f.frameId, "entry", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                                <textarea data-sefield rows={2} className="w-full resize-none rounded px-1.5 py-1 text-[11.5px] leading-snug outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} placeholder={"Beats — one point per line · type @ to mark a card"} defaultValue={f.script.beats ?? ""}
                                  onFocus={(e) => grow(e.currentTarget)} onInput={(e) => grow(e.currentTarget)}
                                  onChange={(e) => patchScript(f.frameId, "beats", e.target.value)}
                                  onPaste={(e) => onBeatsPaste(f.frameId, e)}
                                  onKeyDown={(e) => { if (e.key === "@") { e.preventDefault(); openPicker(f.frameId, e.currentTarget); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                                <input data-sefield className="w-full rounded px-1.5 py-1 text-[11.5px] outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} placeholder="Exit line" defaultValue={f.script.exit ?? ""} onChange={(e) => patchScript(f.frameId, "exit", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                              </div>
                              {/* CARDS TO BUILD — the mark checklist */}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>cards to build:</span>
                                {marks.length === 0 && <span className="text-[10px] italic" style={{ color: NEON.muted }}>none — type @ in beats</span>}
                                {marks.map((m) => {
                                  const linked = m.linkedCardId && cardExists(m.linkedCardId);
                                  return (
                                    <span key={m.id} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px]" style={{ background: linked ? "rgba(126,243,192,0.1)" : "rgba(252,163,17,0.1)", border: `1px solid ${linked ? "rgba(126,243,192,0.4)" : "rgba(252,163,17,0.4)"}` }}>
                                      <b style={{ color: linked ? "#7EF3C0" : NEON.yellow }}>@{markLabel(m.kind)}</b>
                                      <input value={m.note ?? ""} onChange={(e) => setNote(f.frameId, m.id, e.target.value)} placeholder="note" className="w-20 bg-transparent text-[10px] outline-none" style={{ color: NEON.text }} />
                                      {linked ? (
                                        <button className="grid h-4 w-4 place-items-center" style={{ color: "#7EF3C0" }} title="Linked — click to unlink" onClick={() => linkMark(f.frameId, m.id, null)}><Link2 className="h-3 w-3" /></button>
                                      ) : (
                                        <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.muted }} title="Link to a card on this frame" onClick={(e) => setLinkFor({ frameId: f.frameId, markId: m.id, rect: e.currentTarget.getBoundingClientRect() })}><Link2Off className="h-3 w-3" /></button>
                                      )}
                                      <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} title="Remove mark" onClick={() => removeMark(f.frameId, m.id)}><X className="h-2.5 w-2.5" /></button>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                ))}
              </section>
            );
          })}
        </div>
        <div className="border-t px-4 py-1.5 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>Type @ in beats to mark a card · Enter → next field · Ctrl+Enter leaves beats · edits autosave to the canvas (undoable)</div>
      </div>

      {/* @ CARD-KIND PICKER — anchored under the beats field */}
      {picker && (() => {
        const items = MARK_KINDS.filter((m) => !pickerQuery || m.label.toLowerCase().includes(pickerQuery.toLowerCase()));
        return (
          <div className="fixed inset-0 z-[80]" onPointerDown={() => setPicker(null)}>
            <div className="absolute w-52 rounded-lg p-1.5 shadow-xl" style={{ left: Math.min(picker.rect.left, window.innerWidth - 224), top: Math.min(picker.rect.bottom + 4, window.innerHeight - 340), background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
              <input autoFocus value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="card kind…" className="mb-1 w-full rounded px-1.5 py-1 text-[11px] outline-none" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }}
                onKeyDown={(e) => { if (e.key === "Enter" && items[0]) { e.preventDefault(); pickMark(items[0].kind); } }} />
              <div className="max-h-64 overflow-auto">
                {items.map((m) => (
                  <button key={m.kind} className="flex w-full items-center rounded px-2 py-1 text-left text-[11.5px] hover:bg-white/5" style={{ color: NEON.text }} onClick={() => pickMark(m.kind)}>@{m.label}</button>
                ))}
                {items.length === 0 && <div className="px-2 py-2 text-center text-[10.5px]" style={{ color: NEON.muted }}>no match</div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* LINK-TO-CARD MENU — the frame's built cards */}
      {linkFor && (() => {
        const cards = frameCardsOf(linkFor.frameId);
        return (
          <div className="fixed inset-0 z-[80]" onPointerDown={() => setLinkFor(null)}>
            <div className="absolute w-56 rounded-lg p-1.5 shadow-xl" style={{ left: Math.min(linkFor.rect.left, window.innerWidth - 240), top: Math.min(linkFor.rect.bottom + 4, window.innerHeight - 300), background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="mb-1 px-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>link to a card on this frame</div>
              {cards.length === 0 && <div className="px-2 py-2 text-center text-[10.5px]" style={{ color: NEON.muted }}>no cards on this frame yet — build one, then link</div>}
              {cards.map((c) => (
                <button key={c.id} className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] hover:bg-white/5" style={{ color: NEON.text }} onClick={() => { linkMark(linkFor.frameId, linkFor.markId, c.id); setLinkFor(null); }}>
                  <b className="shrink-0" style={{ color: NEON.cyan }}>{c.kind}</b><span className="min-w-0 truncate" style={{ color: NEON.muted }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
