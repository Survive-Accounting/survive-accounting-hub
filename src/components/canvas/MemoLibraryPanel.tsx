// MEMO LIBRARY (left drawer) — browse every memo in a lesson, curate the order
// they'd deal, multi-select, and drop COPIES into the frame you're in for a
// recap/summary slide. Replaces the old right-panel "dump all memos" button.
//
// Design (Lee): originals stay in their home frames; adding places copies into
// the current frame (deckId `memolib::<frame>`, re-add replaces that frame's
// copies). Reorder writes `data.libOrder` (lesson-wide, persistent) — this is
// the fill order when added, NOT a memo-deck deal order. Additive only: memos
// without libOrder sort last (stable), so old scenes read unchanged.
import { useMemo, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ArrowDown, ArrowUp, CheckSquare, Layers, Square } from "lucide-react";

import { gridSlots } from "./deck-defs";
import { addNodesCmd, bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { useFrameNav } from "./FrameNavContext";
import { cardId, type MemoCard } from "./types";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { NEON } from "./theme";

const NONE = "__none__"; // sentinel for an uncategorised memo in the category filter

/** Walk parentId up to the enclosing lesson (≤6 hops). Null if none. */
function lessonOf(rf: ReturnType<typeof useReactFlow>, start: { parentId?: string }): string | null {
  let cur: { parentId?: string } | undefined = start;
  let guard = 0;
  while (cur?.parentId && guard++ < 6) {
    const p = rf.getNode(cur.parentId);
    if (!p) return null;
    if (p.type === "lesson") return p.id;
    cur = p;
  }
  return null;
}

const catKey = (c: string | undefined) => {
  const up = String(c ?? "").toUpperCase().trim();
  return up === "" ? NONE : up;
};

export function MemoLibraryPanel() {
  const rf = useReactFlow();
  const nodes = useNodes(); // re-render as memos/frames change
  const nav = useFrameNav();

  // The frame we'd add into, and its lesson (the default library scope).
  const curFrame = nav.currentFrameId ? rf.getNode(nav.currentFrameId) : null;
  const frameLessonId = curFrame?.type === "frame" && curFrame.parentId && rf.getNode(curFrame.parentId)?.type === "lesson" ? curFrame.parentId : null;

  const lessons = useMemo(
    () => rf.getNodes().filter((n) => n.type === "lesson").map((n) => ({ id: n.id, label: String((n.data as { label?: string }).label ?? "Lesson") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length],
  );

  const [lessonPick, setLessonPick] = useState<string | null>(null);
  const lessonId = lessonPick ?? frameLessonId ?? lessons[0]?.id ?? null;

  const [catFilter, setCatFilter] = useState<Set<string>>(() => new Set([...MEMO_CATEGORIES, NONE]));
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState<string | null>(null);

  // Full lesson memo list in LIBRARY order (libOrder asc; absent sorts last,
  // ties broken by node array index for stability). Filtered list is display.
  const orderIndex = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);
  const fullMemos = useMemo(() => {
    if (!lessonId) return [];
    return rf.getNodes()
      .filter((n) => n.type === "memo" && lessonOf(rf, n) === lessonId)
      .sort((a, b) => {
        const la = (a.data as unknown as MemoCard).libOrder ?? Number.MAX_SAFE_INTEGER;
        const lb = (b.data as unknown as MemoCard).libOrder ?? Number.MAX_SAFE_INTEGER;
        return la - lb || (orderIndex.get(a.id)! - orderIndex.get(b.id)!);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, nodes, orderIndex]);

  const shown = fullMemos.filter((m) => catFilter.has(catKey((m.data as unknown as MemoCard).category)));

  const toggleCat = (c: string) => setCatFilter((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((m) => sel.has(m.id));
  const selectAllShown = () => setSel((prev) => { const n = new Set(prev); if (allShownSelected) shown.forEach((m) => n.delete(m.id)); else shown.forEach((m) => n.add(m.id)); return n; });

  /** Move a memo one slot within the FULL lesson list; re-stamp libOrder across
   *  the whole lesson so the order is total + stable. Undoable. */
  const move = (id: string, dir: -1 | 1) => {
    const i = fullMemos.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fullMemos.length) return;
    const arr = fullMemos.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const cmd = compositeCmd(
      arr.map((m, idx) => patchDataCmd(rf as unknown as RfLike, m.id, { libOrder: idx }, "reorder memo library")).filter((c): c is NonNullable<typeof c> => !!c),
      "reorder memo library",
    );
    if (cmd) bus.dispatch(cmd);
  };

  /** Drop COPIES of the selected memos (in library order) into the current
   *  frame, in a grid. Re-add replaces this frame's prior library copies. */
  const addToFrame = () => {
    const frameId = nav.currentFrameId;
    const frame = frameId ? rf.getNode(frameId) : null;
    if (!frame || frame.type !== "frame") { setNote("Enter a frame first (double-click it), then add."); return; }
    const chosen = fullMemos.filter((m) => sel.has(m.id)); // library order, selected only
    if (chosen.length === 0) { setNote("Select one or more memos to add."); return; }

    const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
    const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
    const cols = Math.max(1, Math.ceil(Math.sqrt(chosen.length)));
    const rows = Math.ceil(chosen.length / cols);
    const pad = 40, gap = 20;
    const cellW = Math.max(160, (fw - 2 * pad - (cols - 1) * gap) / cols);
    const cellH = Math.max(80, (fh - 2 * pad - (rows - 1) * gap) / rows);
    const slots = gridSlots(chosen.length, { originX: pad, originY: pad, cols, cellW, cellH, gapX: gap, gapY: gap });

    const deckId = `memolib::${frameId}`; // one library summary per frame — re-add replaces
    const existing = rf.getNodes().filter((n) => (n.data as { deckId?: string }).deckId === deckId);
    const existingIds = new Set(existing.map((n) => n.id));
    const removeSnap = existing.map((n) => structuredClone(n));
    const newNodes = chosen.map((m, i) => {
      const d = m.data as unknown as MemoCard;
      return {
        id: cardId("memo"), type: "memo", parentId: frameId, position: { ...slots[i] }, selected: false,
        data: { kind: "memo", memoKind: d.memoKind ?? "note", title: d.title, body: d.body ?? "", category: d.category, w: d.w, deckId } as Record<string, unknown>,
      };
    });
    const cmds = [
      removeSnap.length ? { label: "clear old library copies", do: () => rf.setNodes((nds) => nds.filter((n) => !existingIds.has(n.id))), undo: () => rf.setNodes((nds) => [...nds, ...removeSnap.map((n) => structuredClone(n))]) } : null,
      addNodesCmd(rf as unknown as RfLike, newNodes as never, `add ${newNodes.length} memos to frame`),
    ].filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "add memos to frame");
    if (cmd) bus.dispatch(cmd);
    setNote(`added ${newNodes.length} memo${newNodes.length === 1 ? "" : "s"} to this frame`);
  };

  const canAdd = curFrame?.type === "frame";

  return (
    <div className="flex flex-col gap-2 p-1 text-[11px]" style={{ color: NEON.text }}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>
        <Layers className="h-3 w-3" /> Memo library
      </div>

      {/* LESSON SCOPE */}
      <label className="flex flex-col gap-0.5">
        <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Lesson</span>
        <select
          value={lessonId ?? ""}
          onChange={(e) => { setLessonPick(e.target.value || null); setSel(new Set()); }}
          className="rounded bg-black/40 px-1 py-0.5 text-[10px]"
          style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
        >
          {lessons.length === 0 && <option value="">no lessons in scene</option>}
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>

      {/* CATEGORY FILTER */}
      <div className="flex flex-wrap gap-1">
        {[...MEMO_CATEGORIES, NONE].map((c) => {
          const on = catFilter.has(c);
          return (
            <button key={c} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.yellow : "transparent", border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}` }}
              onClick={() => toggleCat(c)}>
              {c === NONE ? "Uncat." : c}
            </button>
          );
        })}
      </div>

      {/* SELECT-ALL + COUNT */}
      <div className="flex items-center justify-between text-[9px]" style={{ color: NEON.muted }}>
        <button className="flex items-center gap-1 rounded px-1 py-0.5 font-bold uppercase tracking-wide"
          style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={selectAllShown} disabled={shown.length === 0}>
          {allShownSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />} {allShownSelected ? "none" : "all"}
        </button>
        <span>{sel.size} selected · {shown.length} shown</span>
      </div>

      {/* MEMO LIST */}
      <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-0.5">
        {shown.length === 0 && <div className="px-0.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>No memos in this lesson match the filter.</div>}
        {shown.map((m) => {
          const d = m.data as unknown as MemoCard;
          const on = sel.has(m.id);
          const fi = fullMemos.findIndex((x) => x.id === m.id);
          const label = (d.title && d.title.trim()) || (d.body || "").trim() || "(empty memo)";
          return (
            <div key={m.id} className="flex items-start gap-1 rounded px-1 py-1"
              style={{ background: on ? "rgba(252,163,17,0.12)" : "rgba(0,0,0,0.25)", border: `1px solid ${on ? NEON.border : NEON.borderSoft}` }}>
              <button className="mt-0.5 shrink-0" onClick={() => toggleSel(m.id)} title={on ? "Deselect" : "Select"} style={{ color: on ? NEON.yellow : NEON.muted }}>
                {on ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              </button>
              <button className="min-w-0 flex-1 text-left" onClick={() => toggleSel(m.id)}>
                <div className="truncate text-[10.5px] font-semibold" style={{ color: NEON.text }} title={label}>{label}</div>
                {d.category && <div className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>{d.category}</div>}
              </button>
              <div className="flex shrink-0 flex-col">
                <button disabled={fi <= 0} className="grid h-3.5 w-4 place-items-center rounded transition-opacity disabled:opacity-25" style={{ color: NEON.muted }} title="Move earlier" onClick={() => move(m.id, -1)}><ArrowUp className="h-3 w-3" /></button>
                <button disabled={fi >= fullMemos.length - 1} className="grid h-3.5 w-4 place-items-center rounded transition-opacity disabled:opacity-25" style={{ color: NEON.muted }} title="Move later" onClick={() => move(m.id, 1)}><ArrowDown className="h-3 w-3" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD TO FRAME */}
      <button className="w-full rounded px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wide disabled:opacity-40"
        style={{ color: canAdd ? "#0B0F1E" : NEON.muted, background: canAdd ? NEON.cyan : "transparent", border: `1px solid ${canAdd ? NEON.cyan : NEON.borderSoft}` }}
        title={canAdd ? "Drop copies of the selected memos into the frame you're in (re-add replaces)." : "Enter a frame first (double-click it) to add memos."}
        onClick={addToFrame} disabled={!canAdd}>
        Add selected to {canAdd ? "this frame" : "frame — enter one first"}
      </button>
      {note && <div className="px-0.5 text-[9px] leading-snug" style={{ color: NEON.muted }}>{note}</div>}
    </div>
  );
}
