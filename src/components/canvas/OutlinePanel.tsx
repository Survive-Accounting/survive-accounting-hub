// OUTLINE v2 (prompt 4) — the source-of-truth NAVIGATOR (Obsidian-style). A live
// tree rendered FROM scene structure, collapsible at every level:
//   Course → Topic → Category (CEQ / Teach / Practice / Nerd Out) → Video (the
//   lesson + its video slot; Free/Paid under CEQ) → Frame → CEQ (T.QQ) → choices →
//   chain memos (in order).
// Clicking any node navigates (activate lesson · enter frame · focus card · open
// video slot). Ctrl+K focuses the fuzzy quick-jump (topics · CEQ stems · memo
// labels) — Enter jumps to the top match. Memo labels are renamable inline. Copy a
// memo or a whole CEQ, paste onto another choice/CEQ as an independent COPY (with a
// sourceId link back). Publish colours + "X of Y" chip stay. Updates live because it
// reads the same node store the canvas mutates.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { Check, ChevronDown, ChevronRight, Clapperboard, ClipboardCopy, ClipboardPaste, Layers, ListVideo, Search, X } from "lucide-react";

import { addNodesAndEdgesCmd, bus, patchDataFnCmd, type RfLike } from "./commands";
import { chainAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { NEON } from "./theme";
import { useFrameNav } from "./FrameNavContext";
import { BEAT_COLUMNS, beatColOf, framesInLesson } from "./frames";
import { BEAT_META } from "./cards/FrameNode";
import { cardId, LESSON_CATEGORIES, LESSON_CATEGORY_LABEL, LESSON_STATUSES, type CardBase, type CardNode, type CeqCard, type CeqChoice, type FrameBox, type LessonBox, type LessonCategory, type LessonStatus } from "./types";

const STATUS_TONE: Record<LessonStatus, string> = { UNFILMED: "#FF5C6C", FILMED: "#FCA311", PUBLISHED: "#3BF5A0" };
const CATEGORY_TONE: Record<LessonCategory, string> = { CEQ: "#FF8B9E", TEACH: NEON.cyan, PRACTICE: "#7EF3C0", NERD_OUT: NEON.muted };
const statusOf = (l: CardNode): LessonStatus => ((l.data as unknown as LessonBox).status ?? "UNFILMED");
const topicOf = (l: CardNode): string => (((l.data as unknown as LessonBox).topic || (l.data as unknown as LessonBox).label || "").trim() || "(no topic)");
const categoryOf = (l: CardNode): LessonCategory => ((l.data as unknown as LessonBox).category ?? "TEACH");
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const memoText = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo");
const clip = (s: string, n = 46) => (s.length > n ? s.slice(0, n) + "…" : s);

function absRect(n: CardNode, byId: Map<string, CardNode>) {
  let x = n.position.x, y = n.position.y;
  let p = n.parentId ? byId.get(n.parentId) : undefined;
  while (p) { x += p.position.x; y += p.position.y; p = p.parentId ? byId.get(p.parentId) : undefined; }
  const w = (n.measured?.width ?? ((n.data as unknown as CardBase).w as number) ?? 300) as number;
  const h = (n.measured?.height ?? ((n.data as unknown as CardBase).h as number) ?? 170) as number;
  return { x, y, w, h };
}
const labelOf = (n: CardNode): string => { const d = n.data as unknown as Record<string, unknown>; return (d.label as string) || (d.caption as string) || (d.title as string) || (d.prompt as string) || (d.text as string) || ((d.kind as string) ?? n.type ?? "card"); };
const pathOrderOf = (n: CardNode): number => { const v = (n.data as unknown as Record<string, unknown>).pathOrder; return typeof v === "number" ? v : Number.POSITIVE_INFINITY; };
const stageOrderOf = (n: CardNode): number => { const v = (n.data as { stageOrder?: number }).stageOrder; return typeof v === "number" ? v : 9999; };

type ClipItem = { kind: "memo"; title?: string; body?: string; category?: string; label?: string; memoKind?: string; sourceId: string } | { kind: "ceq"; data: Record<string, unknown>; sourceId: string };

export function OutlinePanel() {
  const nodes = useNodes() as CardNode[];
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nav = useFrameNav();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [clipItem, setClipItem] = useState<ClipItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Ctrl+K focuses the quick-jump search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lessons = useMemo(() => nodes.filter((n) => n.type === "lesson").sort((a, b) => pathOrderOf(a) - pathOrderOf(b) || absRect(a, byId).y - absRect(b, byId).y), [nodes, byId]);
  const regionLabel = useMemo(() => { const z = nodes.find((n) => n.type === "zone"); return z ? labelOf(z) : "Course"; }, [nodes]);
  const framesByLesson = useMemo(() => { const m = new Map<string, CardNode[]>(); for (const l of lessons) m.set(l.id, framesInLesson(nodes as never, l.id) as unknown as CardNode[]); return m; }, [nodes, lessons]);
  const ceqsByFrame = useMemo(() => {
    const m = new Map<string, CardNode[]>();
    for (const n of nodes) { if (n.type !== "ceq" || (n.data as CardBase).tucked) continue; const p = n.parentId; if (p && byId.get(p)?.type === "frame") { const a = m.get(p) ?? []; a.push(n); m.set(p, a); } }
    for (const a of m.values()) a.sort((x, y) => stageOrderOf(x) - stageOrderOf(y));
    return m;
  }, [nodes, byId]);

  // Topic groups in path order; topic index T (1-based) for CEQ numbering T.QQ.
  const topicGroups = useMemo(() => {
    const m = new Map<string, CardNode[]>();
    for (const l of lessons) { const t = topicOf(l); (m.get(t) ?? m.set(t, []).get(t)!).push(l); }
    return [...m.entries()];
  }, [lessons]);
  const publishedCount = useMemo(() => lessons.filter((l) => statusOf(l) === "PUBLISHED").length, [lessons]);

  // CEQ numbering T.QQ — QQ increments across a TOPIC's CEQs in deck (stage) order.
  const ceqNumber = useMemo(() => {
    const num = new Map<string, string>();
    topicGroups.forEach(([, tl], ti) => {
      let q = 0;
      for (const l of tl) for (const f of (framesByLesson.get(l.id) ?? [])) for (const c of (ceqsByFrame.get(f.id) ?? [])) { q++; num.set(c.id, `${ti + 1}.${String(q).padStart(2, "0")}`); }
    });
    return num;
  }, [topicGroups, framesByLesson, ceqsByFrame]);

  const toggle = (id: string) => setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isOpen = (id: string) => !collapsed.has(id);
  const fly = (n: CardNode) => { const r = absRect(n, byId); void rf.fitBounds({ x: r.x, y: r.y, width: r.w, height: r.h }, { duration: 500, padding: 0.3 }); };
  const cycleStatus = (l: CardNode) => { const cur = statusOf(l); rf.updateNodeData(l.id, { status: LESSON_STATUSES[(LESSON_STATUSES.indexOf(cur) + 1) % LESSON_STATUSES.length] }); };

  // ---- QUICK JUMP (Ctrl+K) — fuzzy over topics · CEQ stems · memo labels -------
  const jumpTargets = useMemo(() => {
    const out: { label: string; hay: string; go: () => void }[] = [];
    topicGroups.forEach(([topic, tl]) => out.push({ label: `Topic · ${topic}`, hay: topic.toLowerCase(), go: () => { if (tl[0]) nav.activateLesson(tl[0].id); } }));
    for (const n of nodes) {
      if (n.type === "ceq") { const stem = (n.data as CeqCard).prompt || ""; out.push({ label: `CEQ · ${ceqNumber.get(n.id) ?? ""} ${clip(stem)}`, hay: stem.toLowerCase(), go: () => nav.focusCeq(n.id) }); }
      else if (n.type === "memo") { const md = n.data as { label?: string; title?: string; body?: string }; const lab = md.label || memoText(md.title, md.body); out.push({ label: `Memo · ${clip(lab)}`, hay: lab.toLowerCase(), go: () => fly(n) }); }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, topicGroups, ceqNumber]);
  const matches = useMemo(() => { const q = query.trim().toLowerCase(); if (!q) return []; return jumpTargets.filter((t) => t.hay.includes(q)).slice(0, 12); }, [query, jumpTargets]);

  // ---- COPY / PASTE (independent copy + sourceId) ------------------------------
  const copyMemoNode = (m: CardNode) => { const md = m.data as { title?: string; body?: string; category?: string; label?: string; memoKind?: string }; setClipItem({ kind: "memo", title: md.title, body: md.body, category: md.category, label: md.label ?? memoText(md.title, md.body), memoKind: md.memoKind, sourceId: m.id }); };
  const copyChainMemo = (item: { memoNodeId: string; label: string }) => { const m = byId.get(item.memoNodeId); const md = (m?.data ?? {}) as { title?: string; body?: string; category?: string; memoKind?: string }; setClipItem({ kind: "memo", title: md.title, body: md.body, category: md.category, label: item.label, memoKind: md.memoKind, sourceId: item.memoNodeId }); };
  const copyCeq = (c: CardNode) => setClipItem({ kind: "ceq", data: structuredClone(c.data as Record<string, unknown>), sourceId: c.id });

  /** Paste the clipboard MEMO onto a choice's chain as an independent copy. */
  const pasteMemoOntoChoice = (ceqId: string, choiceId: string) => {
    if (clipItem?.kind !== "memo") return;
    const ceq = byId.get(ceqId);
    const w = (ceq?.width ?? ((ceq?.data as { w?: number })?.w ?? 400)) as number;
    const count = rf.getEdges().filter((e) => e.target === ceqId && String(e.id).startsWith("chn-")).length;
    const memoId = cardId("memo");
    const memoNode = { id: memoId, type: "memo", parentId: ceq?.parentId, position: { x: (ceq?.position.x ?? 0) + w + 64, y: (ceq?.position.y ?? 0) + count * 78 }, selected: false, data: { kind: "memo", memoKind: clipItem.memoKind ?? "note", title: clipItem.title, body: clipItem.body ?? "", category: clipItem.category, label: clipItem.label, sourceId: clipItem.sourceId } };
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: chainAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "paste chain memo"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label: clipItem.label ?? "memo" }] } : c)) }), "paste into chain");
    if (patch) bus.dispatch(patch);
  };
  /** Paste the clipboard CEQ into a frame as an independent copy. */
  const pasteCeqIntoFrame = (frameId: string) => {
    if (clipItem?.kind !== "ceq") return;
    const frame = byId.get(frameId);
    const data = { ...structuredClone(clipItem.data), sourceId: clipItem.sourceId, deckId: undefined, deckMember: undefined, tucked: undefined, stageOrder: undefined } as Record<string, unknown>;
    const node = { id: cardId("ceq"), type: "ceq", parentId: frameId, position: { x: 60, y: 60 }, selected: true, data };
    const add = addNodesAndEdgesCmd(rfl, [node] as never, [] as never, "paste CEQ copy"); if (add) bus.dispatch(add);
    void frame;
  };

  const renameChainMemo = (ceqId: string, choiceId: string, idx: number, label: string) => {
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: (c.chain ?? []).map((it, i) => (i === idx ? { ...it, label } : it)) } : c)) }), "rename chain memo");
    if (patch) bus.dispatch(patch);
    // keep the memo node's label in sync so Ctrl+K finds it by the new name
    const item = (byId.get(ceqId)?.data as CeqCard | undefined)?.choices.find((c) => c.id === choiceId)?.chain?.[idx];
    if (item) rf.updateNodeData(item.memoNodeId, { label });
  };

  const ROW = "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5";
  const twist = (id: string, has: boolean) => (
    <button className="shrink-0 rounded p-0.5 hover:bg-white/10" style={{ color: NEON.muted }} onClick={() => toggle(id)} title={isOpen(id) ? "Collapse" : "Expand"}>
      {has ? (isOpen(id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="inline-block h-3 w-3" />}
    </button>
  );

  return (
    <div className="nodrag nowheel max-h-[74vh] w-full overflow-y-auto px-0.5 py-1 text-[12px]" style={{ color: NEON.text }}>
      {/* QUICK JUMP (Ctrl+K) */}
      <div className="sticky top-0 z-10 mb-1 flex items-center gap-1 rounded px-1.5 py-1" style={{ background: "rgba(11,19,34,0.96)", border: `1px solid ${NEON.borderSoft}` }}>
        <Search className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
        <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Quick jump (Ctrl+K) — topics · CEQ · memos" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" style={{ color: NEON.text }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && matches[0]) { matches[0].go(); setQuery(""); } if (e.key === "Escape") setQuery(""); }} />
        {query && <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => setQuery("")}><X className="h-3 w-3" /></button>}
      </div>
      {query && (
        <div className="mb-1 rounded" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.3)" }}>
          {matches.length === 0 && <div className="px-2 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No matches.</div>}
          {matches.map((m, i) => <button key={i} className="block w-full truncate px-2 py-1 text-left text-[11px] hover:bg-white/5" style={{ color: i === 0 ? NEON.yellow : NEON.text }} onClick={() => { m.go(); setQuery(""); }}>{m.label}</button>)}
        </div>
      )}

      {clipItem && (
        <div className="mb-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px]" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}>
          <ClipboardCopy className="h-3 w-3" /> {clipItem.kind === "memo" ? `Memo "${clip(clipItem.label ?? "memo", 22)}"` : "CEQ"} copied — paste onto a {clipItem.kind === "memo" ? "choice" : "frame"}
          <button className="ml-auto" style={{ color: NEON.muted }} onClick={() => setClipItem(null)} title="Clear clipboard"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* COURSE */}
      <button className={`${ROW} font-bold`} style={{ color: NEON.yellow }} onClick={() => { const z = nodes.find((n) => n.type === "zone"); if (z) fly(z); else void rf.fitView({ duration: 500, padding: 0.15 }); }} title="Frame the whole course">
        <Layers className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{regionLabel}</span>
      </button>
      {lessons.length > 0 && <div className="px-1.5 pb-1 text-[10px] font-bold tracking-wide" style={{ color: publishedCount === lessons.length ? STATUS_TONE.PUBLISHED : NEON.muted }}>{publishedCount} of {lessons.length} published</div>}
      {lessons.length === 0 && <p className="px-2 py-2 text-[11px] italic leading-snug" style={{ color: NEON.muted }}>No lessons yet — use “Add lesson” in the toolbar.</p>}

      <div className="ml-1 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
        {topicGroups.map(([topic, topicLessons], ti) => {
          const tId = `topic:${topic}`;
          return (
            <div key={topic}>
              <div className={ROW}>{twist(tId, true)}<button className="flex min-w-0 flex-1 items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }} onClick={() => topicLessons[0] && nav.activateLesson(topicLessons[0].id)}><span className="tabular-nums opacity-70">{ti + 1}</span><span className="min-w-0 flex-1 truncate">{topic}</span></button></div>
              {isOpen(tId) && (
                <div className="ml-3 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                  {/* CATEGORY tier — all four shown (placeholders when empty) */}
                  {LESSON_CATEGORIES.map((cat) => {
                    const catLessons = topicLessons.filter((l) => categoryOf(l) === cat);
                    const cId = `${tId}:${cat}`;
                    return (
                      <div key={cat}>
                        <div className={ROW}>{twist(cId, catLessons.length > 0)}<span className="flex min-w-0 flex-1 items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: CATEGORY_TONE[cat] }}><span className="min-w-0 flex-1 truncate">{LESSON_CATEGORY_LABEL[cat]}</span>{catLessons.length === 0 && <span className="italic opacity-60" style={{ color: NEON.muted }}>— empty —</span>}</span></div>
                        {isOpen(cId) && catLessons.map((l) => {
                          const frames = framesByLesson.get(l.id) ?? [];
                          const paid = (l.data as unknown as LessonBox).access === "PAID";
                          const lId = l.id;
                          return (
                            <div key={l.id} className="ml-3 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                              {/* VIDEO node (= lesson + slot) */}
                              <div className={ROW} style={{ boxShadow: `inset 3px 0 0 ${STATUS_TONE[statusOf(l)]}` }}>
                                {twist(lId, frames.length > 0)}
                                <button className="flex min-w-0 flex-1 items-center gap-1.5" style={{ color: NEON.text }} onClick={() => nav.openVideoSlot(l.id)} title="Open this lesson's video slot">
                                  <ListVideo className="h-3 w-3 shrink-0" style={{ color: STATUS_TONE[statusOf(l)] }} />
                                  <span className="min-w-0 flex-1 truncate">{labelOf(l)}</span>
                                  {cat === "CEQ" && <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={paid ? { color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.5)" } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{paid ? "Paid" : "Free"}</span>}
                                </button>
                                <button className="shrink-0 rounded px-1 text-[7.5px] font-black uppercase opacity-70 hover:opacity-100" style={{ color: STATUS_TONE[statusOf(l)], border: `1px solid ${STATUS_TONE[statusOf(l)]}` }} onClick={(e) => { e.stopPropagation(); cycleStatus(l); }} title={`Status: ${statusOf(l)} — click to cycle`}>{statusOf(l).slice(0, 3)}</button>
                              </div>
                              {isOpen(lId) && (
                                <div className="ml-3 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                                  {BEAT_COLUMNS.map((beat) => {
                                    const bf = frames.filter((f) => beatColOf(f as never) === beat);
                                    if (bf.length === 0) return null;
                                    const bm = BEAT_META[beat];
                                    return bf.map((f) => {
                                      const fd = f.data as unknown as FrameBox;
                                      const ceqs = ceqsByFrame.get(f.id) ?? [];
                                      const canPasteCeq = clipItem?.kind === "ceq";
                                      return (
                                        <div key={f.id}>
                                          <div className={ROW}>
                                            {twist(f.id, ceqs.length > 0)}
                                            <button className="flex min-w-0 flex-1 items-center gap-1.5" style={{ color: nav.currentFrameId === f.id ? bm.color : NEON.text }} onClick={() => nav.enter(f.id)} title="Enter this frame">
                                              <Clapperboard className="h-3 w-3 shrink-0 opacity-70" style={{ color: bm.color }} /><span className="min-w-0 flex-1 truncate">{fd.title || bm.label}</span>
                                            </button>
                                            {canPasteCeq && <button className="shrink-0" style={{ color: NEON.cyan }} onClick={() => pasteCeqIntoFrame(f.id)} title="Paste the copied CEQ into this frame"><ClipboardPaste className="h-3 w-3" /></button>}
                                          </div>
                                          {isOpen(f.id) && ceqs.map((c) => {
                                            const cd = c.data as unknown as CeqCard;
                                            return (
                                              <div key={c.id} className="ml-3 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                                                <div className={ROW}>
                                                  {twist(c.id, cd.choices.length > 0)}
                                                  <button className="flex min-w-0 flex-1 items-center gap-1.5" onClick={() => nav.focusCeq(c.id)} title="Open this CEQ">
                                                    <span className="shrink-0 text-[8px] font-black tabular-nums" style={{ color: NEON.yellow }}>{ceqNumber.get(c.id) ?? ""}</span>
                                                    <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }}>{clip(cd.prompt || "CEQ")}</span>
                                                  </button>
                                                  <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => copyCeq(c)} title="Copy this CEQ"><ClipboardCopy className="h-3 w-3" /></button>
                                                </div>
                                                {isOpen(c.id) && cd.choices.map((ch) => {
                                                  const chain = ch.chain ?? [];
                                                  const canPasteMemo = clipItem?.kind === "memo";
                                                  return (
                                                    <div key={ch.id} className="ml-3 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                                                      <div className={ROW}>
                                                        {twist(`${c.id}:${ch.id}`, chain.length > 0)}
                                                        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded text-[8px] font-black" style={{ color: ch.correct ? "#3BF5A0" : NEON.muted, border: `1px solid ${ch.correct ? "#3BF5A0" : NEON.borderSoft}` }}>{LETTER(cd.choices.indexOf(ch))}</span>
                                                        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: ch.correct ? "#3BF5A0" : NEON.text }}>{clip(ch.text || "", 40)}</span>
                                                        {ch.correct && <Check className="h-3 w-3 shrink-0" style={{ color: "#3BF5A0" }} />}
                                                        {canPasteMemo && <button className="shrink-0" style={{ color: NEON.cyan }} onClick={() => pasteMemoOntoChoice(c.id, ch.id)} title="Paste the copied memo into this choice's chain"><ClipboardPaste className="h-3 w-3" /></button>}
                                                      </div>
                                                      {isOpen(`${c.id}:${ch.id}`) && chain.map((it, i) => (
                                                        <div key={`${it.memoNodeId}-${i}`} className="ml-5 flex items-center gap-1 py-0.5 text-[10.5px]">
                                                          <span className="shrink-0 text-[8px]" style={{ color: NEON.muted }}>↳ {i + 1}</span>
                                                          <input className="min-w-0 flex-1 rounded bg-black/30 px-1 text-[10.5px] outline-none" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={it.label} onChange={(e) => renameChainMemo(c.id, ch.id, i, e.target.value)} onKeyDown={(e) => e.stopPropagation()} title="Rename this chain memo's label" />
                                                          <button className="shrink-0" style={{ color: NEON.muted }} onClick={() => copyChainMemo(it)} title="Copy this memo"><ClipboardCopy className="h-3 w-3" /></button>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    });
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
