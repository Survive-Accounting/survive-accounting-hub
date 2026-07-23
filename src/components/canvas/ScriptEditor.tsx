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
import { Bold, ChevronLeft, ChevronRight, Download, Link2, Link2Off, LayoutGrid, List, NotebookPen, ScrollText, X } from "lucide-react";

import { addNodesCmd, bus, patchDataCmd, patchDataFnCmd, type RfLike } from "./commands";
import { blankFrameData, BEAT_COLUMNS, beatColOf, columnX, framesInBeat, nextSubIndex, RESERVED_ROWS, rowY, subIndexOf } from "./frames";
import { isUnlinked, MARK_KINDS, markLabel, newMark, parseAtTokens } from "./card-marks";
import { downloadText } from "./export";
import { courseScriptMarkdown, scriptTree } from "./script-doc";
import { estimateFrameSeconds, formatReadTime, isOverReadTime } from "./script-timing";
import { NEON } from "./theme";
import { cardId, FRAME_H, FRAME_W, isContainerType, type Beat, type CardMark, type FrameScript, type MarkKind } from "./types";

const FIELD_BG = "rgba(255,255,255,0.05)";
const FIELD_BORDER = `1px solid ${NEON.borderSoft}`;
type AnyNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; measured?: { width?: number; height?: number }; data: Record<string, unknown> };

/** Focus the next scriptable field in document order (Enter / Ctrl+Enter flow). */
function focusNextField(cur: HTMLElement) {
  const all = [...document.querySelectorAll<HTMLElement>("[data-sefield]")];
  const next = all[all.indexOf(cur) + 1];
  if (next) { next.focus(); if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) next.select(); next.scrollIntoView({ block: "nearest" }); }
}

const BEAT_LABEL: Record<Beat, string> = { hook: "Hook", teach: "Teach", model_practice: "Model · Practice", cram: "Cram" };
// Hook frames get default names (shown until Lee renames): Intro · Outline · Teaser.
const HOOK_NAMES = ["Intro", "Outline", "Teaser"];
const defaultFrameName = (beat: Beat, n: number) => (beat === "hook" ? (HOOK_NAMES[n - 1] ?? "") : "");

