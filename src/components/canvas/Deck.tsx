// The DECK — a run-of-show ROSTER, not a black hole. MEMBERSHIP (deckMember)
// is separate from PRESENCE (dealt on canvas vs tucked away): a card can sit
// on the canvas and still be part of the deck. LESSON-SCOPED (PROMPT C): the
// roster groups by each entry's lesson (deckLessonId) in teaching path order,
// Loose last — collapsible, counted, per-group reset, drag entries BETWEEN
// groups to re-home them, and "Import from lessons…" clones prior lessons'
// entries into a group (the Wrap-up move; JEs arrive as practice copies).
// Rows: clicking a tucked row deals it, a dealt row focuses it; the row ×
// removes MEMBERSHIP only. Pure ordering/grouping logic lives in deck-logic.
import { useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronRight, Download, ExternalLink, EyeOff, Hand, Layers3, ListFilter, RotateCcw, Shuffle, Trash2, X } from "lucide-react";

import { addNodesCmd, bus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { useFrameNav } from "./FrameNavContext";
import { nextStageOrder } from "./BaseCard";
import { CardPopover } from "./CardPopover";
import { deckMembers, isMember, isTucked, lessonGroups, lessonIdOf, nextTucked, categoryOf, type DeckNode } from "./deck-logic";
import { blankFrom, JE_PRESETS } from "./je-logic";
import { CARD_KIND_LABEL } from "./templates";
import { NEON } from "./theme";
import { cardId, isContainerType, isElementKind, type CardBase, type CardData, type DeckDef, type JeCard, type JeLine } from "./types";
import { type CeqSetDef } from "./ceq-set";
import { DeckManager } from "./DeckManager";

// re-exports: the route and older imports keep working
export { categoryOf, deckMembers, isTucked, nextTucked };

const KIND_DOT: Record<string, string> = {
  je: NEON.pink,
  schedule: NEON.yellow,
  computation: NEON.yellow,
  taccount: NEON.cyan,
  ceq: NEON.pink,
  memorize: NEON.cyan,
  note: NEON.pinkSoft,
  video: NEON.pinkSoft,
  list: NEON.green,
  image: NEON.cyan,
  legend: NEON.yellow,
  formula: NEON.yellow,
  heading: NEON.cyan,
};

/** IMPORT DECKS (PROMPT C item 2 — the Wrap-up move): clone the source
 *  lessons' deck entries into `targetLessonId`'s deck. JEs arrive as PRACTICE
 *  copies (blank attempt, answer key carried); other kinds plain clones.
 *  Everything lands tucked, parented to the target lesson, appended in order —
 *  ONE undoable command. */
export function importLessonDecks(rf: RfLike & { getNodes: () => DeckNode[] }, targetLessonId: string, sourceLessonIds: (string | null)[]): number {
  const nodes = rf.getNodes();
  const groups = lessonGroups(nodes);
  const sources = groups.filter((g) => sourceLessonIds.includes(g.lessonId) && g.lessonId !== targetLessonId);
  const entries = sources.flatMap((g) => g.members);
  if (entries.length === 0) return 0;
  let order = nextStageOrder(nodes as never);
  const clones = entries.map((src, i) => {
    const d = structuredClone(src.data) as Record<string, unknown>;
    if (d.kind === "je") {
      const je = d as unknown as JeCard;
      const key = (je.solution?.length ? je.solution : je.lines) as JeLine[];
      je.mode = "practice";
      je.settings = { ...JE_PRESETS.practice };
      je.reviewLock = false;
      je.helpOpen = false;
      je.revealUsed = false;
      je.solution = structuredClone(key);
      je.lines = blankFrom(key, () => cardId("l"));
    }
    const pos = { x: 24 + (i % 4) * 14, y: 48 + i * 12 };
    d.deckMember = true;
    d.tucked = true;
    d.deckLessonId = targetLessonId;
    d.stageOrder = order++;
    d.deckPos = pos;
    d.faceDown = false;
    return {
      id: cardId((d.kind as string) ?? "card"),
      type: src.type,
      parentId: targetLessonId,
      position: pos,
      selected: false,
      data: d,
    };
  });
  bus.dispatch(addNodesCmd(rf, clones as never[], `import ${clones.length} deck entries`));
  return clones.length;
}

export function Deck({
  open,
  onClose,
  onPopOut,
  inPopout,
  onDeal,
  onFocus,
  onRemoveMembership,
  dealFaceDown,
  setDealFaceDown,
  hideFdLabels,
  setHideFdLabels,
  decks,
  setDecks,
  ceqSets,
  setCeqSets,
}: {
  /** Toolbar-controlled: the panel shows only when open (no top-right badge). */
  open: boolean;
  onClose: () => void;
  onPopOut?: () => void;
  inPopout?: boolean;
  onDeal: (id: string) => void;
  onFocus: (id: string) => void;
  onRemoveMembership: (id: string) => void;
  dealFaceDown: boolean;
  setDealFaceDown: (v: boolean) => void;
  hideFdLabels: boolean;
  setHideFdLabels: (v: boolean) => void;
  decks: DeckDef[];
  setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void;
  ceqSets: CeqSetDef[];
  setCeqSets: (fn: (prev: CeqSetDef[]) => CeqSetDef[]) => void;
}) {
  const rf = useReactFlow();
  const nodes = useNodes();
  const nav = useFrameNav();
  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [importFor, setImportFor] = useState<{ lessonId: string; anchor: HTMLElement } | null>(null);
  const [importPick, setImportPick] = useState<Set<string>>(new Set());
  // ONE LESSON AT A TIME (Lee) — default to just the lesson you're in; toggle to
  // see the whole roster. The current lesson is the frame you're inside.
  const [lessonOnly, setLessonOnly] = useState(true);
  const currentLessonId = (nav.currentFrameId ? (nodes.find((n) => n.id === nav.currentFrameId)?.parentId ?? null) : null) as string | null;
  const scopeLesson = lessonOnly ? currentLessonId : null; // null ⇒ show all

  const members = deckMembers(nodes as never);
  const allGroups = lessonGroups(nodes as never);
  // Filter to the current lesson's group (keep Loose visible so uncategorized
  // cards never vanish); when not inside a frame, show everything.
  const groups = scopeLesson ? allGroups.filter((g) => g.lessonId === scopeLesson || g.lessonId === null) : allGroups;
  const tuckedCount = members.filter((n) => isTucked(n.data as unknown as CardBase)).length;

  /** Re-home a dragged entry into another group (drop on its header/body). */
  const moveToGroup = (lessonId: string | null) => {
    if (!dragId) return;
    const c = patchDataCmd(rf as unknown as RfLike, dragId, { deckLessonId: lessonId, stageOrder: nextStageOrder(rf.getNodes()) }, "move deck entry");
    if (c) bus.dispatch(c);
    setDragId(null);
  };

  /** Per-group RESET: tuck that group's dealt members only. */
  const resetGroup = (lessonId: string | null) => {
    const g = lessonGroups(rf.getNodes() as never).find((x) => x.lessonId === lessonId);
    if (!g) return;
    const c = compositeCmd(
      g.members
        .filter((n) => !isTucked(n.data as unknown as CardBase))
        .map((n) => {
          const live = rf.getNode(n.id);
          return patchDataCmd(
            rf as unknown as RfLike,
            n.id,
            {
              deckMember: true,
              tucked: true,
              staged: undefined,
              minimized: undefined,
              deckPos: live ? { x: live.position.x, y: live.position.y } : undefined,
              deckCategory: categoryOf(n.data as unknown as CardData),
            },
            "reset",
          );
        }),
      `reset ${g.label} deck`,
    );
    if (c) bus.dispatch(c);
  };

  const dealNext = () => {
    const next = nextTucked(rf.getNodes() as never);
    if (next) onDeal(next.id);
  };

  const shuffle = () => {
    if (members.length < 2) return;
    const ids = members.map((m) => m.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const c = compositeCmd(
      ids.map((id, idx) => patchDataCmd(rf as unknown as RfLike, id, { stageOrder: idx }, "shuffle")),
      "shuffle deck",
    );
    if (c) bus.dispatch(c);
  };

  /** RESET: tuck every MEMBER (remember spots); loose cards untouched. */
  const reset = () => {
    const c = compositeCmd(
      rf
        .getNodes()
        .filter((n) => !isContainerType(n.type) && isMember(n.data as unknown as CardBase) && !isTucked(n.data as unknown as CardBase))
        .map((n) =>
          patchDataCmd(
            rf as unknown as RfLike,
            n.id,
            {
              deckMember: true,
              tucked: true,
              staged: undefined,
              minimized: undefined,
              deckPos: { x: n.position.x, y: n.position.y },
              deckCategory: categoryOf(n.data as unknown as CardData),
            },
            "reset",
          ),
        ),
      "reset deck",
    );
    if (c) bus.dispatch(c);
  };

  /** DELETE LOOSE (Lee): remove every LOOSE deck-member card — a deck member with
   *  no lesson home (the "Loose" roster group), i.e. test-deal debris — and drop any
   *  named deck left with zero members. Confirmed + ONE undo restores everything. */
  const deleteLoose = () => {
    const all = rf.getNodes();
    const loose = all.filter((n) => !isContainerType(n.type) && isMember(n.data as unknown as CardBase) && lessonIdOf(n as unknown as DeckNode, all as unknown as DeckNode[]) == null);
    if (loose.length === 0) { window.alert("No loose cards to delete."); return; }
    if (!window.confirm(`Delete ${loose.length} loose card${loose.length === 1 ? "" : "s"} (and any deck left empty)?\n\nThis clears test-deal debris. One undo (Ctrl+Z) restores everything.`)) return;
    const ids = new Set(loose.map((n) => n.id));
    const snap = loose.map((n) => structuredClone(n));
    const keptDeckIds = new Set(all.filter((n) => !ids.has(n.id)).map((n) => (n.data as { deckId?: string }).deckId).filter(Boolean));
    const prevDecks = decks;
    bus.dispatch({
      label: `delete ${loose.length} loose cards`,
      do: () => { rf.setNodes((nds) => nds.filter((n) => !ids.has(n.id))); setDecks((p) => p.filter((dk) => keptDeckIds.has(dk.id))); },
      undo: () => { rf.setNodes((nds) => [...nds, ...snap.map((n) => structuredClone(n))]); setDecks(() => prevDecks); },
    });
  };

  /** Drop dragId in front of targetId (or at the end when targetId is null). */
  const reorder = (targetId: string | null) => {
    if (!dragId || dragId === targetId) return;
    const ids = members.map((s) => s.id).filter((x) => x !== dragId);
    const at = targetId ? ids.indexOf(targetId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    const c = compositeCmd(
      ids.map((nid, idx) => patchDataCmd(rf as unknown as RfLike, nid, { stageOrder: idx }, "reorder")),
      "reorder deck",
    );
    if (c) bus.dispatch(c);
    setDragId(null);
  };

  if (!open) return null;

  return (
    <aside
      className={inPopout ? "flex h-full w-full flex-col" : "absolute bottom-16 right-3 z-40 flex max-h-[84vh] w-80 flex-col rounded-xl"}
      style={inPopout ? { background: NEON.bg, color: NEON.text } : { background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => reorder(null)}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <Layers3 className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>
          Deck <span style={{ color: NEON.muted }}>({tuckedCount}/{members.length})</span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setLessonOnly((v) => !v)}
            title={lessonOnly ? "Showing this lesson only — click to show every lesson" : "Showing every lesson — click to show just the lesson you're in"}
            style={{ color: lessonOnly ? NEON.yellow : NEON.muted }}
          >
            <ListFilter className="h-3.5 w-3.5" />
          </button>
          {onPopOut && !inPopout && <button onClick={onPopOut} title="Pop out to a second window (off-stage for OBS)" style={{ color: NEON.muted }}><ExternalLink className="h-3.5 w-3.5" /></button>}
          {!inPopout && <button onClick={onClose} title="Close deck" style={{ color: NEON.muted }}><X className="h-3.5 w-3.5" /></button>}
        </span>
      </div>

      {/* actions */}
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <DeckBtn title="Deal the next tucked card (space)" onClick={dealNext} disabled={tuckedCount === 0}>
          <Hand className="h-3 w-3" /> deal
        </DeckBtn>
        <DeckBtn title="Randomize deal order" onClick={shuffle} disabled={members.length < 2}>
          <Shuffle className="h-3 w-3" /> shuffle
        </DeckBtn>
        <DeckBtn title="Tuck every deck member (loose cards stay put)" onClick={reset}>
          <RotateCcw className="h-3 w-3" /> reset
        </DeckBtn>
        <DeckBtn title="Delete all LOOSE cards (deck members with no lesson) + any deck left empty — clears test-deal debris. One undo restores." onClick={deleteLoose}>
          <Trash2 className="h-3 w-3" /> delete loose
        </DeckBtn>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <label className="flex cursor-pointer items-center gap-1 text-[9.5px]" style={{ color: dealFaceDown ? NEON.yellow : NEON.muted }}>
          <input type="checkbox" checked={dealFaceDown} onChange={(e) => setDealFaceDown(e.target.checked)} style={{ accentColor: "#FCA311" }} />
          deal face down
        </label>
        {dealFaceDown && (
          <label className="flex cursor-pointer items-center gap-1 text-[9.5px]" style={{ color: hideFdLabels ? NEON.yellow : NEON.muted }} title='Quiz mode: banners show "???"'>
            <input type="checkbox" checked={hideFdLabels} onChange={(e) => setHideFdLabels(e.target.checked)} style={{ accentColor: "#FCA311" }} />
            <EyeOff className="h-2.5 w-2.5" /> hide labels
          </label>
        )}
      </div>

      {/* NAMED DECKS (P3) — first-class deck objects, above the lesson roster */}
      <DeckManager decks={decks} setDecks={setDecks} ceqSets={ceqSets} setCeqSets={setCeqSets} lessonScope={scopeLesson} />

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {members.length === 0 && (
          <p className="px-1 py-2 text-[10.5px] italic leading-relaxed" style={{ color: NEON.muted }}>
            Empty. “+” on any card adds it to the deck (it stays put); the tuck button or “s” hides it here. Spacebar deals tucked cards back in order.
          </p>
        )}
        {/* LESSON GROUPS (PROMPT C): path order, Loose last; collapsible; drag
            rows between groups; per-group reset; per-group import. */}
        {groups.map((g) => {
          const gkey = g.lessonId ?? "__loose__";
          const isGroupCollapsed = collapsedGroups.has(gkey);
          const gTucked = g.members.filter((n) => isTucked(n.data as unknown as CardBase)).length;
          return (
            <div
              key={gkey}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.stopPropagation(); moveToGroup(g.lessonId); }}
            >
              <div className="flex items-center gap-1 px-0.5">
                <button
                  className="flex min-w-0 flex-1 items-center gap-1 text-left text-[9.5px] font-bold uppercase tracking-wider"
                  style={{ color: g.lessonId ? NEON.yellow : NEON.muted }}
                  onClick={() => setCollapsedGroups((p) => { const n = new Set(p); if (n.has(gkey)) n.delete(gkey); else n.add(gkey); return n; })}
                >
                  {isGroupCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{g.label}</span>
                  <span style={{ color: NEON.muted }}>({gTucked}/{g.members.length})</span>
                </button>
                {g.lessonId && (
                  <button
                    className="shrink-0"
                    style={{ color: importFor?.lessonId === g.lessonId ? NEON.yellow : NEON.muted }}
                    title="Import from lessons… (clone prior lessons' deck entries here; JEs arrive as practice copies)"
                    onClick={(e) => { setImportPick(new Set()); setImportFor(importFor?.lessonId === g.lessonId ? null : { lessonId: g.lessonId!, anchor: e.currentTarget }); }}
                  >
                    <Download className="h-3 w-3" />
                  </button>
                )}
                <button
                  className="shrink-0"
                  style={{ color: NEON.muted }}
                  title={`Reset ${g.label} — tuck its dealt members`}
                  onClick={() => resetGroup(g.lessonId)}
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
              {importFor?.lessonId === g.lessonId && (
                <CardPopover anchor={importFor.anchor} align="right" onClose={() => setImportFor(null)}>
                  <div
                    className="nodrag w-56 rounded-lg p-2 shadow-xl"
                    style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>
                      Import decks into {g.label}
                    </div>
                    {groups.filter((s) => s.lessonId !== g.lessonId && s.members.length > 0).map((s) => {
                      const skey = s.lessonId ?? "__loose__";
                      return (
                        <label key={skey} className="flex cursor-pointer items-center gap-1.5 py--0.5 text-[10.5px]" style={{ color: NEON.text }}>
                          <input
                            type="checkbox"
                            checked={importPick.has(skey)}
                            onChange={(e) => setImportPick((p) => { const n = new Set(p); if (e.target.checked) n.add(skey); else n.delete(skey); return n; })}
                            style={{ accentColor: "#FCA311" }}
                          />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          <span style={{ color: NEON.muted }}>({s.members.length})</span>
                        </label>
                      );
                    })}
                    {groups.filter((s) => s.lessonId !== g.lessonId && s.members.length > 0).length === 0 && (
                      <p className="py-1 text-[10px] italic" style={{ color: NEON.muted }}>No other lessons have deck entries yet.</p>
                    )}
                    <button
                      className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide disabled:opacity-40"
                      style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
                      disabled={importPick.size === 0}
                      title="Clones arrive tucked; JEs as blank practice copies with the answer key carried. One undo step."
                      onClick={() => {
                        const src = [...importPick].map((k) => (k === "__loose__" ? null : k));
                        importLessonDecks(rf as never, g.lessonId!, src);
                        setImportFor(null);
                      }}
                    >
                      import
                    </button>
                  </div>
                </CardPopover>
              )}
              {!isGroupCollapsed && (
                <div className="mt-0.5 space-y-1">
                  {g.members.map((n) => {
                    const d = n.data as unknown as CardData;
                    const tucked = isTucked(d as CardBase);
                    const globalIdx = members.findIndex((m) => m.id === n.id);
                    return (
                      <div
                        key={n.id}
                        draggable
                        onDragStart={() => setDragId(n.id)}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.stopPropagation(); reorder(n.id); }}
                        className="group/row flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors"
                        style={{ border: `1px solid ${dragId === n.id ? NEON.yellow : NEON.borderSoft}`, background: "rgba(0,0,0,0.25)" }}
                        onClick={() => (tucked ? onDeal(n.id) : onFocus(n.id))}
                        title={tucked ? "Deal to the canvas" : "On canvas — click to focus"}
                      >
                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8.5px] font-bold" style={{ border: `1px solid ${NEON.yellow}`, color: NEON.yellow }}>
                          {globalIdx + 1}
                        </span>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_DOT[d.kind] ?? NEON.pink }} />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium" style={{ opacity: tucked ? 0.75 : 1 }}>
                          {d.title || (d.kind === "je" && (d as { caption?: string }).caption) || CARD_KIND_LABEL[d.kind] || d.kind}
                        </span>
                        {/* presence indicator: tucked = filled gold, dealt = hollow green */}
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          title={tucked ? "tucked in the deck" : "dealt on canvas"}
                          style={tucked ? { background: NEON.yellow } : { border: `1.5px solid ${NEON.green}` }}
                        />
                        <button
                          className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100"
                          style={{ color: NEON.red }}
                          title="Remove from deck (card stays on canvas)"
                          onClick={(e) => { e.stopPropagation(); onRemoveMembership(n.id); }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function DeckBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[9.5px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
      style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "rgba(252,163,17,0.6)"; }}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = NEON.borderSoft)}
    >
      {children}
    </button>
  );
}
