// CEQ STUDIO (prompt 5) — one panel for day-to-day CEQ authoring, replacing the
// old deck UI's day-to-day use (the deck panel stays untouched). Three panes,
// reusing EXISTING models only: SETS = named CARD decks; QUESTIONS = a set's CEQ
// cards (free stems/choices) with a per-choice CHAIN editor (the prompt-1 model,
// one model / two doors); MEMO LIBRARY = every memo with label + category (incl
// ELEMENT), search/filter, bulk triage for the unfiled pile, and drag-onto-a-choice
// to attach to a chain. No new storage beyond panel prefs.
import { useEffect, useMemo, useState } from "react";
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Library, ListChecks, Plus, Search, Square, Trash2, X, ArrowUp, ArrowDown, Link2, Film } from "lucide-react";

import { addDeck, deckMembersOf, newDeckDef, removeDeck, updateDeck } from "./deck-defs";
import { nextStageOrder } from "./BaseCard";
import { addNodesAndEdgesCmd, addNodesCmd, bus, compositeCmd, patchDataCmd, patchDataFnCmd, removeNodesCmd, type RfLike } from "./commands";
import { memoAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { CeqChainEditor } from "./CeqChainEditor";
import { CeqPreviewer, dealCentre, defaultMemoPos } from "./CeqPreviewer";
import { seedCeqSets } from "./ceq-seed";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { useFrameNav } from "./FrameNavContext";
import { cardId, type CeqCard, type CeqChoice, type DeckDef } from "./types";
import { NEON } from "./theme";

const memoText = (title?: string, body?: string) => ((title && title.trim()) || (body || "").replace(/[*_=~`#>]/g, "").trim() || "memo");
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const NONE = "__uncat__";
const MEMO_DND = "text/sa-studio-memo";

export function CeqStudio({ decks, setDecks, initialCeqId, onPopOut, popped, onClose }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void; initialCeqId?: string | null; onPopOut?: () => void; popped?: boolean; onClose: () => void }) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes(); // reactive
  const nav = useFrameNav();
  const cardDecks = decks.filter((d) => d.payloadType === "cards");
  const [setId, setSetId] = useState<string | null>(cardDecks[0]?.id ?? null);
  const [qId, setQId] = useState<string | null>(null);
  // OPEN FROM A CEQ (Lee) — pre-select the set (its deck) + that question.
  useEffect(() => {
    if (!initialCeqId) return;
    const n = rf.getNode(initialCeqId);
    const deckId = (n?.data as { deckId?: string } | undefined)?.deckId;
    if (deckId && cardDecks.some((d) => d.id === deckId)) setSetId(deckId);
    setQId(initialCeqId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCeqId]);
  const [chainFor, setChainFor] = useState<string | null>(null); // CEQ node whose chain editor is open
  const [note, setNote] = useState<string | null>(null);
  const [memoQuery, setMemoQuery] = useState("");
  const [catFilter, setCatFilter] = useState<Set<string>>(() => new Set([...MEMO_CATEGORIES, NONE]));
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(true); // collapsible stem/choices editor
  const [libOpen, setLibOpen] = useState(true); // collapsible memo-library pane
  const [setsOpen, setSetsOpen] = useState(true); // collapsible sets pane
  const [setsCourseFilter, setSetsCourseFilter] = useState("all"); // filter sets by course
  const [setsChapterFilter, setSetsChapterFilter] = useState("all"); // filter sets by chapter
  const [previewSelMemo, setPreviewSelMemo] = useState<string | null>(null); // memo selected in the previewer

  // SET ORGANISATION (Lee) — filter the sets list by course → chapter.
  const setCourses = useMemo(() => [...new Set(cardDecks.map((d) => d.course).filter((c): c is string => !!c))].sort(), [cardDecks]);
  const setChapters = useMemo(() => [...new Set(cardDecks.filter((d) => setsCourseFilter === "all" || d.course === setsCourseFilter).map((d) => d.chapter).filter((c): c is string => !!c))].sort(), [cardDecks, setsCourseFilter]);
  const filteredDecks = cardDecks.filter((d) => (setsCourseFilter === "all" || d.course === setsCourseFilter) && (setsChapterFilter === "all" || d.chapter === setsChapterFilter));
  const deck = cardDecks.find((d) => d.id === setId) ?? null;
  const questions = useMemo(() => (deck ? deckMembersOf(nodes as { id: string; type?: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id).filter((n) => (n as { type?: string }).type === "ceq") : []), [deck, nodes]);
  const qNode = qId ? nodes.find((n) => n.id === qId) : null;
  const qd = qNode?.data as unknown as CeqCard | undefined;
  // Re-seed signature for the live previewer — CONTENT only (stem/choices/chain), NOT
  // positions, so dragging a memo (which writes position back) never re-seeds/fights.
  const ceqSig = qd ? `${qId}|${qd.prompt}|${qd.choices.map((c) => `${c.text}:${c.correct ? 1 : 0}:${(c.chain ?? []).map((it) => `${it.memoNodeId}~${it.label}`).join(",")}`).join("|")}` : "";
  // The frame the set will be dealt into — the previewer mirrors ITS size so the
  // composition you build == the dealt frame exactly. Defaults to a 1600×900 stage.
  const targetFrame = nav.currentFrameId ? rf.getNode(nav.currentFrameId) : null;
  const frameW = (targetFrame?.data as { w?: number } | undefined)?.w ?? targetFrame?.width ?? 1600;
  const frameH = (targetFrame?.data as { h?: number } | undefined)?.h ?? targetFrame?.height ?? 900;
  // Chain arrows for the previewer — any edge whose SOURCE is a memo in this CEQ's
  // chains (memo → choice, memo → memo, …). Reactive so drawn arrows show at once.
  const allEdges = useEdges();
  const chainMemoIds = useMemo(() => { const s = new Set<string>(); (qd?.choices ?? []).forEach((c) => (c.chain ?? []).forEach((it) => s.add(it.memoNodeId))); return s; }, [ceqSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewEdges = useMemo(() => allEdges.filter((e) => chainMemoIds.has(e.source)).map((e) => ({ id: e.id, source: e.source, target: e.target })), [allEdges, chainMemoIds]);

  // ---- SETS -----------------------------------------------------------------
  const newSet = () => {
    const name = window.prompt("New set name?", `Set ${cardDecks.length + 1}`);
    if (!name) return;
    const def = { ...newDeckDef(name.trim(), "cards"), lessonId: (nav.currentFrameId ? (rf.getNode(nav.currentFrameId)?.parentId ?? null) : null) };
    setDecks((prev) => addDeck(prev, def));
    setSetId(def.id); setQId(null);
  };
  const runSeed = () => {
    if (!window.confirm("Seed the Ch 1–5 CEQ sets? Re-seeding replaces each seeded set's cards (idempotent) — your other sets are untouched.")) return;
    const rep = seedCeqSets(rf, setDecks);
    const total = rep.reduce((s, r) => s + r.count, 0);
    setNote(`Seeded ${rep.length} sets · ${total} questions${rep.some((r) => r.replaced) ? " (replaced existing)" : ""}. Chains/memos empty — add your voice.`);
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
  /** Reorder a chain memo within its choice (the outline "renumber"). */
  const reorderChainMemo = (ceqId: string, choiceId: string, idx: number, dir: -1 | 1) => {
    const c = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((ch) => { if (ch.id !== choiceId) return ch; const arr = [...(ch.chain ?? [])]; const j = idx + dir; if (j < 0 || j >= arr.length) return ch; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...ch, chain: arr }; }) }), "renumber chain");
    if (c) bus.dispatch(c);
  };
  /** Flat walk list for a question (choice order → chain index) for the outline. */
  const walkOf = (q: { id: string }) => { const cc = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.choices ?? []; const list: { choiceId: string; idx: number; label: string; letter: string; num: number; memoNodeId: string }[] = []; cc.forEach((ch, ci) => (ch.chain ?? []).forEach((it, i) => list.push({ choiceId: ch.id, idx: i, label: it.label, letter: LETTER(ci), num: list.length + 1, memoNodeId: it.memoNodeId }))); return list; };
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

  /** DEAL the set into the current frame — reparent its CEQ cards (a tucked stack)
   *  AND their chain memos, each at the EXACT position it holds in this previewer.
   *  The CEQ sits at the deal-centre; memos keep their frame-local spots but are
   *  hidden in film until Enter-walked (the hiddenOf reconciler owns that). So the
   *  frame is film-ready — no post-deal editing. */
  const dealIntoFrame = () => {
    const frameId = nav.currentFrameId;
    if (!frameId || !deck) { setNote("Enter a frame first, then Deal."); return; }
    const frame = rf.getNode(frameId);
    if (!frame || frame.type !== "frame") { setNote("Enter a frame first, then Deal."); return; }
    const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
    const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
    const members = questions.map((q) => rf.getNode(q.id)).filter((n): n is NonNullable<typeof n> => !!n);
    const memberIds = new Set(members.map((m) => m.id));
    // Each CEQ keeps the EXACT position it holds in the previewer (default = the
    // deal-centre, seeded there); the stack's flip-spot is the first card's spot.
    const dealSpot = members[0] ? { x: Math.round(members[0].position.x), y: Math.round(members[0].position.y) } : dealCentre(fw, fh);
    const memoIds = new Set<string>();
    for (const m of members) for (const ch of ((m.data as unknown as CeqCard).choices ?? [])) for (const it of (ch.chain ?? [])) if (it.memoNodeId) memoIds.add(it.memoNodeId);
    bus.dispatch({
      label: `deal ${deck.name} into frame`,
      do: () => rf.setNodes((nds) => nds.map((n) => {
        if (memberIds.has(n.id)) { const mi = members.findIndex((m) => m.id === n.id); return { ...n, parentId: frameId, position: { ...n.position }, data: { ...n.data, tucked: mi > 0, deckMember: true, staged: undefined, minimized: undefined } } as typeof n; }
        if (memoIds.has(n.id)) return { ...n, parentId: frameId, position: { ...n.position } } as typeof n; // frame-local position already set from the previewer
        return n;
      })),
      undo: () => { /* transient staging move — re-deal to redo; not separately undone */ },
    });
    const c = patchDataCmd(rfl, frameId, { stackDeal: true, dealSpot }, "stack deal"); if (c) bus.dispatch(c);
    setNote(`Dealt ${members.length} question${members.length === 1 ? "" : "s"} + ${memoIds.size} memo${memoIds.size === 1 ? "" : "s"} — positions match this preview. Film-ready (Enter reveals the memos).`);
  };

  // ---- MEMO LIBRARY ---------------------------------------------------------
  const memos = useMemo(() => rf.getNodes().filter((n) => n.type === "memo").map((n) => { const d = n.data as { label?: string; title?: string; body?: string; category?: string; subcategory?: string; course?: string }; return { id: n.id, label: d.label || memoText(d.title, d.body), category: (d.category || "").toUpperCase(), subcategory: d.subcategory || "", course: d.course || "" }; }), [nodes]);
  const courses = useMemo(() => [...new Set(memos.map((m) => m.course).filter(Boolean))].sort(), [memos]);
  const shownMemos = memos
    .filter((m) => catFilter.has(m.category || NONE))
    .filter((m) => courseFilter === "all" || m.course === courseFilter)
    .filter((m) => { const q = memoQuery.trim().toLowerCase(); return !q || m.label.toLowerCase().includes(q) || m.subcategory.toLowerCase().includes(q); });
  const toggleCat = (c: string) => setCatFilter((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkCategory = (cat: string) => { if (sel.size === 0) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { category: cat }, "set category")).filter((c): c is NonNullable<typeof c> => !!c), "bulk categorise"); if (cmd) bus.dispatch(cmd); setNote(`Set ${sel.size} memo${sel.size === 1 ? "" : "s"} → ${cat}`); };
  const bulkPrompt = (field: "subcategory" | "label" | "course", label: string) => { if (sel.size === 0) return; const val = window.prompt(label); if (val == null) return; const cmd = compositeCmd([...sel].map((id) => patchDataCmd(rfl, id, { [field]: val.trim() }, `set ${field}`)).filter((c): c is NonNullable<typeof c> => !!c), `bulk ${field}`); if (cmd) bus.dispatch(cmd); setNote(`Set ${field} on ${sel.size} memo${sel.size === 1 ? "" : "s"}.`); };
  /** REMOVE DUPLICATES — keep one memo per (title/label · body · category · subcat),
   *  delete the rest that AREN'T referenced by a chain/attach edge (never breaks a chain). */
  const removeDupes = () => {
    const memoNodes = rf.getNodes().filter((n) => n.type === "memo");
    const referenced = new Set(rf.getEdges().map((e) => e.source));
    const seen = new Set<string>();
    const toDelete: string[] = [];
    for (const n of memoNodes) {
      const d = n.data as { title?: string; body?: string; category?: string; subcategory?: string; label?: string };
      const key = `${(d.label || d.title || "").trim().toLowerCase()}␟${(d.body || "").trim().toLowerCase()}␟${(d.category || "").toLowerCase()}␟${(d.subcategory || "").toLowerCase()}`;
      if (seen.has(key)) { if (!referenced.has(n.id)) toDelete.push(n.id); } else seen.add(key);
    }
    if (toDelete.length === 0) { setNote("No removable duplicates found."); return; }
    const cmd = removeNodesCmd(rfl, toDelete, `remove ${toDelete.length} duplicate memos`);
    if (cmd) bus.dispatch(cmd);
    setSel(new Set());
    setNote(`Removed ${toDelete.length} duplicate memo${toDelete.length === 1 ? "" : "s"} (kept referenced ones).`);
  };
  const allShownSel = shownMemos.length > 0 && shownMemos.every((m) => sel.has(m.id));

  /** DELETE memos from the LIBRARY — removes the nodes (+ their arrows) and strips
   *  them from any chain that referenced them. One undoable step. */
  const deleteMemos = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const cmds: NonNullable<ReturnType<typeof patchDataCmd>>[] = [];
    for (const n of rf.getNodes()) {
      if (n.type !== "ceq") continue;
      const choices = (n.data as { choices?: CeqChoice[] }).choices ?? [];
      if (!choices.some((c) => (c.chain ?? []).some((it) => idSet.has(it.memoNodeId)))) continue;
      const p = patchDataFnCmd(rfl, n.id, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).filter((it) => !idSet.has(it.memoNodeId)) })) }), "unchain");
      if (p) cmds.push(p);
    }
    const rm = removeNodesCmd(rfl, ids, `delete ${ids.length} memo${ids.length === 1 ? "" : "s"}`); // removes nodes + their arrows
    if (rm) cmds.push(rm);
    const cmd = compositeCmd(cmds, "delete memos"); if (cmd) bus.dispatch(cmd);
    setSel((p) => { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n; });
    setNote(`Deleted ${ids.length} memo${ids.length === 1 ? "" : "s"} from the library.`);
  };

  /** REMOVE a memo from a CHAIN — detach it from the choice (drop the chain entry +
   *  the arrow) but KEEP the memo node in the library. */
  const removeFromChain = (ceqId: string, memoNodeId: string) => {
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => ({ ...c, chain: (c.chain ?? []).filter((it) => it.memoNodeId !== memoNodeId) })) }), "remove from chain");
    const gone = new Set(rf.getEdges().filter((e) => e.source === memoNodeId && e.target === ceqId).map((e) => e.id));
    const snap = gone.size ? structuredClone(rf.getEdges().filter((e) => gone.has(e.id))) : [];
    const edgeCmd = gone.size ? { label: "remove chain arrow", do: () => rf.setEdges((eds) => eds.filter((e) => !gone.has(e.id))), undo: () => rf.setEdges((eds) => [...eds, ...structuredClone(snap)]) } : null;
    const cmd = compositeCmd([patch, edgeCmd].filter((c): c is NonNullable<typeof c> => !!c), "remove from chain"); if (cmd) bus.dispatch(cmd);
    setPreviewSelMemo(null);
    setNote("Removed memo from the chain (still in the library).");
  };

  // DELETE KEY — select a memo in the PREVIEWER → detach from its chain; else select
  // memo(s) in the LIBRARY (checkboxes) → delete the node(s). Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (previewSelMemo && qId) { e.preventDefault(); removeFromChain(qId, previewSelMemo); return; }
      if (sel.size > 0) { e.preventDefault(); deleteMemos([...sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSelMemo, qId, sel]);

  /** CREATE a brand-new memo straight from the Studio, attached to a choice's chain
   *  and placed (frame-local) so it shows immediately in the previewer. */
  const createMemoForChoice = (ceqId: string, choiceId: string) => {
    const text = window.prompt("New memo text");
    if (text == null) return;
    const label = text.trim() || "Memo";
    const memoId = cardId("memo");
    const cc = (rf.getNode(ceqId)?.data as unknown as CeqCard | undefined)?.choices ?? [];
    const chainCount = cc.reduce((s, ch) => s + (ch.chain?.length ?? 0), 0);
    const memoNode = { id: memoId, type: "memo", position: defaultMemoPos(frameW, frameH, chainCount), selected: false, data: { kind: "memo", memoKind: "note", title: label, body: "", category: "" } };
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [memoNode] as never, [edge] as never, "create chain memo"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "add memo to chain"); if (patch) bus.dispatch(patch);
    setNote(`Created memo "${clip(label, 24)}" — drag it in the preview to place it.`);
  };
  /** Rename a chain memo's label (and its memo node's title) — the outline "rename". */
  const renameChainMemo = (ceqId: string, choiceId: string, idx: number, memoNodeId: string, cur: string) => {
    const next = window.prompt("Memo label", cur);
    if (next == null) return;
    const label = next.trim() || "Memo";
    const p1 = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: (c.chain ?? []).map((it, i) => (i === idx ? { ...it, label } : it)) } : c)) }), "rename memo label"); if (p1) bus.dispatch(p1);
    const p2 = patchDataCmd(rfl, memoNodeId, { title: label, label }, "rename memo"); if (p2) bus.dispatch(p2);
  };

  /** Drop a memo onto a choice → attach it (existing node) to that choice's chain. */
  const attachMemoToChoice = (ceqId: string, choiceId: string, memoId: string) => {
    const m = rf.getNode(memoId); if (!m) return;
    const md = m.data as { label?: string; title?: string; body?: string };
    const label = md.label || memoText(md.title, md.body);
    const edge = { id: `chn-${choiceId}-${memoId}`, source: memoId, sourceHandle: "l", target: ceqId, targetHandle: memoAnchorId(choiceId), type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } };
    const add = addNodesAndEdgesCmd(rfl, [] as never, [edge] as never, "chain arrow"); if (add) bus.dispatch(add);
    const patch = patchDataFnCmd(rfl, ceqId, (prev) => ({ choices: (prev as unknown as { choices: CeqChoice[] }).choices.map((c) => (c.id === choiceId ? { ...c, chain: [...(c.chain ?? []), { kind: "memo" as const, memoNodeId: memoId, label }] } : c)) }), "attach memo");
    if (patch) bus.dispatch(patch);
    setNote(`Attached "${clip(label, 24)}" to choice.`);
  };

  const COL = "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg";
  const HEAD = "flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider";
  return (
    <div className={popped ? "flex h-full w-full flex-col" : "absolute inset-0 z-[60] flex flex-col"} style={{ background: "rgba(6,10,20,0.98)", color: NEON.text }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <div className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.18em]" style={{ color: NEON.yellow }}><ListChecks className="h-4 w-4" /> CEQ Studio</div>
        <div className="flex items-center gap-2">
          {!popped && onPopOut && <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }} title="Pop out to a window (2nd monitor · capture-invisible)" onClick={onPopOut}><ExternalLink className="h-4 w-4" /></button>}
          {note && <span className="text-[10px]" style={{ color: NEON.muted }}>{note}</span>}
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* PANE 1 — SETS (collapsible; filter by course → chapter) */}
        {!setsOpen ? (
          <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={() => setSetsOpen(true)} title="Show the sets list">
            <ListChecks className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>Sets ({cardDecks.length})</span>
          </button>
        ) : (
        <div className={COL} style={{ maxWidth: 220, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Sets <span style={{ color: NEON.muted }}>({filteredDecks.length === cardDecks.length ? cardDecks.length : `${filteredDecks.length}/${cardDecks.length}`})</span>
            <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setSetsOpen(false)} title="Collapse the sets list"><ChevronLeft className="h-3.5 w-3.5" /></button>
          </div>
          {setCourses.length > 0 && (
            <div className="flex flex-col gap-1 px-1.5 pt-1.5">
              <select value={setsCourseFilter} onChange={(e) => { setSetsCourseFilter(e.target.value); setSetsChapterFilter("all"); }} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Filter sets by course">
                <option value="all">all courses</option>
                {setCourses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {setChapters.length > 0 && (
                <select value={setsChapterFilter} onChange={(e) => setSetsChapterFilter(e.target.value)} className="rounded bg-black/40 px-1 py-0.5 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Filter sets by chapter">
                  <option value="all">all chapters</option>
                  {setChapters.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {filteredDecks.length === 0 && <div className="px-1.5 py-2 text-[10px] italic" style={{ color: NEON.muted }}>{cardDecks.length === 0 ? "No sets yet — a set is a named deck of CEQ questions." : "No sets match the filter."}</div>}
            {filteredDecks.map((d) => {
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
          <button className="mx-1 mb-1 flex items-center justify-center gap-1 rounded px-1 py-1 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={runSeed} title="Create the Ch 1–5 CEQ sets (Free + Full each) — mechanical stems/choices, empty chains. Idempotent.">seed Ch 1–5</button>
        </div>
        )}

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
              {/* OUTLINE — CEQ → its chain memos (renumber via up/down) */}
              <div className="min-h-0 w-48 shrink-0 overflow-y-auto border-r p-1" style={{ borderColor: NEON.borderSoft }}>
                {questions.length === 0 && <div className="px-1 py-1 text-[9.5px] italic" style={{ color: NEON.muted }}>No questions — add one below.</div>}
                {questions.map((q, i) => { const p = (rf.getNode(q.id)?.data as unknown as CeqCard | undefined)?.prompt || "Question"; const walk = qId === q.id ? walkOf(q) : []; return (
                  <div key={q.id}>
                    <div className="flex items-center gap-0.5">
                      <button className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[10.5px]" style={{ background: qId === q.id ? "rgba(252,163,17,0.14)" : "transparent", color: qId === q.id ? NEON.yellow : NEON.text }} onClick={() => setQId(q.id)}><span className="tabular-nums opacity-60">{i + 1}.</span> {clip(p, 20)}</button>
                      <button disabled={i === 0} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderQ(q.id, -1)} title="Up"><ArrowUp className="h-3 w-3" /></button>
                      <button disabled={i === questions.length - 1} className="grid h-4 w-4 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderQ(q.id, 1)} title="Down"><ArrowDown className="h-3 w-3" /></button>
                    </div>
                    {qId === q.id && walk.map((w, wi) => (
                      <div key={`${w.choiceId}-${w.idx}`} className="ml-3 flex items-center gap-0.5 py-0.5 text-[9.5px]">
                        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[7.5px] font-black" style={{ color: "#0B0F1E", background: NEON.yellow }}>{w.num}</span>
                        <span className="min-w-0 flex-1 cursor-text truncate" style={{ color: NEON.text }} title={`Choice ${w.letter}: ${w.label} — double-click to rename`} onDoubleClick={() => renameChainMemo(q.id, w.choiceId, w.idx, w.memoNodeId, w.label)}>{w.label}</span>
                        <button disabled={w.idx === 0} className="grid h-3.5 w-3.5 place-items-center disabled:opacity-25" style={{ color: NEON.muted }} onClick={() => reorderChainMemo(q.id, w.choiceId, w.idx, -1)} title="Earlier in walk"><ArrowUp className="h-2.5 w-2.5" /></button>
                        <button className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEON.muted }} onClick={() => reorderChainMemo(q.id, w.choiceId, w.idx, 1)} title="Later in walk"><ArrowDown className="h-2.5 w-2.5" /></button>
                        <button className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEON.red }} onClick={() => removeFromChain(q.id, w.memoNodeId)} title="Remove from chain (keeps the memo in the library)"><X className="h-2.5 w-2.5" /></button>
                      </div>
                    ))}
                  </div>
                ); })}
                <button className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={addQuestion}><Plus className="h-3 w-3" /> question</button>
              </div>
              {/* WYSIWYG previewer (top) + collapsible stem/choices editor (bottom) */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1">
                  <CeqPreviewer ceqId={qId} mainRf={rf} mainSig={ceqSig} frameW={frameW} frameH={frameH} chainEdges={previewEdges} onSelectMemo={setPreviewSelMemo} />
                </div>
                {qd && (
                  <div className="shrink-0 border-t" style={{ borderColor: NEON.borderSoft }}>
                    <div className="flex items-center gap-1 px-2 py-1">
                      <button className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }} onClick={() => setEditorOpen((v) => !v)}>{editorOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} edit stem & choices</button>
                      <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setChainFor(qId)} title="Per-choice chains + save/load template (same model as the card popover)"><Link2 className="h-3 w-3" /> chains & templates</button>
                    </div>
                    {editorOpen && (
                      <div className="max-h-[38vh] overflow-y-auto px-2 pb-2">
                        <div className="flex flex-col gap-2">
                          <textarea rows={2} className="nodrag w-full resize-none rounded px-2 py-1.5 text-[13px] outline-none" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} value={qd.prompt} onChange={(e) => patchQ(qId!, { prompt: e.target.value })} placeholder="The question stem…" />
                          <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Choices — click ○ to mark correct · +💡 or drop a memo to chain it</div>
                          {qd.choices.map((ch, ci) => (
                            <div key={ch.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ border: `1px solid ${ch.correct ? "rgba(59,245,160,0.5)" : NEON.borderSoft}` }}
                              onDragOver={(e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                              onDrop={(e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); attachMemoToChoice(qId!, ch.id, mid); } }}>
                              <button className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black" style={{ color: ch.correct ? "#0B0F1E" : NEON.muted, background: ch.correct ? "#3BF5A0" : "transparent", border: `1px solid ${ch.correct ? "#3BF5A0" : NEON.borderSoft}` }} onClick={() => setCorrect(qId!, ch.id)} title="Mark correct">{LETTER(ci)}</button>
                              <input className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" style={{ color: NEON.text }} value={ch.text} onChange={(e) => patchChoice(qId!, ch.id, { text: e.target.value })} placeholder={`Choice ${LETTER(ci)}`} />
                              {(ch.chain?.length ?? 0) > 0 && <span className="shrink-0 text-[8px] tabular-nums" style={{ color: NEON.cyan }} title="chain items">⛓{ch.chain!.length}</span>}
                              <button className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => createMemoForChoice(qId!, ch.id)} title="Create a memo chained to this choice (appears in the preview)">+💡</button>
                              <button className="shrink-0" style={{ color: NEON.red }} onClick={() => removeChoice(qId!, ch.id)} title="Remove choice"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <button className="flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => addChoice(qId!)}><Plus className="h-3 w-3" /> choice</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PANE 3 — MEMO LIBRARY (collapsible to a thin rail to give the previewer room) */}
        {!libOpen ? (
          <button className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg py-2" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)", color: NEON.cyan }} onClick={() => setLibOpen(true)} title="Show the memo library">
            <Library className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>Memos ({memos.length})</span>
          </button>
        ) : (
        <div className={COL} style={{ maxWidth: 260, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.2)" }}>
          <div className={HEAD} style={{ borderColor: NEON.borderSoft, color: NEON.cyan }}>Memo library <span style={{ color: NEON.muted }}>({memos.length})</span>
            <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={() => setLibOpen(false)} title="Collapse the memo library"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex items-center gap-1 px-1.5 pt-1.5"><Search className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} /><input value={memoQuery} onChange={(e) => setMemoQuery(e.target.value)} placeholder="search title / sub-category" className="min-w-0 flex-1 bg-transparent text-[10.5px] outline-none" style={{ color: NEON.text }} /></div>
          {courses.length > 0 && (
            <div className="flex items-center gap-1 px-1.5 pt-1"><span className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Course</span>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="min-w-0 flex-1 rounded bg-black/40 text-[9.5px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}>
                <option value="all">all courses</option>
                {courses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
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
                <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: NEON.text }}>{m.label}{m.subcategory && <span className="ml-1 text-[8px]" style={{ color: NEON.cyan }}>· {m.subcategory}</span>}</span>
                {m.category && <span className="shrink-0 text-[7.5px] font-bold uppercase" style={{ color: NEON.muted }}>{m.category === "ELEMENT" ? "🧩" : m.category.slice(0, 4)}</span>}
                <button className="shrink-0" style={{ color: NEON.red }} onClick={() => deleteMemos([m.id])} title="Delete this memo from the library (also unchains it)"><X className="h-3 w-3" /></button>
              </div>
            ); })}
          </div>
          {/* bulk triage */}
          <div className="flex flex-col gap-1 border-t p-1.5" style={{ borderColor: NEON.borderSoft }}>
            <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>
              <span>Bulk ({sel.size})</span>
              <div className="flex items-center gap-1">
                <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} onClick={() => deleteMemos([...sel])} disabled={sel.size === 0} title="Delete the selected memos from the library (Delete key)">delete ({sel.size})</button>
                <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} onClick={removeDupes} title="Delete duplicate memos (same title/body/category/subcat); keeps any that are attached to a chain">remove dupes</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkCategory(c)} disabled={sel.size === 0} title="Set the top-level category">{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)}
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkPrompt("subcategory", "Sub-category for the selected memos (e.g. Bank Reconciliations)")} disabled={sel.size === 0} title="Set a sub-category under the category">set sub…</button>
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkPrompt("label", "Title (display name) for the selected memos")} disabled={sel.size === 0} title="Set the memo TITLE / display name (not the category)">set title…</button>
              <button className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => bulkPrompt("course", "Course tag for the selected memos")} disabled={sel.size === 0} title="Tag with a course (for the course filter)">set course…</button>
            </div>
          </div>
        </div>
        )}
      </div>

      {chainFor && <CeqChainEditor nodeId={chainFor} onClose={() => setChainFor(null)} />}
    </div>
  );
}