export function ScriptEditor({ courseName, currentFrameId, onClose, statusCell, lessonControl, onOpenFrameNav }: {
  courseName: string;
  currentFrameId?: string | null;
  onClose: () => void;
  statusCell?: (frameId: string, status: import("./types").FilmStatus) => React.ReactNode;
  /** Per-lesson control in the header (the Publish button + status). */
  lessonControl?: (lessonId: string) => React.ReactNode;
  /** Open the on-canvas frame navigator (drag-drop strip) — moving frames lives
   *  there now, not in this modal. */
  onOpenFrameNav?: (frameId: string) => void;
}) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes() as unknown as AnyNode[];
  const tree = useMemo(() => scriptTree(nodes as never), [nodes]);
  const totals = tree.reduce((a, l) => ({ s: a.s + l.scripted, t: a.t + l.total }), { s: 0, t: 0 });

  const [filter, setFilter] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  // BEAT + JOURNAL toggles — LOCAL, so both reset to CLOSED every time the editor
  // opens (clean index you drill into). Keys: `${lessonId}:${beat}` / frameId.
  const [openBeats, setOpenBeats] = useState<Set<string>>(new Set());
  const [openJournals, setOpenJournals] = useState<Set<string>>(new Set());
  const toggleBeat = (key: string) => setOpenBeats((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleJournal = (fid: string) => setOpenJournals((s) => { const n = new Set(s); n.has(fid) ? n.delete(fid) : n.add(fid); return n; });
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

  // ONE FRAME AT A TIME (Lee's call) — the modal walks a SINGLE lesson's frames in
  // film order; lesson ‹ › switches lessons, frame ‹ › steps within it. Narrow
  // focus for creative writing.
  const [lessonIdx, setLessonIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || tree.length === 0) return;
    didInit.current = true;
    const li = currentLessonId ? tree.findIndex((l) => l.lessonId === currentLessonId) : 0;
    const L = Math.max(0, li);
    setLessonIdx(L);
    const flat = tree[L]?.beats.flatMap((g) => g.frames) ?? [];
    const fi = currentFrameId ? flat.findIndex((f) => f.frameId === currentFrameId) : 0;
    setFrameIdx(Math.max(0, fi));
  }, [tree, currentLessonId, currentFrameId]);
  const lesson = tree[Math.min(lessonIdx, Math.max(0, tree.length - 1))];
  const lessonFrames = useMemo(() => lesson?.beats.flatMap((g) => g.frames) ?? [], [lesson]);
  const fIdx = Math.min(frameIdx, Math.max(0, lessonFrames.length - 1));
  const frame = lessonFrames[fIdx];
  const gotoLesson = (d: -1 | 1) => { const n = Math.max(0, Math.min(tree.length - 1, lessonIdx + d)); setLessonIdx(n); setFrameIdx(0); };
  const gotoFrame = (d: -1 | 1) => setFrameIdx((i) => Math.max(0, Math.min(lessonFrames.length - 1, i + d)));
  const lessonNum = lesson ? (nodes.find((n) => n.id === lesson.lessonId)?.data.pathOrder as number | undefined) ?? (lessonIdx + 1) : 1;

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
  // frame NAME (editable) — coalesced keystrokes; hook frames default 1=Intro, 2=Outline, 3=Teaser.
  const patchFrameTitle = (frameId: string, title: string) => { const c = patchDataFnCmd(rfl, frameId, () => ({ title }), "frame name", `d:${frameId}:title`); if (c) bus.dispatch(c); };
  // JOURNAL (rich HTML) — the frame's workshop space.
  const patchJournal = (frameId: string, journal: string) => { const c = patchDataFnCmd(rfl, frameId, (prev) => ({ script: { ...((prev.script as FrameScript) ?? {}), journal } }), "edit journal", `d:${frameId}:journal`); if (c) bus.dispatch(c); };
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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.85)" }}>
        {/* header — lesson nav + export + close */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: NEON.borderSoft }}>
          <ScrollText className="h-4 w-4" style={{ color: NEON.yellow }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Course script</span>
          <span className="mx-1 flex items-center gap-1">
            <button className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: FIELD_BORDER }} title="Previous lesson" disabled={lessonIdx <= 0} onClick={() => gotoLesson(-1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="max-w-[38ch] truncate text-[12.5px] font-black" style={{ color: NEON.text }}>{lesson?.label ?? "—"}</span>
            <span className="text-[9px] tabular-nums" style={{ color: NEON.muted }}>{tree.length ? lessonIdx + 1 : 0}/{tree.length}</span>
            <button className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: FIELD_BORDER }} title="Next lesson" disabled={lessonIdx >= tree.length - 1} onClick={() => gotoLesson(1)}><ChevronRight className="h-3.5 w-3.5" /></button>
          </span>
          <span className="flex-1" />
          {lesson && lessonControl?.(lesson.lessonId)}
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold" style={{ color: NEON.cyan, border: FIELD_BORDER }} title="Export the whole course script as one markdown doc" onClick={exportScript}><Download className="h-3 w-3" /> Export</button>
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} title="Close (Esc)" onClick={onClose}><X className="h-3.5 w-3.5" /></button>
        </div>

        {/* ONE FRAME AT A TIME */}
        {!frame ? (
          <div className="py-16 text-center text-[12px]" style={{ color: NEON.muted }}>{tree.length === 0 ? '"Add region scaffold" builds the course structure first.' : "This lesson has no frames yet."}</div>
        ) : (() => {
          const marks = frame.script.marks ?? [];
          const code = `#${lessonNum}.${fIdx + 1}`;
          const kids = nodes.filter((n) => n.parentId === frame.frameId && !isContainerType(n.type));
          const TW = 360, TH = 202.5, sx = TW / FRAME_W, sy = TH / FRAME_H; // 16:9 thumb
          return (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* frame nav bar */}
            <div className="flex items-center gap-2 border-b px-4 py-1.5" style={{ borderColor: NEON.borderSoft }}>
              <button className="grid h-7 w-7 place-items-center rounded-full disabled:opacity-30" style={{ color: NEON.text, border: FIELD_BORDER }} title="Previous frame" disabled={fIdx <= 0} onClick={() => gotoFrame(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <span className="rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums" style={{ color: NEON.yellow, border: `1px solid rgba(232,184,75,0.5)` }}>{code}</span>
              <span className="text-[9.5px] tabular-nums" style={{ color: NEON.muted }}>frame {fIdx + 1}/{lessonFrames.length}</span>
              <button className="grid h-7 w-7 place-items-center rounded-full disabled:opacity-30" style={{ color: NEON.text, border: FIELD_BORDER }} title="Next frame" disabled={fIdx >= lessonFrames.length - 1} onClick={() => gotoFrame(1)}><ChevronRight className="h-4 w-4" /></button>
              <span className="flex-1" />
              {/* move frames on the canvas — not here */}
              {onOpenFrameNav && <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-semibold" style={{ color: NEON.cyan, border: FIELD_BORDER }} title="Open the frame navigator on the canvas to reorder / move frames" onClick={() => onOpenFrameNav(frame.frameId)}><LayoutGrid className="h-3 w-3" /> Move frames</button>}
              {/* OBS upload only */}
              {statusCell?.(frame.frameId, frame.filmStatus)}
            </div>

            {/* thumbnail (left) + writing (right) */}
            <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
              <div className="shrink-0">
                <div className="relative overflow-hidden rounded-lg" style={{ width: TW, height: TH, border: `1px solid ${NEON.border}`, background: "rgba(0,0,0,0.35)" }}>
                  {kids.map((n) => {
                    const w = Math.max(3, ((n.measured?.width ?? (n.data.w as number) ?? 220)) * sx);
                    const h = Math.max(2, ((n.measured?.height ?? (n.data.h as number) ?? 120)) * sy);
                    return <div key={n.id} className="absolute rounded-[2px]" style={{ left: n.position.x * sx, top: n.position.y * sy, width: w, height: h, background: "rgba(232,240,252,0.5)", border: "0.5px solid rgba(232,240,252,0.3)" }} />;
                  })}
                  {kids.length === 0 && <span className="absolute inset-0 grid place-items-center text-[11px] italic" style={{ color: NEON.muted }}>empty frame</span>}
                </div>
                <div className="mt-1 text-center text-[9px]" style={{ color: NEON.muted }}>a zoomed-out preview of this frame's cards</div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  {(() => { const s = estimateFrameSeconds(frame.script); if (!s) return null; const over = isOverReadTime(s); return <span className="shrink-0 rounded px-1 text-[9.5px] font-bold tabular-nums" title="Estimated spoken time (start a line with ! to mark a money line)" style={{ color: over ? "#FF8B9E" : NEON.muted, border: FIELD_BORDER }}>{formatReadTime(s)}</span>; })()}
                  <input key={`title-${frame.frameId}`} className="min-w-0 flex-1 rounded px-2 py-1.5 text-[15px] font-bold outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} defaultValue={frame.title} placeholder="Frame title" title="Frame title" onChange={(e) => patchFrameTitle(frame.frameId, e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                </div>
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Entry line</label>
                <input key={`entry-${frame.frameId}`} data-sefield className="w-full rounded px-2 py-1.5 text-[12.5px] outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} placeholder="How you walk into this frame…" defaultValue={frame.script.entry ?? ""} onChange={(e) => patchScript(frame.frameId, "entry", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Beats <span className="opacity-60">· one point per line · @ marks a card · ! = money line</span></label>
                <textarea key={`beats-${frame.frameId}`} data-sefield rows={5} className="w-full resize-none rounded px-2 py-1.5 text-[12.5px] leading-relaxed outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text, minHeight: 96 }} placeholder={"• point one\n• point two\n• point three"} defaultValue={frame.script.beats ?? ""}
                  onFocus={(e) => grow(e.currentTarget)} onInput={(e) => grow(e.currentTarget)}
                  onChange={(e) => patchScript(frame.frameId, "beats", e.target.value)}
                  onPaste={(e) => onBeatsPaste(frame.frameId, e)}
                  onKeyDown={(e) => { if (e.key === "@") { e.preventDefault(); openPicker(frame.frameId, e.currentTarget); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); focusNextField(e.currentTarget); } }} />
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Exit line</label>
                <input key={`exit-${frame.frameId}`} data-sefield className="w-full rounded px-2 py-1.5 text-[12.5px] outline-none focus:ring-1" style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }} placeholder="How you hand off to the next frame…" defaultValue={frame.script.exit ?? ""} onChange={(e) => patchScript(frame.frameId, "exit", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }} />

                {/* CARDS TO BUILD */}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>cards to build:</span>
                  {marks.length === 0 && <span className="text-[10px] italic" style={{ color: NEON.muted }}>none — type @ in beats</span>}
                  {marks.map((m) => {
                    const linked = m.linkedCardId && cardExists(m.linkedCardId);
                    return (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px]" style={{ background: linked ? "rgba(126,243,192,0.1)" : "rgba(252,163,17,0.1)", border: `1px solid ${linked ? "rgba(126,243,192,0.4)" : "rgba(252,163,17,0.4)"}` }}>
                        <b style={{ color: linked ? "#7EF3C0" : NEON.yellow }}>@{markLabel(m.kind)}</b>
                        <input value={m.note ?? ""} onChange={(e) => setNote(frame.frameId, m.id, e.target.value)} placeholder="note" title={m.note || "note"} className="w-24 bg-transparent text-[10px] outline-none" style={{ color: NEON.text }} />
                        {linked ? (
                          <button className="grid h-4 w-4 place-items-center" style={{ color: "#7EF3C0" }} title="Linked — click to unlink" onClick={() => linkMark(frame.frameId, m.id, null)}><Link2 className="h-3 w-3" /></button>
                        ) : (
                          <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.muted }} title="Link to a card on this frame" onClick={(e) => setLinkFor({ frameId: frame.frameId, markId: m.id, rect: e.currentTarget.getBoundingClientRect() })}><Link2Off className="h-3 w-3" /></button>
                        )}
                        <button className="grid h-4 w-4 place-items-center" style={{ color: NEON.red }} title="Remove mark" onClick={() => removeMark(frame.frameId, m.id)}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    );
                  })}
                </div>

                {/* JOURNAL */}
                <div className="mt-1">
                  <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: (frame.script.journal ?? "").trim() ? NEON.yellow : NEON.muted, border: `1px solid ${(frame.script.journal ?? "").trim() ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }} title="Free-text space to riff on ideas for this frame" onClick={() => toggleJournal(frame.frameId)}>
                    <NotebookPen className="h-2.5 w-2.5" /> Journal{(frame.script.journal ?? "").replace(/<[^>]*>/g, "").trim() ? " •" : ""}
                  </button>
                  {openJournals.has(frame.frameId) && <JournalEditor key={`journal-${frame.frameId}`} html={frame.script.journal ?? ""} onChange={(h) => patchJournal(frame.frameId, h)} />}
                </div>
              </div>
            </div>
          </div>
          );
        })()}
        <div className="border-t px-4 py-1.5 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>Type @ in beats to mark a card · Enter → next field · Ctrl+Enter leaves beats · {totals.s}/{totals.t} scripted · edits autosave to the canvas (undoable)</div>
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

/** JOURNAL — a lightweight rich-text scratchpad (bold + bullet list) per frame.
 *  contentEditable + execCommand keeps it dependency-free; stores innerHTML. */
function JournalEditor({ html, onChange }: { html: string; onChange: (h: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // seed innerHTML ONCE (React must not re-render into it or the caret jumps)
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const exec = (cmd: string) => { ref.current?.focus(); document.execCommand(cmd, false); onChange(ref.current?.innerHTML ?? ""); };
  const btn = "grid h-5 w-5 place-items-center rounded";
  return (
    <div className="mt-1 rounded-lg" style={{ background: FIELD_BG, border: FIELD_BORDER }}>
      <div className="flex items-center gap-0.5 border-b px-1 py-0.5" style={{ borderColor: NEON.borderSoft }}>
        <button className={btn} style={{ color: NEON.text }} title="Bold (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}><Bold className="h-3 w-3" /></button>
        <button className={btn} style={{ color: NEON.text }} title="Bullet list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")}><List className="h-3 w-3" /></button>
        <span className="ml-1 text-[8.5px] uppercase tracking-wider" style={{ color: NEON.muted }}>workshop — never on camera</span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="sa-journal min-h-[52px] max-h-56 overflow-auto px-2 py-1.5 text-[11.5px] leading-snug outline-none"
        style={{ color: NEON.text }}
        data-placeholder="Riff on ideas for this frame…"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <style>{`.sa-journal ul{list-style:disc;padding-left:1.2em;margin:0}.sa-journal:empty::before{content:attr(data-placeholder);color:${NEON.muted};opacity:.7}`}</style>
    </div>
  );
}
