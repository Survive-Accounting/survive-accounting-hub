// NAMED DECKS manager (P3) — the deck panel's first-class-deck section. Create
// CARD decks or MEMO decks; rename, duplicate, delete; toggle run mode
// (sequence↔shuffle) and skeletons; add the current SELECTION to a deck. Cards/
// memos join via data.deckId (+ deckMember for the roster). The deck definitions
// live in the scene (persisted); the canvas_decks table (0090) is the reusable
// library layer. Deal-into-grid + memo highlight render in P4.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNodes, useReactFlow } from "@xyflow/react";

import { fetchJeBrowserTree } from "@/lib/je-api";
import { effectCardData } from "./equation-derive";
import { ArrowDown, ArrowUp, Clapperboard, Copy, Grid3x3, Layers, ListChecks, ListOrdered, Plus, RotateCcw, Shuffle, Sparkles, SquareStack, Trash2 } from "lucide-react";

import { addDeck, deckMembersOf, duplicateDeck, gridSlots, newDeckDef, normalBalanceCeqData, NORMAL_BALANCE_DRILL_FILTER, removeDeck, seedChapters, seedStartHereDecks, shuffledOrder, updateDeck, type SeedChapter } from "./deck-defs";
import { addNodesCmd, bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { CEQ_OPTIONS, correctFor, filmOrder, generateCeqCards, seedAccountTypeSet, type CeqOption, type CeqSetAccount, type CeqSetDef, type Difficulty } from "./ceq-set";
import { nextStageOrder } from "./BaseCard";
import { useCanvasSettings } from "./CanvasSettingsContext";
import { DECK_DND_MIME, useDecks } from "./DecksContext";
import { useFrameNav } from "./FrameNavContext";
import { cardId, isContainerType, type CeqCard, type DeckDef } from "./types";
import { CeqSetPreviewer } from "./CeqSetPreviewer";
import { NEON } from "./theme";

export function DeckManager({ decks, setDecks, ceqSets, setCeqSets, lessonScope }: { decks: DeckDef[]; setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void; ceqSets: CeqSetDef[]; setCeqSets: (fn: (prev: CeqSetDef[]) => CeqSetDef[]) => void; lessonScope?: string | null }) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const nav = useFrameNav();
  const { flashDeck } = useDecks();
  const { coa, courseId, jeLibrary } = useCanvasSettings();
  // ITEM 6: the scene course's REAL chapters (active, in order) drive the seed —
  // no longer a hardcoded list. The tree query is shared/cached (300s staleTime).
  const tree = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 300_000, retry: 1, networkMode: "always" });
  const courseChaptersFull = (tree.data?.courses.find((c) => c.id === courseId)?.chapters ?? [])
    .filter((c) => c.id !== "__unassigned__" && c.status !== "archived" && c.chapter_name)
    .sort((a, b) => (a.chapter_number ?? 999) - (b.chapter_number ?? 999));
  const courseChapters: SeedChapter[] = courseChaptersFull.map((c) => ({ number: c.chapter_number, name: c.chapter_name as string }));
  const [open, setOpen] = useState(false); // NAMED DECKS — collapsed by default (Lee: out of the way; CEQ sets are the main flow)
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // deck row a card is hovering over (item 4a)
  const [orderDeck, setOrderDeck] = useState<string | null>(null); // deck whose deal-order list is open (Lee: rearrange deal order)
  const [seedNote, setSeedNote] = useState<string | null>(null); // one-line result after seeding

  const create = (payloadType: "cards" | "memos") => setDecks((prev) => addDeck(prev, newDeckDef("", payloadType)));

  /** SEED START HERE (item 5) — stamp the empty authoring roadmap of named decks
   *  into the scene, wiring each chapter deck to the matching lesson. Idempotent. */
  const seedStartHere = () => {
    const lessons = rf.getNodes().filter((n) => n.type === "lesson").map((n) => ({ id: n.id, label: String((n.data as { label?: string }).label ?? "") }));
    const chs = seedChapters(courseChapters); // item 6: the course's REAL chapters, else the Foundations fallback
    setDecks((prev) => {
      const { toAdd, attached, unattached } = seedStartHereDecks(prev, chs, lessons);
      setSeedNote(toAdd.length === 0 ? "already seeded — nothing added" : `added ${toAdd.length} decks · ${attached}/${chs.length} chapters matched a lesson${unattached.length ? ` (loose: ${unattached.join(", ")})` : ""}`);
      return [...prev, ...toAdd];
    });
  };

  /** GENERATE NORMAL-BALANCE DRILL (item 6) — one DR/CR CEQ per COA account,
   *  tucked into this drill deck as skeletons. A CEQ variant, no new card kind. */
  const generateDrill = (deck: DeckDef) => {
    const accounts = coa.flatMap((g) => g.accounts.map((a) => ({ name: a.name, normal: a.normal })));
    if (accounts.length === 0) { setSeedNote("no chart of accounts loaded — set the scene's course first"); return; }
    if (deckMembersOf(rf.getNodes() as never, deck.id).length > 0) { setSeedNote("drill already generated — delete its cards to regenerate"); return; }
    const data = normalBalanceCeqData(accounts, () => cardId("ch"));
    const cols = Math.max(1, Math.ceil(Math.sqrt(data.length)));
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    const slots = gridSlots(data.length, { originX: Math.round(c.x - (cols * 290) / 2), originY: Math.round(c.y - 120), cellW: 260, cellH: 150, gapX: 30, gapY: 30 });
    const newNodes = data.map((q, i) => ({
      id: cardId("ceq"), type: "ceq", position: slots[i], selected: false,
      data: { kind: "ceq", title: "Normal balance", prompt: q.prompt, choices: q.choices, deckId: deck.id, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: "ceq:normal-balance", deckPos: slots[i] } as Record<string, unknown>,
    }));
    const cmd = addNodesCmd(rf as unknown as RfLike, newNodes as never, `generate ${newNodes.length} normal-balance drills`);
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => updateDeck(prev, deck.id, { slots }));
    setSeedNote(`generated ${newNodes.length} DR/CR questions from the course COA`);
  };

  /** GENERATE EFFECT CARDS (ER7) — for a chapter deck ("Ch N · …"), spawn one
   *  effect card per PLACED scenario of that chapter, each BOUND + blank +
   *  arrows lens, in placement order, tucked into the deck. Both presets. This
   *  builds a whole chapter's effect-teaching deck in one click. */
  const generateEffectCards = (deck: DeckDef, preset: "ale" | "re") => {
    const m = /\bch(?:apter)?\.?\s*(\d+)/i.exec(deck.name);
    const n = m ? Number(m[1]) : null;
    const chapter = n != null ? courseChaptersFull.find((c) => c.chapter_number === n) : undefined;
    if (!chapter) { setSeedNote(`couldn't map "${deck.name}" to a course chapter`); return; }
    const scenarios = jeLibrary
      .filter((it) => it.kind === "je" && it.chapterId === chapter.id && it.status !== "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (scenarios.length === 0) { setSeedNote(`no placed scenarios in ${deck.name} to generate from`); return; }
    if (deckMembersOf(rf.getNodes() as never, deck.id).length > 0) { setSeedNote("deck already has cards — clear it to regenerate"); return; }
    const coaMap = coa.flatMap((g) => g.accounts);
    const cols = Math.max(1, Math.ceil(Math.sqrt(scenarios.length)));
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const cen = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    const slots = gridSlots(scenarios.length, { originX: Math.round(cen.x - (cols * 330) / 2), originY: Math.round(cen.y - 140), cellW: 300, cellH: 170, gapX: 30, gapY: 30 });
    const newNodes = scenarios.map((it, i) => {
      const made = it.make() as { solution?: unknown; lines?: unknown; caption?: string };
      const lines = (made.solution ?? made.lines ?? []) as never[];
      const eff = effectCardData(it.scenarioId, lines, coaMap, preset, () => cardId("fs"));
      return {
        id: cardId("formula"), type: "formula", position: slots[i], selected: false,
        data: { ...eff, title: made.caption ?? it.label, deckId: deck.id, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: `effect:${preset}`, deckPos: slots[i] } as Record<string, unknown>,
      };
    });
    const cmd = addNodesCmd(rf as unknown as RfLike, newNodes as never, `generate ${newNodes.length} effect cards`);
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => updateDeck(prev, deck.id, { slots }));
    setSeedNote(`generated ${newNodes.length} ${preset === "re" ? "Rev/Exp" : "A=L+E"} effect cards for ${deck.name}`);
  };

  // ---- CEQ SET FACTORY -------------------------------------------------------
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [previewSet, setPreviewSet] = useState<string | null>(null); // CEQ Set Previewer modal (organize + reorder)
  const lessonOpts = rf.getNodes().filter((n) => n.type === "lesson").map((n) => ({ id: n.id, label: String((n.data as { label?: string }).label ?? "Lesson") }));

  const newAccountTypeSet = () => {
    const coaAccts = coa.flatMap((g) => g.accounts).map((a) => ({ id: a.name, name: a.name, accountType: a.type }));
    if (coaAccts.length === 0) { setSeedNote("no chart of accounts loaded — set the scene's course first"); return; }
    const set = seedAccountTypeSet(cardId("ceqset"), coaAccts);
    setCeqSets((prev) => [...prev, set]);
    setExpandedSet(set.id);
    setSeedNote(`new set: ${set.accounts.filter((a) => a.include).length}/${set.accounts.length} accounts included`);
  };

  const patchAccount = (setId: string, accountId: string, patch: Partial<CeqSetAccount>) =>
    setCeqSets((prev) => prev.map((s) => (s.id === setId ? { ...s, accounts: s.accounts.map((a) => (a.accountId === accountId ? { ...a, ...patch } : a)) } : s)));
  const cycleDifficulty = (d: Difficulty): Difficulty => (d === "easy" ? "medium" : d === "medium" ? "hard" : "easy");
  const removeSet = (setId: string) => setCeqSets((prev) => prev.filter((s) => s.id !== setId));

  /** APPROVE AS DECK — generate one card per included account in FILM order and
   *  spawn them tucked into a named deck (re-approve replaces the deck's cards).
   *  Reports the film order for Lee to eyeball. */
  const approveSet = (set: CeqSetDef, lessonId: string | null) => {
    const order = filmOrder(set.accounts);
    if (order.length === 0) { setSeedNote("include at least one account first"); return; }
    const cards = generateCeqCards(set, order);
    const deckId = set.deckId ?? cardId("deck");
    const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length)));
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const cen = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    const slots = gridSlots(cards.length, { originX: Math.round(cen.x - (cols * 290) / 2), originY: Math.round(cen.y - 120), cellW: 260, cellH: 150, gapX: 30, gapY: 30 });
    // re-approve: remove the deck's existing cards, folded into one undo step
    const existingIds = new Set(deckMembersOf(rf.getNodes() as { data?: { deckId?: string; stageOrder?: number }; id: string }[], deckId).map((n) => n.id));
    const removeSnap = rf.getNodes().filter((n) => existingIds.has(n.id)).map((n) => structuredClone(n));
    const newNodes = cards.map((c, i) => ({
      id: cardId("ceq"), type: "ceq", position: slots[i], selected: false,
      data: { ...c, title: set.name, deckId, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: "ceq:set", deckPos: slots[i] } as Record<string, unknown>,
    }));
    const cmds = [
      removeSnap.length ? { label: "clear old CEQ cards", do: () => rf.setNodes((nds) => nds.filter((n) => !existingIds.has(n.id))), undo: () => rf.setNodes((nds) => [...nds, ...removeSnap.map((n) => structuredClone(n))]) } : null,
      addNodesCmd(rf as unknown as RfLike, newNodes as never, `approve ${newNodes.length} CEQ cards`),
    ].filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "approve set as deck");
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => (set.deckId ? updateDeck(prev, deckId, { slots, lessonId, name: set.name }) : addDeck(prev, { ...newDeckDef(set.name, "cards"), id: deckId, lessonId, runMode: "sequence", slots })));
    setCeqSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, deckId } : s)));
    setSeedNote(`approved ${cards.length} cards → "${set.name}". Film order: ${order.map((a) => a.name).join(" · ")}`);
  };

  /** DEAL A CEQ SET INTO THE ENTERED FRAME (Lee) — the set is a FACTORY: this spawns
   *  a FRESH copy of its cards into whatever frame you're currently inside, so the
   *  same set can fill a GRID in a teaser frame and a STACK in a cram frame,
   *  independently. Dealing into the same frame again REPLACES that frame's copy.
   *  Sets the frame's stackDeal so the space-walk in that frame matches the layout. */
  const dealSetIntoFrame = (set: CeqSetDef, mode: "grid" | "stack") => {
    const frameId = nav.currentFrameId;
    if (!frameId) { setSeedNote("Enter a frame first (double-click a frame), then deal grid / stack."); return; }
    const frame = rf.getNode(frameId);
    if (!frame || frame.type !== "frame") { setSeedNote("Enter a frame first (double-click a frame), then deal grid / stack."); return; }
    // ATTACH TO THE LESSON (Lee): stamp the frame's lesson so dealt cards group
    // under that lesson topic in the roster, NOT in Loose. (lessonIdOf only walks a
    // DIRECT lesson parent; a card in a frame would otherwise read as Loose.)
    const lessonId = frame.parentId && rf.getNode(frame.parentId)?.type === "lesson" ? frame.parentId : null;
    // DEAL IN THE SET'S MANUAL ORDER (Lee): the accounts array order IS the
    // pedagogical deal order — reorder it in the CEQ Set Previewer. (Was filmOrder,
    // an auto easy→hard sort; that now lives behind the previewer's "auto-sort".)
    const order = set.accounts.filter((a) => a.include);
    if (order.length === 0) { setSeedNote("include at least one account first"); return; }
    const cards = generateCeqCards(set, order);
    const deckId = `${set.id}::${frameId}`; // one copy per (set, frame) — re-deal replaces it
    const existing = rf.getNodes().filter((n) => (n.data as { deckId?: string }).deckId === deckId);
    const existingIds = new Set(existing.map((n) => n.id));
    const removeSnap = existing.map((n) => structuredClone(n));
    const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
    const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
    const mk = (c: CeqCard, i: number, pos: { x: number; y: number }, tucked: boolean) => ({
      id: cardId("ceq"), type: "ceq", parentId: frameId, position: { ...pos }, selected: false,
      data: { ...c, title: set.name, deckId, deckMember: true, deckLessonId: lessonId, tucked, stageOrder: i, slotIndex: i, deckCategory: "ceq:set", deckPos: { ...pos } } as Record<string, unknown>,
    });
    let newNodes: ReturnType<typeof mk>[];
    if (mode === "grid") {
      // teaser: all cards laid in the frame's grid, VISIBLE — "here's what's coming"
      const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length)));
      const rows = Math.ceil(cards.length / cols);
      const pad = 40, gap = 24;
      const cellW = Math.max(120, (fw - 2 * pad - (cols - 1) * gap) / cols);
      const cellH = Math.max(90, (fh - 2 * pad - (rows - 1) * gap) / rows);
      const slots = gridSlots(cards.length, { originX: pad, originY: pad, cols, cellW, cellH, gapX: gap, gapY: gap });
      newNodes = cards.map((c, i) => mk(c, i, slots[i], false));
    } else {
      // cram: cards STACKED on top of each other, centred + UNIFORM (Lee). Every
      // card SHARES one look so they land exactly on top of one another: WIDE width,
      // chrome HIDDEN (clean for filming — the settings bar off), and posLock
      // (locked in place). Centre a wide card. The TOP card deals VISIBLE (the first
      // cram card); the rest tuck behind it and Space flips to the next — each one
      // appears in the identical spot with the identical settings.
      const CW = 560, CH = 520; // wide CEQ (CEQ_WIDE_W)
      const at = { x: Math.round(fw / 2 - CW / 2), y: Math.round(Math.max(40, fh / 2 - CH / 2)) };
      newNodes = cards.map((c, i) => { const n = mk(c, i, at, i > 0); return { ...n, data: { ...n.data, wide: true, hideChrome: true, posLock: true } }; });
    }
    const cmds = [
      removeSnap.length ? { label: "clear frame copy", do: () => rf.setNodes((nds) => nds.filter((n) => !existingIds.has(n.id))), undo: () => rf.setNodes((nds) => [...nds, ...removeSnap.map((n) => structuredClone(n))]) } : null,
      addNodesCmd(rf as unknown as RfLike, newNodes as never, `deal ${cards.length} CEQ`),
      patchDataCmd(rf as unknown as RfLike, frameId, { stackDeal: mode === "stack" }, "deal mode"),
    ].filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, `deal set → ${mode}`);
    if (cmd) bus.dispatch(cmd);
    setSeedNote(`dealt ${cards.length} CEQ (${mode}) into ${frameTitleOf(frameId)}`);
  };

  // Memo summary → frame moved to the LEFT drawer "Memos" section
  // (MemoLibraryPanel): browse a lesson's memos, curate order, multi-select, and
  // add COPIES to the current frame. The old dump-all button lived here.

  /** ITEM 4a — a card/memo dragged from its chip onto this deck row (re)joins it.
   *  Elements/containers and the wrong payload type are rejected. One undo step. */
  const assignToDeck = (deck: DeckDef, nodeId: string) => {
    const n = rf.getNode(nodeId);
    if (!n || isContainerType(n.type)) return;
    const isMemo = n.type === "memo";
    if (deck.payloadType === "memos" ? !isMemo : isMemo) return; // card decks take cards; memo decks take memos
    const order = nextStageOrder(rf.getNodes() as never);
    const cmd = patchDataCmd(rf as unknown as RfLike, nodeId, { deckId: deck.id, deckMember: true, stageOrder: order }, `move to ${deck.name}`);
    if (cmd) bus.dispatch(cmd);
    flashDeck(deck.id);
  };

  /** Stamp the current selection into a deck (elements/containers skipped for a
   *  CARD deck; only memo nodes for a MEMO deck). ONE undoable command. */
  const addSelection = (deck: DeckDef) => {
    const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type));
    const eligible = sel.filter((n) => (deck.payloadType === "memos" ? n.type === "memo" : n.type !== "memo"));
    if (eligible.length === 0) return;
    let order = nextStageOrder(rf.getNodes() as never);
    const cmd = compositeCmd(
      eligible.map((n) =>
        patchDataCmd(rf as unknown as RfLike, n.id, { deckId: deck.id, deckMember: true, stageOrder: order++ }, "add to deck"),
      ),
      `add ${eligible.length} to ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
    flashDeck(deck.id);
  };

  type Member = { id: string; position: { x: number; y: number }; data?: { deckId?: string; stageOrder?: number; slotIndex?: number } };
  const membersOf = (deck: DeckDef) => deckMembersOf(rf.getNodes() as Member[], deck.id);

  /** LAY GRID (P4): arrange the deck's members into a near-square grid, record
   *  the slots, and tuck every member so the grid starts as skeletons. One step.
   *  INSIDE A FRAME (the hook shot): the members are REPARENTED into the frame and
   *  the slots are FRAME-LOCAL, so the whole grid rides inside the frame as its
   *  filmed content — deal fills it in place with no zoom-out. */
  const layGrid = (deck: DeckDef) => {
    const members = membersOf(deck);
    if (members.length === 0) return;
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const rows = Math.ceil(members.length / cols);
    // The target frame: the attached one (if it still exists), else the frame the
    // author is currently inside — laying then ATTACHES so it's remembered.
    const frameId = deck.frameId && rf.getNode(deck.frameId) ? deck.frameId : (nav.currentFrameId ?? null);
    const frame = frameId ? rf.getNode(frameId) : null;
    let slots: { x: number; y: number }[];
    if (frame) {
      const fw = (frame.data as { w?: number }).w ?? frame.width ?? 1600;
      const fh = (frame.data as { h?: number }).h ?? frame.height ?? 900;
      const pad = 40, gap = 24;
      const cellW = Math.max(120, (fw - 2 * pad - (cols - 1) * gap) / cols);
      const cellH = Math.max(90, (fh - 2 * pad - (rows - 1) * gap) / rows);
      // FRAME-LOCAL origin — the members become frame children (position is
      // relative to the frame's top-left).
      slots = gridSlots(members.length, { originX: pad, originY: pad, cols, cellW, cellH, gapX: gap, gapY: gap });
    } else {
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const c = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
      slots = gridSlots(members.length, { originX: Math.round(c.x - (cols * 360) / 2), originY: Math.round(c.y - 120), cellW: 320, cellH: 200, gapX: 40, gapY: 40 });
    }
    // Capture before-state so reparent + move is one undoable step.
    const before = members.map((m) => { const n = rf.getNode(m.id); return { id: m.id, parentId: n?.parentId, position: { ...(n?.position ?? { x: 0, y: 0 }) }, data: { ...(n?.data ?? {}) } }; });
    const slotFor = new Map(members.map((m, i) => [m.id, slots[i]] as const));
    const idxFor = new Map(members.map((m, i) => [m.id, i] as const));
    bus.dispatch({
      label: `lay grid: ${deck.name}`,
      do: () => rf.setNodes((nds) => nds.map((n) => {
        const slot = slotFor.get(n.id);
        if (!slot) return n;
        const next = { ...n, position: { ...slot }, data: { ...n.data, slotIndex: idxFor.get(n.id), deckMember: true, tucked: true, staged: undefined, minimized: undefined, deckPos: { ...slot } } } as typeof n;
        if (frame) next.parentId = frameId ?? undefined;
        return next;
      })),
      undo: () => rf.setNodes((nds) => nds.map((n) => {
        const b = before.find((x) => x.id === n.id);
        return b ? ({ ...n, parentId: b.parentId, position: { ...b.position }, data: { ...b.data } } as typeof n) : n;
      })),
    });
    setDecks((prev) => updateDeck(prev, deck.id, { slots, slotsLocal: !!frame, frameId: frame ? frameId : (deck.frameId ?? null) }));
  };

  /** Attach the deck to the frame you're currently inside (or detach). */
  const toggleFrameAttach = (deck: DeckDef) => {
    const fid = nav.currentFrameId;
    setDecks((prev) => updateDeck(prev, deck.id, { frameId: deck.frameId ? null : fid ?? null }));
  };
  const frameTitleOf = (fid: string | null | undefined) => {
    if (!fid) return null;
    const f = rf.getNode(fid);
    return f ? (((f.data as { title?: string }).title || "Frame")) : null;
  };

  /** A deck member's short label for the deal-order list (prompt / title / kind). */
  const cardLabelOf = (n: { data?: Record<string, unknown> }): string => {
    const d = (n.data ?? {}) as { prompt?: string; title?: string; caption?: string; kind?: string };
    return (d.prompt || d.title || d.caption || d.kind || "card").toString();
  };

  /** REARRANGE DEAL ORDER (Lee) — move a deck member up/down one slot in deal
   *  order. Reassigns every member's stageOrder to its new index so it's robust
   *  regardless of prior values; one undoable command. */
  const reorderDeckCard = (deck: DeckDef, cardId: string, dir: -1 | 1) => {
    const members = deckMembersOf(rf.getNodes() as { id: string; data?: { deckId?: string; stageOrder?: number } }[], deck.id);
    const i = members.findIndex((m) => m.id === cardId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= members.length) return;
    const arr = members.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const cmd = compositeCmd(
      arr.map((m, idx) => patchDataCmd(rf as unknown as RfLike, m.id, { stageOrder: idx }, "reorder deck")).filter((c): c is NonNullable<typeof c> => !!c),
      `reorder ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
  };

  /** Deck RESET: re-skeleton the whole grid (tuck all members back to slots).
   *  SHUFFLE (run_mode) reassigns which member lands in which slot first. */
  const resetDeck = (deck: DeckDef) => {
    const members = membersOf(deck);
    if (members.length === 0) return;
    const order = deck.runMode === "shuffle" ? shuffledOrder(members.length) : members.map((_, i) => i);
    const cmd = compositeCmd(
      members.map((n, i) => {
        const slotIdx = order[i];
        const slot = deck.slots?.[slotIdx] ?? n.position;
        return patchDataCmd(rf as unknown as RfLike, n.id, { slotIndex: slotIdx, deckMember: true, tucked: true, staged: undefined, minimized: undefined, deckPos: slot }, "reset deck");
      }),
      `reset ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
  };

  const del = (deck: DeckDef) => {
    // drop membership from this deck's members, then remove the def — one step
    const members = deckMembersOf(rf.getNodes() as { data?: { deckId?: string; stageOrder?: number }; id: string }[], deck.id);
    const cmd = compositeCmd(
      members.map((n) => patchDataCmd(rf as unknown as RfLike, n.id, { deckId: undefined }, "unassign deck")),
      `delete deck ${deck.name}`,
    );
    if (cmd) bus.dispatch(cmd);
    setDecks((prev) => removeDeck(prev, deck.id));
  };

  return (
    <div className="px-2 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
      <button className="flex w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }} onClick={() => setOpen((v) => !v)}>
        <Layers className="h-3 w-3" />
        Named decks <span style={{ color: NEON.muted }}>({decks.length})</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1">
          {/* ONE LESSON AT A TIME (Lee): when scoped, show only this lesson's named
              decks (plus unassigned decks, which belong to no lesson). */}
          {decks.filter((deck) => !lessonScope || deck.lessonId === lessonScope || !deck.lessonId).map((deck) => {
            const count = deckMembersOf(nodes as { data?: { deckId?: string; stageOrder?: number }; id: string }[], deck.id).length;
            const memo = deck.payloadType === "memos";
            const slotCount = deck.slots?.length ?? 0;
            const isDrop = dropTarget === deck.id;
            return (
              <div
                key={deck.id}
                className="rounded-md px-1.5 py-1"
                style={{ border: `1px solid ${isDrop ? NEON.yellow : NEON.borderSoft}`, background: isDrop ? "rgba(252,163,17,0.12)" : "rgba(0,0,0,0.25)", transition: "background 120ms, border-color 120ms" }}
                // ITEM 4a — drop a dragged card/memo here to (re)assign membership
                onDragOver={(e) => { if (e.dataTransfer.types.includes(DECK_DND_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropTarget !== deck.id) setDropTarget(deck.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget((t) => (t === deck.id ? null : t)); }}
                onDrop={(e) => { const nodeId = e.dataTransfer.getData(DECK_DND_MIME); setDropTarget(null); if (nodeId) { e.preventDefault(); assignToDeck(deck, nodeId); } }}
              >
                <div className="flex items-center gap-1">
                  <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ color: memo ? NEON.pinkSoft : NEON.yellow, border: `1px solid ${memo ? "rgba(224,40,74,0.4)" : "rgba(252,163,17,0.4)"}` }}>
                    {memo ? "memo" : "cards"}
                  </span>
                  {renaming === deck.id ? (
                    <input
                      autoFocus
                      defaultValue={deck.name}
                      className="min-w-0 flex-1 rounded bg-black/40 px-1 text-[11.5px] outline-none"
                      style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
                      onBlur={(e) => { setDecks((prev) => updateDeck(prev, deck.id, { name: e.target.value.trim() || deck.name })); setRenaming(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); e.stopPropagation(); }}
                    />
                  ) : (
                    // single click HIGHLIGHTS members on canvas (item 4e); double-click renames
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold"
                      style={{ color: NEON.text }}
                      title="Click: flash this deck's cards on the canvas · double-click: rename"
                      onClick={() => flashDeck(deck.id)}
                      onDoubleClick={() => setRenaming(deck.id)}
                    >
                      {deck.name}
                    </button>
                  )}
                  {deck.frameId && (
                    <span className="shrink-0 rounded px-1 text-[8px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title={`Attached to frame: ${frameTitleOf(deck.frameId) ?? "?"}`}>◈</span>
                  )}
                  {/* ITEM 4c — unambiguous MEMBER count ("3 cards"), slot count separate */}
                  <span className="shrink-0 text-[9px] tabular-nums" style={{ color: NEON.muted }} title={`${count} ${memo ? "memos" : "cards"} in this deck${slotCount ? ` · ${slotCount} grid slots` : ""}`}>
                    {count} {memo ? "memos" : "cards"}{slotCount ? ` · ${slotCount} slots` : ""}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <DeckMini title={deck.runMode === "shuffle" ? "Shuffle on reset" : "Deal in sequence"} active={deck.runMode === "shuffle"} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { runMode: deck.runMode === "shuffle" ? "sequence" : "shuffle" }))}>
                    <Shuffle className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title={deck.showSkeletons === false ? "Skeletons off" : "Skeletons on"} active={deck.showSkeletons !== false} onClick={() => setDecks((prev) => updateDeck(prev, deck.id, { showSkeletons: deck.showSkeletons === false }))}>
                    <SquareStack className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini
                    title={deck.frameId ? `Detach from frame (${frameTitleOf(deck.frameId) ?? "?"})` : nav.currentFrameId ? "Attach to the current frame — the grid lays inside it" : "Enter a frame first, then attach the deck to it"}
                    active={!!deck.frameId}
                    onClick={() => toggleFrameAttach(deck)}
                  >
                    <Clapperboard className="h-3 w-3" />
                  </DeckMini>
                  <DeckMini title={deck.frameId ? "Lay the skeleton grid INSIDE the attached frame" : "Lay a skeleton grid — arrange members into fixed slots, start tucked"} onClick={() => layGrid(deck)}><Grid3x3 className="h-3 w-3" /></DeckMini>
                  <DeckMini title={deck.runMode === "shuffle" ? "Reset — re-skeleton (shuffle slot order)" : "Reset — re-skeleton the grid"} onClick={() => resetDeck(deck)}><RotateCcw className="h-3 w-3" /></DeckMini>
                  {deck.filter === NORMAL_BALANCE_DRILL_FILTER && (
                    <DeckMini title="Generate the normal-balance drill from the course COA (DR/CR CEQ per account)" onClick={() => generateDrill(deck)}><Sparkles className="h-3 w-3" /></DeckMini>
                  )}
                  <DeckMini title="Rearrange the deal order of this deck's cards" active={orderDeck === deck.id} onClick={() => setOrderDeck((cur) => (cur === deck.id ? null : deck.id))}><ListOrdered className="h-3 w-3" /></DeckMini>
                  <DeckMini title="Duplicate deck" onClick={() => setDecks((prev) => duplicateDeck(prev, deck.id).defs)}><Copy className="h-3 w-3" /></DeckMini>
                  <DeckMini title="Delete deck" danger onClick={() => del(deck)}><Trash2 className="h-3 w-3" /></DeckMini>
                </div>
                {/* REARRANGE DEAL ORDER (Lee) — the deck's cards in deal order; up/down
                    moves a card earlier/later. Deal + space-walk follow this order. */}
                {orderDeck === deck.id && (() => {
                  const members = deckMembersOf(nodes as { id: string; data?: Record<string, unknown> }[], deck.id);
                  return (
                    <div className="mt-1 space-y-0.5 rounded p-1" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${NEON.borderSoft}` }}>
                      <div className="px-0.5 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Deal order</div>
                      {members.length === 0 && <div className="px-0.5 text-[9px] italic" style={{ color: NEON.muted }}>No cards yet — approve the set or add cards to this deck.</div>}
                      {members.map((m, idx) => (
                        <div key={m.id} className="flex items-center gap-1 text-[10px]">
                          <span className="w-3 shrink-0 text-right tabular-nums" style={{ color: NEON.muted }}>{idx + 1}</span>
                          <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }} title={cardLabelOf(m)}>{cardLabelOf(m)}</span>
                          <button disabled={idx === 0} className="grid h-4 w-4 place-items-center rounded transition-opacity disabled:opacity-30" style={{ color: NEON.muted }} title="Move up — deal earlier" onClick={() => reorderDeckCard(deck, m.id, -1)}><ArrowUp className="h-3 w-3" /></button>
                          <button disabled={idx === members.length - 1} className="grid h-4 w-4 place-items-center rounded transition-opacity disabled:opacity-30" style={{ color: NEON.muted }} title="Move down — deal later" onClick={() => reorderDeckCard(deck, m.id, 1)}><ArrowDown className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* ER7 — generate one BOUND blank effect card per placed scenario of
                    this chapter, into this deck, in placement order (both presets). */}
                {deck.payloadType === "cards" && deck.filter !== NORMAL_BALANCE_DRILL_FILTER && /\bch(?:apter)?\.?\s*\d+/i.test(deck.name) && !/·\s*Check\s*$/i.test(deck.name) && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>effect cards</span>
                    <button className="flex-1 rounded px-1 py-0.5 text-[9px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} title={`Generate one A=L+E effect card per placed scenario in ${deck.name}`} onClick={() => generateEffectCards(deck, "ale")}>A = L + E</button>
                    <button className="flex-1 rounded px-1 py-0.5 text-[9px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title={`Generate one Revenues/Expenses effect card per placed scenario in ${deck.name}`} onClick={() => generateEffectCards(deck, "re")}>Rev / Exp</button>
                  </div>
                )}
                {/* ITEM 4d — the add-selection action NAMES its target deck */}
                <button
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-0.5 text-[9.5px] font-semibold"
                  style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}
                  title={`Add the canvas selection to “${deck.name}”`}
                  onClick={() => addSelection(deck)}
                >
                  <Plus className="h-2.5 w-2.5" /> Add selected to “{deck.name}”
                </button>
              </div>
            );
          })}
          <div className="flex gap-1">
            <button className="flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => create("cards")}>
              <Plus className="h-3 w-3" /> card deck
            </button>
            <button className="flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.pinkSoft, border: `1px dashed ${NEON.borderSoft}` }} onClick={() => create("memos")}>
              <Plus className="h-3 w-3" /> memo deck
            </button>
          </div>
          {/* SEED START HERE (item 5) — one click stamps the whole authoring roadmap */}
          <button
            className="flex w-full items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide"
            style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }}
            title="Create the empty Start Here decks (11 chapters × teaching + Check, Ch 3 normal-balance drill, 4 memo decks) and attach them to their lessons"
            onClick={seedStartHere}
          >
            <ListChecks className="h-3 w-3" /> seed Start Here decks
          </button>
        </div>
      )}

      {/* CEQ SETS (Lee) — un-nested from Named Decks so it's ALWAYS visible (the main
          flow for building cram videos). Named Decks collapses independently above. */}
      <div className="mt-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>
          <ListChecks className="h-3 w-3" /> CEQ sets <span style={{ color: NEON.muted }}>({ceqSets.length})</span>
        </div>
            {ceqSets.map((set) => {
              const inc = set.accounts.filter((a) => a.include).length;
              const open2 = expandedSet === set.id;
              // DEAL-STATE FEEDBACK (Lee): show which mode THIS set is dealt in for the
              // frame you're in, so the grid/stack buttons read as on/off, not silent.
              const fid = nav.currentFrameId;
              const dealtHere = !!fid && nodes.some((n) => (n.data as { deckId?: string }).deckId === `${set.id}::${fid}`);
              const stackMode = !!(nodes.find((n) => n.id === fid)?.data as { stackDeal?: boolean } | undefined)?.stackDeal;
              const gridActive = dealtHere && !stackMode;
              const stackActive = dealtHere && stackMode;
              const dealBtn = (active: boolean): React.CSSProperties => active
                ? { color: "#0B1322", background: NEON.yellow, borderRadius: 4 }
                : { color: NEON.cyan };
              return (
                <div key={set.id} className="mt-1 rounded-md px-1.5 py-1" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}>
                  <div className="flex items-center gap-1">
                    <button className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold" style={{ color: NEON.text }} onClick={() => setExpandedSet(open2 ? null : set.id)} title="Expand to include/exclude accounts, set difficulty + correct answer">
                      {set.name} <span style={{ color: NEON.muted }}>· {inc} in{set.deckId ? " · ✓ deck" : ""}</span>
                    </button>
                    {/* ORGANIZE (Lee) — open the wide previewer to see full stems + choices,
                        reorder into deal order, and (soon) attach memos. */}
                    <button title="Organize this set — full question preview (stem + choices), reorder into the exact deal order, total count." onClick={() => setPreviewSet(set.id)} style={{ color: NEON.yellow }}><ListOrdered className="h-3 w-3" /></button>
                    {/* DEAL INTO THE FRAME YOU'RE IN (Lee) — repeatable across frames: grid in
                        a teaser, stack in a cram. Each is its own copy. */}
                    <button title={gridActive ? "Grid-dealt into THIS frame (click to re-deal). Fills the grid with every card, visible (teaser)." : "Grid-deal into the frame you're in — fills its grid with every card, visible (teaser). Repeatable per frame."} onClick={() => dealSetIntoFrame(set, "grid")} className="grid h-4 w-4 place-items-center" style={dealBtn(gridActive)}><Grid3x3 className="h-3 w-3" /></button>
                    <button title={stackActive ? "Stack-dealt into THIS frame (click to re-deal). Stacked at centre; Space flips one at a time (cram)." : "Stack-deal into the frame you're in — stacked at centre, top card visible, Space flips one at a time (cram). Repeatable per frame."} onClick={() => dealSetIntoFrame(set, "stack")} className="grid h-4 w-4 place-items-center" style={dealBtn(stackActive)}><SquareStack className="h-3 w-3" /></button>
                    <button title="Delete this set (keeps any approved deck)" onClick={() => removeSet(set.id)} style={{ color: NEON.muted }}><Trash2 className="h-3 w-3" /></button>
                  </div>
                  {open2 && (
                    <div className="mt-1">
                      <div className="max-h-48 space-y-0.5 overflow-y-auto pr-0.5 nowheel">
                        {set.accounts.map((a) => {
                          const ans = correctFor(a);
                          return (
                            <div key={a.accountId} className="flex items-center gap-1 text-[10px]" style={{ opacity: a.include ? 1 : 0.4 }}>
                              <input type="checkbox" checked={a.include} onChange={(e) => patchAccount(set.id, a.accountId, { include: e.target.checked })} style={{ accentColor: "#FCA311" }} />
                              <span className="min-w-0 flex-1 truncate" style={{ color: NEON.text }} title={a.offCoa ? "added for teaching (not in the course COA)" : a.accountType}>{a.name}{a.offCoa ? " *" : ""}</span>
                              <button className="rounded px-1 text-[8px] font-bold uppercase" style={{ color: a.difficulty === "hard" ? "#FF8B9E" : a.difficulty === "medium" ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title="Cycle difficulty (easy → medium → hard)" onClick={() => patchAccount(set.id, a.accountId, { difficulty: cycleDifficulty(a.difficulty) })}>{a.difficulty[0]}</button>
                              <select value={a.correctOverride ?? "auto"} onChange={(e) => patchAccount(set.id, a.accountId, { correctOverride: e.target.value === "auto" ? null : (e.target.value as CeqOption) })} className="rounded bg-black/40 text-[9px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Correct answer (auto = derived from account type)">
                                <option value="auto">{ans} (auto)</option>
                                {CEQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <select id={`ceq-lesson-${set.id}`} className="min-w-0 flex-1 rounded bg-black/40 text-[9px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} defaultValue={nav.currentFrameId ? (rf.getNode(nav.currentFrameId)?.parentId ?? "") : ""}>
                          <option value="">no lesson</option>
                          {lessonOpts.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                        <button className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: "#0B0F1E", background: NEON.yellow }} title="Generate one card per included account (film order) into a named deck, ready to deal + skeleton-grid" onClick={() => { const el = document.getElementById(`ceq-lesson-${set.id}`) as HTMLSelectElement | null; approveSet(set, el?.value || null); }}>
                          {set.deckId ? "re-approve" : "approve as deck"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="mt-1 flex w-full items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: NEON.cyan, border: `1px dashed ${NEON.borderSoft}` }} title="Create the What-type-of-account set from the scene course COA (difficulty ramp preset; COGS auto-added)" onClick={newAccountTypeSet}>
              <Plus className="h-3 w-3" /> new: what type of account?
            </button>
        </div>
        {seedNote && <div className="px-0.5 text-[9px] leading-snug" style={{ color: NEON.muted }}>{seedNote}</div>}
      {/* CEQ SET PREVIEWER (Lee) — portaled to body so the center modal isn't
          clipped by the deck panel's aside. */}
      {(() => { const s = previewSet ? ceqSets.find((x) => x.id === previewSet) : null; return s ? createPortal(<CeqSetPreviewer set={s} setCeqSets={setCeqSets} onClose={() => setPreviewSet(null)} />, document.body) : null; })()}
    </div>
  );
}

function DeckMini({ children, onClick, title, active, danger }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded"
      style={{ color: danger ? NEON.red : active ? NEON.yellow : NEON.muted, border: `1px solid ${active ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }}
    >
      {children}
    </button>
  );
}
