// CUE SHEET panel (AC4 + Phase 2) — the frame's whole space-walk sequence, read
// LIVE from the canvas: deck deals (deck order), each card's reveal steps, its
// memos, then advance. A "next" chip mirrors what Space will do. Click a
// deal/reveal cue to EXECUTE the frame up to that point (authoring).
//
// PHASE 2: DRAG (or ↑/↓) reorders ANY cue — interleave a memo between two reveals,
// reorder reveals across cards — writing the frame's explicit `cueOrder`, which the
// space ladder then performs in that exact order. A "custom" badge + Reset return
// the frame to the derived order.
import { useState } from "react";
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Circle, ExternalLink, Flame, GripVertical, Layers, ListOrdered, MousePointerClick, RotateCcw, Sparkles, StickyNote, Trash2, X } from "lucide-react";

import { bus, type RfLike } from "./commands";
import { cueIsDone, currentRevealCount, deriveFrameCues, nextCueIndex, orderedCues, revealPatchForCount, type Cue, type CueState } from "./cue-sheet";
import { patchDataCmd } from "./commands";
import { frameWalkNext } from "./frames";
import { NEON } from "./theme";
import { isContainerType, type CardData, type RecCue } from "./types";

const REC_META: Record<RecCue["kind"], { icon: typeof Layers; color: string; verb: string }> = {
  deal: { icon: Layers, color: NEON.cyan, verb: "Deal" },
  reveal: { icon: MousePointerClick, color: "#7EF3C0", verb: "Reveal" },
  memo: { icon: StickyNote, color: "#FCA311", verb: "Memo" },
  spot: { icon: Sparkles, color: "#FCD34D", verb: "Spot" },
  super: { icon: Flame, color: "#FF7A00", verb: "Super" },
  advance: { icon: ChevronDown, color: NEON.muted, verb: "Advance" },
};

type AnyNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data: CardData & { deckMember?: boolean; tucked?: boolean; stageOrder?: number; title?: string; memoKind?: string; body?: string; cueHidden?: boolean } };

const KIND_META: Record<Cue["kind"], { icon: typeof Layers; color: string; verb: string }> = {
  deal: { icon: Layers, color: NEON.cyan, verb: "Deal" },
  reveal: { icon: MousePointerClick, color: "#7EF3C0", verb: "Reveal" },
  memo: { icon: StickyNote, color: "#FCA311", verb: "Memo" },
  advance: { icon: ChevronDown, color: NEON.muted, verb: "Advance" },
};

