// CEQ STUDIO (prompt 5) — one panel for day-to-day CEQ authoring, replacing the
// old deck UI's day-to-day use (the deck panel stays untouched). Three panes,
// reusing EXISTING models only: SETS = named CARD decks; QUESTIONS = a set's CEQ
// cards (free stems/choices) with a per-choice CHAIN editor (the prompt-1 model,
// one model / two doors); MEMO LIBRARY = every memo with label + category (incl
// ELEMENT), search/filter, bulk triage for the unfiled pile, and drag-onto-a-choice
// to attach to a chain. No new storage beyond panel prefs.
import { useMemo, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { CheckSquare, ChevronRight, ListChecks, Plus, Search, Square, Trash2, X, ArrowUp, ArrowDown, Link2, Film } from "lucide-react";

import { addDeck, deckMembersOf, gridSlots, newDeckDef, removeDeck, updateDeck } from "./deck-defs";
import { nextStageOrder } from "./BaseCard";
import { addNodesAndEdgesCmd, addNodesCmd, bus, compositeCmd, patchDataCmd, patchDataFnCmd, type RfLike } from "./commands";
import { chainAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { CeqChainEditor } from "./CeqChainEditor";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { useFrameNav } from "./FrameNavContext";
import { cardId, type CeqCard, type CeqChoice, type DeckDef } from "./types";
import { NEON } from "./theme";

const memoText = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo");
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const NONE = "__uncat__";
const MEMO_DND = "text/sa-studio-memo";

export function CeqStudio({ decks, setDecks, onClose }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void; onClose: () => void }) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes(); // reactive
  const nav = useFrameNav();
  const cardDecks = decks.filter((d) => d.payloadType === "cards");
  const [setId, setSetId] = useState<string | null>(cardDecks[0]?.id ?? null);
  const [qId, setQId] = useState<string | null>(null);
  const [chainFor, setChainFor] = useState<string | null>(null); // CEQ node whose chain editor is open
  const [note, setNote] = useState<string | null>(null);
  const [memoQuery, setMemoQuery] = useState("");
  const [catFilter, setCatFilter] = useState<Set<string>>(() => new Set([...MEMO_CATEGORIES, NONE]));
  const [sel, setSel] = useState<Set<string>>(() => new Set());

  const deck = cardDecks.find((d) => d.id === setId) ?? null;
  const questions = useMemo(() => (deck ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id).filter((n) => (n as { type?: string }).type === "ceq") : []), [deck, nodes]);
  const qNode = qId ? nodes.find((n) => n.id === qId) : null;
  const qd = qNode?.data as unknown as CeqCard | undefined;

  // ---- SETS -----------------------------------------------------------------
  const newSet = () => {
    const name = window.prompt("New set name?", `Set ${cardDecks.length + 1}`);
    if (!name) return;
    const def = { ...newDeckDef(name.trim(), "cards"), lessonId: (nav.currentFrameId ? (rf.getNode(nav.currentFrameId)?.parentId ?? null) : null) };
    setDecks((prev) => addDeck(prev, def));
    setSetId(def.id); setQId(null);
  };
  const renameSet = (d: DeckDef) => { const n = window.prompt("Rename set", d.name); if (n) setDecks((prev) => updateDeck(prev, d.id, { name: n.trim() })); };
  const deleteSet = (d: DeckDef) => {
    const members = deckMembersOf(rf.getNodes() as { id: string; data?: { deckId?: string; stageOrder?: number } }[], d.id);
    const cmd = compositeCmd(members.map((m) => patchDataCmd(rfl, m.id, { deckId: undefined }, "unassign")).filter((c): c is NonNullable<typeof c> => !!c), `clear ${d.name}`);
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => removeDeck(prev, d.id));
    if (setId === d.id) { setSetId(null); setQId(null); }
  };

  // ---- QUESTIONS ------------------------------------------------------------
  const addQuestion = () => {
    if (!deck) return;
    const order = nextStageOrder(rf.getNodes() as never);
    const id = cardId("ceq");
    const node = { id, type: "ceq", position: { x: 80, y: 80 + questions.length * 40 }, selected: false, data: { kind: "ceq", title: deck.name, prompt: "New question", choices: [{ id: cardId("ch"), text: "Choice A", correct: true }, { id: cardId("ch"), text: "Choice B" }], deckId: deck.id, deckMember: true, tucked: true, stageOrder: order, slotIndex: questions.length, deckCategory: "ceq:studio", deckPos: { x: 80, y: 80 + questions.length * 40 } } };
    const cmd = addNodesCmd(rfl, [node] as never, "add question"); if (cmd) bus.dispatch(cmd);
    setQId(id);
  };
  const patchQ = (id: string, patch: Record<string, unknown>) => { const c = patchDataCmd(rfl, id, patch, "edit question"); if (c) bus.dispatch(c); };
  const patchChoice = (id: string, choiceId: string, patch: Partial<CeqChoice>) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (ch.id === choiceId ? { ...ch, ...patch } : ch)) }), "edit choice"); if (c) bus.dispatch(c); };
  const setCorrect = (id: string, choiceId: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => ({ ...ch, correct: ch.id === choiceId })) }), "mark correct"); if (c) bus.dispatch(c); };
  const addChoice = (id: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: [...(prev as unknown as { choices: CeqChoice[] }).choices, { id: cardId("ch"), text: "" }] }), "add choice"); if (c) bus.dispatch(c); };
  const removeChoice = (id: string, choiceId: string) => { const c = patchDataFnCmd(rfl, id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.filter((ch) => ch.id !== choiceId) }), "remove choice"); if (c) bus.dispatch(c); };
  const reorderQ = (id: string, dir: -1 | 1) => {
    const arr = [...questions]; const i = arr.findIndex((q) => q.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const cmd = compositeCmd(arr.map((q, idx) => patchDataCmd(rfl, q.id, { stageOrder: idx }, "reorder")).filter((c): c is NonNullable<typeof c> => !!c), "reorder questions");
    if (cmd) bus.dispatch(cmd);
  };

  /** DEAL the set into the current frame — reparent its CEQ cards (+ their chain
   *  memos) into the frame as a tucked stack so the space-walk / Enter-walk works. */
  const dealIntoFrame = () => {
    const frameId = nav.currentFrameId;
    if (!frameId || !deck) { setNote("Enter a frame first, then Deal."); return; }
    const frame = rf.getNode(frameId);
    if (!frame || frame.type !== "frame") { setNote("Enter a frame first, then Deal."); return; }
    const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
    const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
    const centre = { x: Math.max(0, Math.round((fw - 560) / 2)), y: Math.max(0, Math.round((fh - 480) / 2)) };
    const members = questions.map((q) => rf.getNode(q.id)).filter((n): n is NonNullable<typeof n> => !!n);
    const memoIds = new Set<string>();
    for (const m of members) for (const ch of ((m.data as unknown as CeqCard).choices ?? [])) for (const it of (ch.chain ?? [])) if (it.memoNodeId) memoIds.add(it.memoNodeId);
    const memoNodes = [...memoIds].map((mid) => rf.getNode(mid)).filter((n): n is NonNullable<typeof n> => !!n);
    const slots = gridSlots(memoNodes.length, { originX: Math.round(centre.x + 600), originY: 60, cols: 1, cellW: 220, cellH: 90, gapX: 20, gapY: 12 });
    bus.dispatch({
      label: `deal ${deck.name} into frame`,
      do: () => rf.setNodes((nds) => nds.map((n) => {
        const mi = members.findIndex((m) => m.id === n.id);
        if (mi >= 0) return { ...n, parentId: frameId, position: { ...centre }, data: { ...n.data, tucked: mi > 0, deckMember: true, staged: undefined, minimized: undefined } } as typeof n;
        const gi = memoNodes.findIndex((m) => m.id === n.id);
        if (gi >= 0) return { ...n, parentId: frameId, position: { ...slots[gi] } } as typeof n;
        return n;
      })),
      undo: () => { /* transient staging move — re-deal to redo; not separately undone */ },
    });
    const c = patchDataCmd(rfl, frameId, { stackDeal: true, dealSpot: centre }, "stack deal"); if (c) bus.dispatch(c);
    setNote(`Dealt ${members.length} question${members.length === 1 ? "" : "s"} into the frame — Space flips, Enter-walks chains.`);
  };

  // ---- MEMO LIBRARY ---------------------------------------------------------
  const memos = useMemo(() => rf.getNodes().filter((n) => n.type === "memo").map((n) => { const d = n.data as { label?: string; title?: string; body?: string; category?: string }; return { id: n.id, label: d.label || memoText(d.title, d.body), category: (d.category || "").toUpperCase() }; }), [nodes]);
  const shownMemos = memos.filter((m) => catFilter.has(m.category || NONE)).filter((m) => { const q = memoQuery.trim().toLowerCase(); return !q || m.label.toLowerCase().includes(q); });
  const toggleCat = (c: string) => setCatFilter((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkCategory = (cat: string) => { if (sel.size === 0) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { category: cat }, "set category")).filter((c): c is NonNullable<typeof c> => !!c), "bulk categorise"); if (cmd) bus.dispatch(cmd); setNote(`Set ${sel.size} memo${sel.size === 1 ? "" : "s"} → ${cat}`); };
  const bulkLabel = () => { if (sel.size === 0) return; const base = window.prompt("Set label for the selected memos"); if (base == null) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { label: base.trim() }, "set label")).filter((c): c is NonNullable<typeof c> => !!c), "bulk label"); if (cmd) bus.dispatch(cmd); };
  const allShownSel = shownMemos.length > 0 && shownMemos.every((m) => sel.has(m.id));

  /** Drop a memo onto a choice → attach it (existing node) to that choice's chain. */
  const attachMemoToChoice = (ceqId: string, choiceId: string, memoId: string) => {
    const m = rf.getNode(memoId); if (!m) return;
    const md = m.data as { label?: string; title?: string; body?: string };
    const label = md.label || memoText(md.title, md.body);
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: chainAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [] as never, [edge] as never, "chain arrow"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "attach memo");
    if (patch) bus.dispatch(patch);
    setNote(`Attached "${clip(label, 24)}" to choice.`);
  };

  const COL = "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg";
  const HEAD = "flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider";
  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "rgba(6,10,20,0.98)", color: NEON.text }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <div className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.18em]" style={{ color: NEON.yellow }}><ListChecks className="h-4 w-4" /> CEQ Studio</div>
        <div className="flex items-center gap-2">
          {note && <span className="text-[10px]" style={{ color: NEON.muted }}>{note}</span>}
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* PANE 1 — SETS */}
        <div className={COL} style={{ maxWidth: 220, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Sets <span style={{ color: NEON.muted }}>({cardDecks.length})</span></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {cardDecks.length === 0 && <div className="px-1.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>No sets yet — a set is a named deck of CEQ questions.</div>}
            {cardDecks.map((d) => {
              const count = deckMembersOf(nodes as { id: string; data?: { deckId?: string; stageOrder?: number } }[], d.id).length;
              const laid = (d.slots?.length ?? 0) > 0;
              const on = setId === d.id;
              return (
                <div key={d.id} className="flex items-center gap-1 rounded px-1.5 py-1" style={{ background: on ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${on ? NEON.border : "transparent"}` }}>
                  <button className="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold" style={{ color: on ? NEON.yellow : NEON.text }} onClick={() => { setSetId(d.id); setQId(null); }} onDoubleClick={() => renameSet(d)} title="Click to open · double-click to rename">{d.name}</button>
                  <span className="shrink-0 rounded px-1 text-[8px] font-bold tabular-nums" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title={`${count} questions${laid ? " · laid" : ""}`}>{count}{laid ? "·▦" : ""}</span>
                  <button className="shrink-0" style={{ color: NEON.red }} onClick={() => deleteSet(d)} title="Delete set (keeps cards loose)"><Trash2 className="h-3 w-3" /></button>
                </div>
              );
            })}
          </div>
          <button className="m-1 flex items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={newSet}><Plus className="h-3 w-3" /> new set</button>
        </div>

        {/* PANE 2 — QUESTIONS + editor */}
        <div className={COL} style={{ flex: 1.4, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>
            Questions {deck && <span style={{ color: NEON.muted }}>· {deck.name} ({questions.length})</span>}
            {deck && <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={dealIntoFrame} title="Deal this set into the frame you're in (stack; Space flips, Enter-walks chains)"><Film className="h-3 w-3" /> deal into frame</button>}
          </div>
          {!deck ? (
            <div className="grid flex-1 place-items-center text-[11px]" style={{ color: NEON.muted }}>Pick or create a set on the left.</div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* list */}
              <div className="min-h-0 w-40 shrink-0 overflow-y-auto border-r p-1" style={{ borderColor: NEON.borderSoft }}>
                {questions.length === 0 && <div className="px-1 py-1 text-[9.5px] italic" style={{ color: NEON.muted }}>No questions — add one below.</div>}
                {questions.map((q, i) => { const p = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.prompt || "Question"; return (
                  <div key={q.id} className="flex items-center gap-0.5">
                    <button className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[10.5px]" style={{ background: qId === q.id ? "rgba(252,163,17,0.14)" : "transparent", color: qId === q.id ? NEON.yellow : NEON.text }} onClick={() => setQId(q.id)}><span className="tabular-nums opacity-60">{i + 1}.</span> {clip(p, 18)}</button>
                    <button disabled={i === 0} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderQ(q.id, -1)} title="Up"><ArrowUp className="h-3 w-3" /></button>
                    <button disabled={i === questions.length - 1} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderQ(q.id, 1)} title="Down"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                ); })}
                <button className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={addQuestion}><Plus className="h-3 w-3" /> question</button>
              </div>
              {/* editor */}
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {!qd ? <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to edit.</div> : (
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Stem (markdown)</label>
                    <textarea rows={2} className="nodrag w-full resize-none rounded px-2 py-1.5 text-[13px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={qd.prompt} onChange={(e) => patchQ(qId!, { prompt: e.target.value })} placeholder="The question stem…" />
                    <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Choices — click the ○ to mark correct · drop a memo to chain it</div>
                    {qd.choices.map((ch, ci) => (
                      <div key={ch.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ border: `1px solid ${ch.correct ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }}
                        onDragOver={(e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                        onDrop={(e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); attachMemoToChoice(qId!, ch.id, mid); } }}>
                        <button className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black" style={{ color: ch.correct ? "#0B0F1E" : NEON.muted, background: ch.correct ? "#3BF5A0" : "transparent", border: `1px solid ${ch.correct ? "#3BF5A0" : NEON.borderSoft}` }} onClick={() => setCorrect(qId!, ch.id)} title="Mark correct">{LETTER(ci)}</button>
                        <input className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" style={{ color: NEON.text }} value={ch.text} onChange={(e) => patchChoice(qId!, ch.id, { text: e.target.value })} placeholder={`Choice ${LETTER(ci)}`} />
                        {(ch.chain?.length ?? 0) > 0 && <span className="shrink-0 text-[8px] tabular-nums" style={{ color: NEON.cyan }} title="chain items">⛓{ch.chain!.length}</span>}
                        <button className="shrink-0" style={{ color: NEON.red }} onClick={() => removeChoice(qId!, ch.id)} title="Remove choice"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1">
                      <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => addChoice(qId!)}><Plus className="h-3 w-3" /> choice</button>
                      <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setChainFor(qId)} title="Per-choice chains + save/load template (same model as the card popover)"><Link2 className="h-3 w-3" /> chains & templates</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PANE 3 — MEMO LIBRARY */}
        <div className={COL} style={{ maxWidth: 260, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Memo library <span style={{ color: NEON.muted }}>({memos.length})</span></div>
          <div className="flex items-center gap-1 px-1.5 pt-1.5"><Search className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} /><input value={memoQuery} onChange={(e) => setMemoQuery(e.target.value)} placeholder="search labels" className="min-w-0 flex-1 bg-transparent text-[10.5px] outline-none" style={{ color: NEON.text }} /></div>
          <div className="flex flex-wrap gap-1 p-1.5">
            {[...MEMO_CATEGORIES, NONE].map((c) => { const on = catFilter.has(c); return (
              <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: on ? "#0B1322" : NEON.muted, background: on ? NEON.yellow : "transparent", border: `1px solid ${on ? NEON.yellow : NEON.borderSoft}` }} onClick={() => toggleCat(c)}>{c === NONE ? "Unfiled" : c}</button>
            ); })}
          </div>
          <div className="flex items-center justify-between px-1.5 text-[9px]" style={{ color: NEON.muted }}>
            <button className="flex items-center gap-1 rounded px-1 py-0.5 font-bold uppercase" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={() => setSel((p) => { const n = new Set(p); if (allShownSel) shownMemos.forEach((m) => n.delete(m.id)); else shownMemos.forEach((m) => n.add(m.id)); return n; })} disabled={shownMemos.length === 0}>{allShownSel ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />} {allShownSel ? "none" : "all"}</button>
            <span>{sel.size} selected</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {shownMemos.length === 0 && <div className="px-1 py-2 text-[9.5px] italic" style={{ color: NEON.muted }}>No memos match — or none exist yet.</div>}
            {shownMemos.map((m) => { const on = sel.has(m.id); return (
              <div key={m.id} draggable className="flex cursor-grab items-center gap-1 rounded px-1 py-0.5" style={{ background: on ? "rgba(252,163,17,0.1)" : "rgba(0,0,0,0.2)", border: `1px solid ${on ? NEON.border : NEON.borderSoft}` }}
                onDragStart={(e) => { e.dataTransfer.setData(MEMO_DND, m.id); e.dataTransfer.effectAllowed = "copy"; }}
                title="Drag onto a choice to attach · click to select">
                <button className="shrink-0" style={{ color: on ? NEON.yellow : NEON.muted }} onClick={() => toggleSel(m.id)}>{on ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}</button>
                <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: NEON.text }}>{m.label}</span>
                {m.category && <span className="shrink-0 text-[7.5px] font-bold uppercase" style={{ color: NEON.muted }}>{m.category === "ELEMENT" ? "🧩" : m.category.slice(0, 4)}</span>}
              </div>
            ); })}
          </div>
          {/* bulk triage */}
          <div className="flex flex-col gap-1 border-t p-1.5" style={{ borderColor: NEON.borderSoft }}>
            <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Bulk ({sel.size})</div>
            <div className="flex flex-wrap gap-1">
              {MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkCategory(c)} disabled={sel.size === 0}>{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)}
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={bulkLabel} disabled={sel.size === 0}>set label…</button>
            </div>
          </div>
        </div>
      </div>

      {chainFor && <CeqChainEditor nodeId={chainFor} onClose={() => setChainFor(null)} />}
    </div>
  );
}
