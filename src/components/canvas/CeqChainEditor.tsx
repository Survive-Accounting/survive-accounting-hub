// CEQ CHAIN EDITOR (prompt 1, part 4) — the interim authoring surface for a CEQ's
// per-choice revealable CHAINS (walked with Enter in film). For each choice: an
// ordered list of chain items (memo only for now), add a memo (pick from the topic
// library or create an empty one), reorder (up/down), remove, rename its label.
// Plus part 5: save the chain STRUCTURE (kinds + labels, keyed by choice index) as a
// named template, and load one onto another CEQ as empty labeled slots.
//
// A chain item references a first-class memo NODE by id and draws a LEFT-anchored
// arrow (chainAnchorId) that wraps around the card; the memo sits to the card's
// right. The hiddenOf reconciler shows each memo only once its index < chainShown.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Save, Trash2, X } from "lucide-react";

import { addNodesAndEdgesCmd, bus, patchDataFnCmd, type RfLike } from "./commands";
import { chainAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { lessonNodeOf, topicKey, topicOfLessonNode, topicOfNode } from "./memo-scope";
import { captureChainTemplate, deleteChainTemplate, listChainTemplates } from "./ceq-chain-templates";
import { cardId, type CeqCard, type CeqChainItem, type CeqChoice, type CeqChainTemplate } from "./types";
import { NEON } from "./theme";

const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const memoLabel = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo").slice(0, 40);
/** Deterministic edge id per (choice, memo) so remove can find + drop the arrow. */
const chainEdgeId = (choiceId: string, memoNodeId: string) => `chn-${choiceId}-${memoNodeId}`;

export function CeqChainEditor({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes(); // reactive
  const node = nodes.find((n) => n.id === nodeId);
  const d = node?.data as unknown as CeqCard | undefined;
  const [openChoice, setOpenChoice] = useState<string | null>(d?.choices?.[0]?.id ?? null);
  const [pickFor, setPickFor] = useState<string | null>(null); // choice whose add-picker is open
  const [tpls, setTpls] = useState<CeqChainTemplate[]>(() => listChainTemplates());
  const [loadOpen, setLoadOpen] = useState(false);

  // Topic-scoped memo library (memos reusable across the whole topic).
  const topicK = useMemo(() => (node ? topicKey(topicOfLessonNode(lessonNodeOf(rf, node))) : null), [rf, node]);
  const library = useMemo(() =>
    rf.getNodes()
      .filter((n) => n.type === "memo" && (!topicK || topicKey(topicOfNode(rf, n)) === topicK))
      .map((n) => { const md = n.data as { title?: string; body?: string }; return { id: n.id, label: memoLabel(md.title, md.body) }; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, topicK]);

  if (!node || !d) return null;

  const patchChoice = (choiceId: string, fn: (c: CeqChoice) => CeqChoice) => {
    const c = patchDataFnCmd(rfl, nodeId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (ch.id === choiceId ? fn(ch) : ch)) }), "edit CEQ chain");
    if (c) bus.dispatch(c);
  };

  /** Add an existing memo node to a choice's chain + draw the left-anchored arrow. */
  const addLibraryMemo = (choiceId: string, memoNodeId: string, label: string) => {
    const item: CeqChainItem = { kind: "memo", memoNodeId, label };
    const edge = { id: chainEdgeId(choiceId, memoNodeId), source: memoNodeId, sourceHandle: "l", target: nodeId, targetHandle: chainAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const addEdge = addNodesAndEdgesCmd(rfl, [] as never, [edge] as never, "chain arrow");
    if (addEdge) bus.dispatch(addEdge);
    patchChoice(choiceId, (c) => ({ ...c, chain: [...(c.chain ?? []), item] }));
    setPickFor(null);
  };

  /** Create a fresh EMPTY memo node to the card's right + add it to the chain. */
  const createChainMemo = (choiceId: string, label?: string) => {
    const w = (node.width ?? (d.w ?? 400)) as number;
    const count = rf.getEdges().filter((e) => e.target === nodeId && String(e.id).startsWith("chn-")).length;
    const memoId = cardId("memo");
    const memoNode = { id: memoId, type: "memo", parentId: node.parentId, position: { x: node.position.x + w + 64, y: node.position.y + count * 78 }, selected: false, data: { kind: "memo", memoKind: "note", title: label ?? "", body: "", w: 200 } };
    const edge = { id: chainEdgeId(choiceId, memoId), source: memoId, sourceHandle: "l", target: nodeId, targetHandle: chainAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const cmd = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "create chain memo");
    if (cmd) bus.dispatch(cmd);
    patchChoice(choiceId, (c) => ({ ...c, chain: [...(c.chain ?? []), { kind: "memo", memoNodeId: memoId, label: label ?? memoLabel(undefined, "") } as CeqChainItem] }));
    setPickFor(null);
  };

  const removeItem = (choiceId: string, idx: number) => {
    const choice = d.choices.find((c) => c.id === choiceId);
    const item = choice?.chain?.[idx];
    // Drop the chain arrow (leave the memo node — memos are first-class).
    if (item) {
      const edgeId = chainEdgeId(choiceId, item.memoNodeId);
      const edge = rf.getEdges().find((e) => e.id === edgeId);
      if (edge) bus.dispatch({ label: "remove chain arrow", do: () => rfl.setEdges((eds) => eds.filter((e) => e.id !== edgeId)), undo: () => rfl.setEdges((eds) => [...eds, edge]) });
    }
    patchChoice(choiceId, (c) => ({ ...c, chain: (c.chain ?? []).filter((_, i) => i !== idx), chainShown: Math.min(c.chainShown ?? 0, Math.max(0, (c.chain?.length ?? 1) - 1)) }));
  };
  const moveItem = (choiceId: string, idx: number, dir: -1 | 1) => {
    patchChoice(choiceId, (c) => {
      const arr = [...(c.chain ?? [])];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return c;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...c, chain: arr };
    });
  };
  const renameItem = (choiceId: string, idx: number, label: string) =>
    patchChoice(choiceId, (c) => ({ ...c, chain: (c.chain ?? []).map((it, i) => (i === idx ? { ...it, label } : it)) }));

  // ---- Templates (part 5) --------------------------------------------------
  const saveTemplate = () => {
    const name = window.prompt("Template name?", (d.prompt || "CEQ").slice(0, 30));
    if (name == null) return;
    captureChainTemplate(name, d.choices);
    setTpls(listChainTemplates());
  };
  /** Apply a template as EMPTY labeled slots at the same choice indices. Each slot
   *  spawns an empty (labeled) memo node + chain entry + arrow. Content stays empty. */
  const loadTemplate = (tpl: CeqChainTemplate) => {
    const w = (node.width ?? (d.w ?? 400)) as number;
    let stagger = rf.getEdges().filter((e) => e.target === nodeId && String(e.id).startsWith("chn-")).length;
    const newNodes: unknown[] = [];
    const newEdges: unknown[] = [];
    const perChoice = new Map<string, CeqChainItem[]>();
    d.choices.forEach((c, ci) => {
      const slots = tpl.slots[ci] ?? [];
      const items: CeqChainItem[] = [];
      for (const slot of slots) {
        const memoId = cardId("memo");
        newNodes.push({ id: memoId, type: "memo", parentId: node.parentId, position: { x: node.position.x + w + 64, y: node.position.y + stagger * 78 }, selected: false, data: { kind: "memo", memoKind: "note", title: slot.label, body: "", w: 200 } });
        newEdges.push({ id: chainEdgeId(c.id, memoId), source: memoId, sourceHandle: "l", target: nodeId, targetHandle: chainAnchorId(c.id), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } });
        items.push({ kind: slot.kind, memoNodeId: memoId, label: slot.label });
        stagger++;
      }
      if (items.length) perChoice.set(c.id, items);
    });
    if (newNodes.length) { const c = addNodesAndEdgesCmd(rfl, newNodes as never, newEdges as never, `load template "${tpl.name}"`); if (c) bus.dispatch(c); }
    const c = patchDataFnCmd(rfl, nodeId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => (perChoice.has(ch.id) ? { ...ch, chain: [...(ch.chain ?? []), ...perChoice.get(ch.id)!] } : ch)) }), "apply chain template");
    if (c) bus.dispatch(c);
    setLoadOpen(false);
  };
  const delTemplate = (id: string) => { deleteChainTemplate(id); setTpls(listChainTemplates()); };

  const FIELD = "nodrag nowheel rounded px-1.5 py-0.5 text-[11px] outline-none";
  return createPortal(
    <div className="fixed right-3 top-16 bottom-16 z-[75] flex w-[340px] flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: "rgba(11,19,34,0.96)", border: `1px solid ${NEON.border}`, backdropFilter: "blur(6px)" }}>
      <header className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Chains</span>
        <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: NEON.muted }} title={d.prompt}>{d.prompt || "CEQ"}</span>
        <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
      </header>

      {/* TEMPLATES */}
      <div className="flex shrink-0 items-center gap-1 border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={saveTemplate} title="Save this CEQ's chain structure (kinds + labels, no content) as a named template"><Save className="h-3 w-3" /> save as template</button>
        <div className="relative ml-auto">
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setLoadOpen((v) => !v)} title="Apply a saved template as empty labeled slots">load template <ChevronDown className="h-3 w-3" /></button>
          {loadOpen && (
            <div className="absolute right-0 top-7 z-10 max-h-56 w-56 overflow-y-auto rounded-lg p-1" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 14px 34px -14px rgba(0,0,0,0.7)" }}>
              {tpls.length === 0 && <div className="px-1.5 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No templates yet — save one from a built chain.</div>}
              {tpls.map((t) => (
                <div key={t.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5">
                  <button className="min-w-0 flex-1 truncate text-left text-[10.5px]" style={{ color: NEON.text }} onClick={() => loadTemplate(t)} title={`Load "${t.name}" — ${t.slots.reduce((s, sl) => s + sl.length, 0)} slots`}>{t.name}</button>
                  <button className="grid h-4 w-4 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => delTemplate(t.id)} title="Delete template"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {d.choices.map((c, ci) => {
          const open = openChoice === c.id;
          const chain = c.chain ?? [];
          return (
            <div key={c.id} className="mb-1.5 rounded-md" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.22)" }}>
              <button className="flex w-full items-center gap-1.5 px-2 py-1 text-left" onClick={() => setOpenChoice(open ? null : c.id)}>
                {open ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} /> : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />}
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-black" style={{ color: c.correct ? "#3BF5A0" : NEON.text, border: `1px solid ${c.correct ? "#3BF5A0" : NEON.borderSoft}` }}>{LETTER(ci)}</span>
                <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: NEON.text }} title={c.text}>{c.text || "(choice)"}</span>
                <span className="shrink-0 text-[9px] tabular-nums" style={{ color: NEON.muted }}>{chain.length}</span>
              </button>
              {open && (
                <div className="flex flex-col gap-1 px-2 pb-1.5">
                  {chain.length === 0 && <div className="px-0.5 text-[9.5px] italic" style={{ color: NEON.muted }}>No chain yet — Enter resolves this choice; add memos below to reveal after.</div>}
                  {chain.map((it, i) => (
                    <div key={`${it.memoNodeId}-${i}`} className="flex items-center gap-1">
                      <span className="w-3 shrink-0 text-right text-[9px] tabular-nums" style={{ color: NEON.muted }}>{i + 1}</span>
                      <input className={`min-w-0 flex-1 ${FIELD}`} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={it.label} onChange={(e) => renameItem(c.id, i, e.target.value)} onKeyDown={(e) => e.stopPropagation()} title="Chain item label (shown in the run log)" />
                      <button disabled={i === 0} className="grid h-4 w-4 place-items-center rounded disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => moveItem(c.id, i, -1)} title="Move earlier"><ArrowUp className="h-3 w-3" /></button>
                      <button disabled={i === chain.length - 1} className="grid h-4 w-4 place-items-center rounded disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => moveItem(c.id, i, 1)} title="Move later"><ArrowDown className="h-3 w-3" /></button>
                      <button className="grid h-4 w-4 place-items-center rounded" style={{ color: NEON.red }} onClick={() => removeItem(c.id, i)} title="Remove from chain (keeps the memo node)"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  {pickFor === c.id ? (
                    <div className="mt-0.5 rounded p-1" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}` }}>
                      <button className="mb-1 flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => createChainMemo(c.id, "new memo")}><Plus className="h-3 w-3" /> create empty memo</button>
                      <div className="max-h-32 overflow-y-auto">
                        {library.length === 0 && <div className="px-1 py-0.5 text-[9px] italic" style={{ color: NEON.muted }}>No memos in this topic yet.</div>}
                        {library.map((m) => (
                          <button key={m.id} className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-white/5" style={{ color: NEON.text }} onClick={() => addLibraryMemo(c.id, m.id, m.label)} title="Attach this memo to the chain">{m.label}</button>
                        ))}
                      </div>
                      <button className="mt-1 w-full text-[9px] uppercase" style={{ color: NEON.muted }} onClick={() => setPickFor(null)}>cancel</button>
                    </div>
                  ) : (
                    <button className="mt-0.5 flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => setPickFor(c.id)} title="Add a memo to this choice's chain"><Plus className="h-3 w-3" /> add memo</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