export function CueSheet({ frameId, onClose, onPopOut, inPopout, recording, onToggleRecord }: { frameId: string; onClose: () => void; onPopOut?: () => void; inPopout?: boolean; recording?: boolean; onToggleRecord?: () => void }) {
  const rf = useReactFlow();
  const nodes = useNodes() as unknown as AnyNode[];
  const edges = useEdges() as unknown as { id: string; source: string; target: string }[];
  const [dragId, setDragId] = useState<string | null>(null);
  const rfl = rf as unknown as RfLike;

  const frame = nodes.find((n) => n.id === frameId);
  const cueOrder = (frame?.data as { cueOrder?: string[] } | undefined)?.cueOrder;
  const isCustom = !!cueOrder && cueOrder.length > 0;
  // RECORDED CUES (Lee): when present, they OVERRIDE the derived list — the panel
  // shows the recording (delete / reorder / super-on-entry) instead.
  const recorded = (frame?.data as { recordedCues?: RecCue[] } | undefined)?.recordedCues ?? [];
  const hasRecording = recorded.length > 0;
  const writeRec = (cues: RecCue[] | null) => { const c = patchDataCmd(rfl, frameId, { recordedCues: cues && cues.length ? cues : undefined }, cues ? "edit recording" : "clear recording"); if (c) bus.dispatch(c); };
  const moveRec = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= recorded.length) return; const next = [...recorded]; [next[i], next[j]] = [next[j], next[i]]; writeRec(next); };
  const delRec = (id: string) => writeRec(recorded.filter((c) => c.id !== id));
  const toggleSuperEntry = (id: string) => writeRec(recorded.map((c) => (c.id === id ? { ...c, superOnEntry: !c.superOnEntry } : c)));

  const children = nodes.filter((n) => n.parentId === frameId);
  const cards = children.filter((n) => !isContainerType(n.type) && n.data.kind !== "memo");
  const memos = children.filter((n) => n.data.kind === "memo");
  const hasNext = !!frameWalkNext(nodes as never, frameId);
  const cues = orderedCues(deriveFrameCues(cards as never, memos as never, edges, hasNext), cueOrder);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const memoById = new Map(memos.map((m) => [m.id, m]));
  const state: CueState = {
    isDealt: (id) => { const c = byId.get(id); return !!c && !c.data.tucked; },
    revealCount: (id) => { const c = byId.get(id); return c ? currentRevealCount(c.data) : 0; },
    memoVisible: (id) => { const m = memoById.get(id); return !!m && !m.data.cueHidden; },
  };
  const nextIdx = nextCueIndex(cues, state);

  /** Execute the frame up to (and including) cue `idx`. */
  const jumpToCue = (idx: number) => {
    const dealt = new Set<string>();
    const revealTo = new Map<string, number>();
    const memoShown = new Set<string>();
    cues.slice(0, idx + 1).forEach((c) => {
      if (c.kind === "deal" && c.cardId) dealt.add(c.cardId);
      if (c.kind === "reveal" && c.cardId) revealTo.set(c.cardId, c.revealCount ?? 0);
      if (c.kind === "memo" && c.memoId) memoShown.add(c.memoId);
    });
    const before = new Map<string, CardData>([...cards, ...memos].map((n) => [n.id, { ...n.data }]));
    const after = new Map<string, CardData>();
    for (const c of cards) {
      const isDeck = !!c.data.deckMember;
      const isDealt = isDeck ? dealt.has(c.id) : true;
      const rc = isDealt ? (revealTo.get(c.id) ?? 0) : 0;
      after.set(c.id, { ...c.data, ...revealPatchForCount(c.data, rc), ...(isDeck ? { tucked: !isDealt } : {}) } as CardData);
    }
    // memos: only sequenced-and-reached memos show; the rest hide (cue mode)
    for (const m of memos) after.set(m.id, { ...m.data, cueHidden: !memoShown.has(m.id) } as CardData);
    const apply = (mm: Map<string, CardData>) => rf.setNodes((nds) => nds.map((n) => (mm.has(n.id) ? { ...n, data: { ...mm.get(n.id) } } : n)));
    bus.dispatch({ label: "cue → here", do: () => apply(after), undo: () => apply(before) });
    const cid = cues[idx]?.cardId;
    if (cid) rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === cid) ? { ...n, selected: n.id === cid } : n)));
  };

  /** Write the frame's explicit cue order (Phase 2). Passing null clears it. */
  const writeOrder = (ids: string[] | null) => {
    const c = patchDataCmd(rfl, frameId, { cueOrder: ids ?? undefined }, ids ? "reorder cues" : "reset cue order");
    if (c) bus.dispatch(c);
  };
  const currentIds = () => cues.map((c) => c.id);
  const moveCue = (i: number, dir: -1 | 1) => {
    const ids = currentIds();
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    writeOrder(ids);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = currentIds().filter((id) => id !== dragId);
    const ti = ids.indexOf(targetId);
    ids.splice(ti, 0, dragId); // insert BEFORE the target
    writeOrder(ids);
    setDragId(null);
  };

  return (
    <div
      className={inPopout ? "flex h-full w-full flex-col" : "absolute bottom-4 right-4 z-40 flex max-h-[70vh] w-72 flex-col rounded-xl"}
      style={inPopout ? { background: NEON.bg, color: NEON.text } : { background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 20px 50px -18px rgba(0,0,0,0.75)" }}
    >
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <ListOrdered className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Cue sheet</span>
        {isCustom && !hasRecording && <span className="rounded px-1 text-[8px] font-bold uppercase" style={{ background: "rgba(252,163,17,0.85)", color: "#0B1322" }}>custom</span>}
        {hasRecording && <span className="rounded px-1 text-[8px] font-bold uppercase" style={{ background: "rgba(224,40,74,0.9)", color: "#fff" }}>rec</span>}
        <span className="flex-1" />
        {onToggleRecord && (
          <button
            className="flex h-5 items-center gap-1 rounded px-1.5 text-[9px] font-bold uppercase"
            style={{ color: recording ? "#fff" : NEON.muted, background: recording ? "rgba(224,40,74,0.9)" : "transparent", border: `1px solid ${recording ? "rgba(224,40,74,0.9)" : NEON.borderSoft}` }}
            title={recording ? "Stop recording" : "Record a run: do actions (spotlight / reveal / deal) and each becomes a cue. Overrides the space-walk."}
            onClick={onToggleRecord}
          >
            <Circle className="h-2.5 w-2.5" style={{ fill: "currentColor" }} /> {recording ? "Stop" : "Rec"}
          </button>
        )}
        {hasRecording && !recording && <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Clear the recording (back to the derived walk)" onClick={() => writeRec(null)}><RotateCcw className="h-3 w-3" /></button>}
        {isCustom && !hasRecording && <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Reset to the derived order" onClick={() => writeOrder(null)}><RotateCcw className="h-3 w-3" /></button>}
        <span className="text-[9.5px]" style={{ color: NEON.muted }}>{cues.length}</span>
        {onPopOut && !inPopout && <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Pop out to a second window (off-stage for OBS)" onClick={onPopOut}><ExternalLink className="h-3 w-3" /></button>}
        {!inPopout && <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} title="Close" onClick={onClose}><X className="h-3 w-3" /></button>}
      </div>
      {/* SCRIPT (script editor) — what Lee SAYS in this frame, above what happens */}
      {(() => {
        const s = (frame?.data as { script?: { entry?: string; beats?: string; exit?: string } } | undefined)?.script;
        const beats = (s?.beats ?? "").split("\n").map((b) => b.trim().replace(/^[-*•]\s+/, "")).filter(Boolean);
        if (!s || (!(s.entry ?? "").trim() && beats.length === 0 && !(s.exit ?? "").trim())) return null;
        return (
          <div className="border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-0.5 text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.cyan }}>Script</div>
            {(s.entry ?? "").trim() && <p className="text-[11px] font-semibold leading-snug" style={{ color: "#FFD98A" }}>{s.entry}</p>}
            {beats.map((b, i) => (
              <p key={i} className="flex gap-1 text-[10.5px] leading-snug" style={{ color: NEON.text }}>
                <span className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full" style={{ background: NEON.yellow }} />
                {b}
              </p>
            ))}
            {(s.exit ?? "").trim() && <p className="text-[10.5px] italic leading-snug" style={{ color: NEON.cyan }}>→ {s.exit}</p>}
          </div>
        );
      })()}
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {/* RECORDED run (Lee) — overrides the derived walk. Reorder ↑/↓, delete,
            and toggle "super on entry" per spotlight. */}
        {hasRecording ? (
          <ol className="space-y-0.5">
            {recorded.map((c, i) => {
              const m = REC_META[c.kind];
              const Icon = m.icon;
              const isSpot = c.kind === "spot";
              return (
                <li key={c.id}>
                  <div className="group/rec flex items-center gap-1 rounded px-1 py-1 text-[11px]" style={{ background: "transparent" }}>
                    <span className="w-4 shrink-0 text-right text-[9px] tabular-nums" style={{ color: NEON.muted }}>{i + 1}</span>
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ color: m.color }}><Icon className="h-3 w-3" /></span>
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide" style={{ color: m.color }}>{m.verb}</span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }}>{c.target}</span>
                    {isSpot && (
                      <button
                        className="shrink-0 rounded px-1 text-[8px] font-bold uppercase"
                        style={{ color: c.superOnEntry ? "#fff" : NEON.muted, background: c.superOnEntry ? "rgba(255,122,0,0.85)" : "transparent", border: `1px solid ${c.superOnEntry ? "rgba(255,122,0,0.85)" : NEON.borderSoft}` }}
                        title={c.superOnEntry ? "Enters as SUPER-spotlight (click for regular)" : "Enter as super-spotlight on this cue"}
                        onClick={() => toggleSuperEntry(c.id)}
                      >
                        {c.superOnEntry ? "super" : "reg"}
                      </button>
                    )}
                    <span className="flex shrink-0 opacity-0 transition-opacity group-hover/rec:opacity-100">
                      <button className="grid h-4 w-4 place-items-center" title="Move up" onClick={() => moveRec(i, -1)} style={{ color: NEON.muted }}><ChevronUp className="h-3 w-3" /></button>
                      <button className="grid h-4 w-4 place-items-center" title="Move down" onClick={() => moveRec(i, 1)} style={{ color: NEON.muted }}><ChevronDown className="h-3 w-3" /></button>
                      <button className="grid h-4 w-4 place-items-center" title="Delete" onClick={() => delRec(c.id)} style={{ color: "#FF6B6B" }}><Trash2 className="h-3 w-3" /></button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (<>
        {cues.length === 0 && <div className="px-2 py-3 text-center text-[10.5px]" style={{ color: NEON.muted }}>No cues yet — add cards to this frame.</div>}
        <ol className="space-y-0.5">
          {cues.map((c, i) => {
            const m = KIND_META[c.kind];
            const Icon = m.icon;
            const done = cueIsDone(c, state);
            const isNext = i === nextIdx;
            const clickable = c.kind === "deal" || c.kind === "reveal" || c.kind === "memo";
            const draggable = c.kind !== "advance";
            return (
              <li key={c.id}>
                <div
                  draggable={draggable}
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => { if (draggable) e.preventDefault(); }}
                  onDrop={() => draggable && dropOn(c.id)}
                  className="group/cue flex items-center gap-1 rounded px-1 py-1 text-[11px]"
                  style={{
                    background: isNext ? "rgba(252,163,17,0.14)" : dragId === c.id ? "rgba(252,163,17,0.08)" : done ? "rgba(126,243,192,0.06)" : "transparent",
                    border: `1px solid ${isNext ? "rgba(252,163,17,0.55)" : "transparent"}`,
                    opacity: done && !isNext ? 0.6 : 1,
                  }}
                >
                  {draggable && <GripVertical className="h-3 w-3 shrink-0 cursor-grab opacity-30 group-hover/cue:opacity-70" style={{ color: NEON.muted }} />}
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded" style={{ color: m.color }}><Icon className="h-3 w-3" /></span>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide" style={{ color: m.color }}>{m.verb}</span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: NEON.text, cursor: clickable ? "pointer" : "default" }}
                    title={clickable ? "Play the frame up to this cue" : undefined}
                    onClick={clickable ? () => jumpToCue(i) : undefined}
                  >
                    {c.target}
                  </span>
                  {isNext && <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ background: "rgba(252,163,17,0.9)", color: "#0B1322" }}>next</span>}
                  {draggable && (
                    <span className="flex shrink-0 opacity-0 transition-opacity group-hover/cue:opacity-100">
                      <button className="grid h-4 w-4 place-items-center" title="Move up" onClick={(e) => { e.stopPropagation(); moveCue(i, -1); }} style={{ color: NEON.muted }}><ChevronUp className="h-3 w-3" /></button>
                      <button className="grid h-4 w-4 place-items-center" title="Move down" onClick={(e) => { e.stopPropagation(); moveCue(i, 1); }} style={{ color: NEON.muted }}><ChevronDown className="h-3 w-3" /></button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        </>)}
      </div>
      <div className="border-t px-2.5 py-1 text-[9px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
        {recording ? "Recording — spotlight / reveal / deal are captured. Stop when done." : hasRecording ? "Recorded run plays on Space · ↑/↓ reorder · super = enters as super-spotlight" : "Click a cue to play to it · drag or ↑/↓ to reorder" + (isCustom ? " · custom order active" : "")}
      </div>
    </div>
  );
}
