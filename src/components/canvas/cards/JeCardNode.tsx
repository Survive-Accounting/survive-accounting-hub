// JE card v3 — TETRIS. No card rectangle: the entry is a CLUSTER of per-line
// blocks on the whiteboard. Debit blocks sit flush left, credit blocks offset
// right by the scene-wide jeIndent; every block is the same fixed width
// (jeCardWidth − jeIndent), so identical DR/CR patterns read as identical
// silhouettes. The transaction description floats above in marker font with a
// JE/ADJ/CL corner badge; chrome (deck/clone/gear/×) appears only on hover or
// selection; memos float to the RIGHT of their block with a leader line.
// Everything mutates through the command bus; popovers ride CardPopover.
import { useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { ArrowUpRight, Calculator, CalendarDays, ChevronDown, CircleHelp, CircleX, Copy, FlipVertical2, Lightbulb, Lock, LockOpen, Plus, Repeat, Settings2, Undo2, X } from "lucide-react";

import { CardScaleHandle, useCardActions, useCardScale } from "../BaseCard";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { lineHandleId, memoHandleId } from "../arrows";
import { addNodesCmd, bus, type RfLike } from "../commands";
import { CardPopover } from "../CardPopover";
import { attachMemo } from "../MemoLightbulb";
import { DeckChip, useDecks } from "../DecksContext";
import { PrincipleTagPicker } from "../PrincipleTagPicker";
import { ConnectionDots } from "../ConnectionDots";
import { useCanvasSettings } from "../CanvasSettingsContext";
import type { LibraryItem } from "../library";
import { CoaPicker } from "./CoaPicker";
import { JeScenarioPicker } from "./JeScenarioPicker";
import { SaveToLibraryDialog } from "./SaveToLibraryDialog";
import { EditableNumber, fmtNum, useEditSignal } from "../ui";
import { JE_FONT, NEON, PAPER } from "../theme";
import {
  JE_PRESETS,
  amountOf,
  autoBalance,
  balanceState,
  blankFrom,
  calcRows,
  effectiveMode,
  effectiveSettings,
  ensureMinLines,
  fmtJeDate,
  flipSides,
  hasAttempt,
  insertLine,
  jeTabTarget,
  memoKindOf,
  memoLeaderGeom,
  memoOf,
  memosOf,
  orderLines,
  patchMemo,
  placeLine,
  sideOf,
  swapLines,
  textMemoOf,
  upsertMemo,
  type JePreset,
  type JeSide,
} from "../je-logic";
import { cardId, type CardBase, type JeCard, type JeLine, type JeMemo, type MemoKind } from "../types";

const ENTRY_TYPES = ["standard", "adjusting", "closing"] as const;
const BADGE: Record<(typeof ENTRY_TYPES)[number], string> = { standard: "JE", adjusting: "ADJ", closing: "CL" };

/** Effective line honoring a flipped trap (trap amounts may cross columns). */
function eff(l: JeLine): JeLine {
  if (!l.flipped || !l.trap) return l;
  const dr = l.trap.dr !== undefined ? l.trap.dr : l.dr;
  const cr = l.trap.cr !== undefined ? l.trap.cr : l.cr;
  return { ...l, account: l.trap.account ?? l.account, dr, cr, side: l.trap.dr !== undefined || l.trap.cr !== undefined ? undefined : l.side };
}

// SELECTION = a quiet mode shift, not a loud border (visual-polish run). The
// active-tool color is a cool platinum SILVER (never amber — amber is reserved
// for empty/fillable slots so "what still needs doing" is scannable at a
// glance). A single ~420ms breath plays once when the cluster is selected to
// draw the eye to the fillable slots, then everything fades to calm scenery.
const SILVER = "#AEB9C9"; // selection silhouette + line focus
const SILVER_SHEEN = "rgba(174,185,201,0.8)"; // soft ambient glow on the cluster

const SOCKET_PULSE_CSS = `
@keyframes je-socket-pulse { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
@keyframes je-fill-pulse {
  0% { box-shadow: 0 0 0 0 rgba(252,163,17,0); }
  40% { box-shadow: 0 0 0 3px rgba(252,163,17,0.22); }
  100% { box-shadow: 0 0 0 0 rgba(252,163,17,0); }
}
.je-fill-pulse { animation: je-fill-pulse 420ms ease-out 1; }
`;

/** Uniform row height — the polyomino contract: every block is one tetris cell. */
const BLOCK_H = 36;

/** Gutter (px) past the cluster's content-right edge where the per-block control
 *  rail lands (J1) — beyond the connection dots (cluster right dot ≈ +12), so
 *  the lightbulb/calc/⊗ trio never overlaps a dot. */
const RAIL_GUTTER = 24;

/** RECENTS (#4): account names already used ANYWHERE in this scene, deduped —
 *  the current card's own accounts first (most relevant), then the rest, so the
 *  picker floats the scene's working set to the top. Scene-scoped snapshot,
 *  read when the picker opens. */
function sceneRecentAccounts(rf: ReturnType<typeof useReactFlow>, selfId: string): string[] {
  const nodes = rf.getNodes();
  const self = nodes.find((n) => n.id === selfId);
  const others = nodes.filter((n) => n.type === "je" && n.id !== selfId);
  const ordered = [self, ...others];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of ordered) {
    if (!n || (n.type !== "je" && n.id !== selfId)) continue;
    for (const ln of ((n.data as unknown as JeCard).lines ?? [])) {
      const name = ln.account?.trim();
      if (name && !seen.has(name)) { seen.add(name); out.push(name); }
    }
  }
  return out.slice(0, 8);
}

export function JeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as JeCard;
  const rf = useReactFlow();
  const updateInternals = useUpdateNodeInternals();
  const { update, updateFn, remove, toFront, addToDeck, tuck } = useCardActions(id);
  const cardScale = useCardScale(id, d as unknown as CardBase);
  const sp = useSpotlight();
  const cardDim = useCardDim(id);
  // ITEM 4 — deck chip + flash when this JE's deck is clicked in the panel.
  const { highlightId: deckHighlightId } = useDecks();
  const deckFlash = !!d.deckId && deckHighlightId === d.deckId;
  const ctx = useCanvasSettings();
  const S = effectiveSettings(d.settings, ctx.jePreset);
  const mode = effectiveMode(d.mode, ctx.jePreset);

  const [flipFeedback, setFlipFeedback] = useState<string | null>(null);
  const [dragLine, setDragLine] = useState<string | null>(null);
  const [hotSocket, setHotSocket] = useState<string | null>(null); // "side-index" under the dragged block
  /** Live memo drag (visual only) — the drop dispatches ONE bus command.
   *  Keyed by line + memo KIND (a line can float a text AND a calc box). */
  const [memoDrag, setMemoDrag] = useState<{ id: string; kind: JeMemo["kind"]; startX: number; startY: number; from: { x: number; y: number }; pos: { x: number; y: number } } | null>(null);
  const [pickerFor, setPickerFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [gearAnchor, setGearAnchor] = useState<HTMLElement | null>(null);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null); // hover date picker (#7)
  const [descMenu, setDescMenu] = useState<HTMLElement | null>(null); // scenario picker (A12)
  // TAB AUTHORING (#2): which block/field the keyboard is driving. seq forces a
  // re-focus even when the target field id is unchanged.
  const [authoring, setAuthoring] = useState<{ lineId: string; which: "account" | "amount"; seq: number } | null>(null);
  const [titleEditing, setTitleEditing] = useState(false); // free-text description
  const [saveToLibOpen, setSaveToLibOpen] = useState(false); // author from canvas
  const selLine = (data as Record<string, unknown>)._selLine as string | undefined;
  // F2 GLOBAL EDIT (item 4): edit the selected LINE's account, else the description.
  useEditSignal((data as { _editSeq?: number })._editSeq, () => {
    if (d.reviewLock) return;
    const first = orderLines(d.lines)[0];
    const lid = selLine ?? first?.id;
    if (lid) setAuthoring({ lineId: lid, which: "account", seq: Date.now() });
    else setTitleEditing(true);
  });

  // A6: a stale _selLine outliving the card's selection made ←/→ move "the block
  // below the selected one" — clear it whenever the NODE deselects.
  useEffect(() => {
    if (!selected && selLine) rf.updateNodeData(id, { _selLine: undefined });
  }, [selected, selLine, rf, id]);

  // TAB AUTHORING (#2), Guided path: the account is a picker-button, not an
  // input, so when the keyboard lands focus on a Guided account we focus the
  // button AND pop its picker (type-to-search, pick → auto-advance to amount).
  // Practice + amount fields handle their own focus via openSeq. Cleared when
  // the card deselects so a stale directive can't re-pop the picker.
  useEffect(() => {
    if (!selected) { setAuthoring(null); return; }
    if (!authoring || authoring.which !== "account") return;
    if (!S.showPicker) return; // PRACTICE: the free-type input handles its own focus (openSeq)
    const raf = requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"] [data-je-acct="${authoring.lineId}"]`);
      if (btn) { btn.focus(); setPickerFor({ id: authoring.lineId, anchor: btn }); }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authoring, selected, id, S.showPicker]);

  const blockW = ctx.jeCardWidth - ctx.jeIndent;

  // DR/CR INVARIANT (#1): every mutation sees grouped input and writes grouped
  // output, so the flat lines array is ALWAYS [debits…, credits…] in entry
  // order — the render below can never draw an interleaved silhouette.
  // GUIDED AMOUNT ECHO (item 1): every line mutation flows through here, so this
  // is the one place to re-derive the balancing echo. autoBalance is pure +
  // idempotent (it strips prior echoes and recomputes from the hand-typed
  // amounts), so running it on ALL guided mutations keeps the opposite side
  // filled without ever clobbering a typed figure. PRACTICE never echoes.
  const setLines = (mk: (lines: JeLine[]) => JeLine[]) =>
    updateFn((prev) => {
      const next = orderLines(mk(orderLines((prev.lines as JeLine[]) ?? [])));
      return { lines: mode === "guided" && !locked ? autoBalance(next) : next };
    });
  const patchLine = (lid: string, patch: Partial<JeLine>) => setLines((lines) => lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  /** Commit an amount onto a line. A REAL change clears the echo flag (the figure
   *  becomes hand-typed, protected from re-derivation); tabbing THROUGH an
   *  unchanged echo cell keeps it derived so later lines still recompute it. */
  const commitAmount = (lineId: string, side: JeSide, v: number | null) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== lineId) return l;
        const echoNext = v === amountOf(l) ? l.echo : undefined;
        return side === "dr" ? { ...l, dr: v, cr: null, side, echo: echoNext } : { ...l, cr: v, dr: null, side, echo: echoNext };
      }),
    );
  const selectLine = (lid: string | null) => rf.updateNodeData(id, { _selLine: lid ?? undefined }); // transient

  // ONE canonical order for everything that renders or indexes by position
  // (rows, indents, memo geometry, drag sockets) — grouped, so a scene saved
  // with an older interleaved array still draws canonically before any edit.
  const lines = orderLines(d.lines);

  // MEMO HANDLES (J3): each open memo box exposes a source dot for growing RF
  // arrows to other cards. When a memo opens/closes/moves the handle set (or its
  // measured position) changes, so RF must re-measure this node's internals or
  // freshly-drawn cross-card arrows anchor to a stale spot.
  const memoSig = lines
    .map((l) => memosOf(l).filter((m) => m.open && m.text).map((m) => `${m.id}@${m.pos?.x ?? ""},${m.pos?.y ?? ""}`).join("|"))
    .join(";");
  useEffect(() => { updateInternals(id); }, [memoSig, id, updateInternals]);
  const effLines = lines.map(eff);
  const bal = balanceState(effLines);

  // TAB = WALK-AND-WRAP (JT1): Tab moves to the NEXT EXISTING field in canonical
  // order (debits top→bottom account→amount, then credits, WRAP to the first
  // debit's account). Shift+Tab walks it backwards, wrapping. NEVER spawns — the
  // never-zero invariant guarantees 1 DR + 1 CR, so the common flow is
  // DR-acct → DR-amt → CR-acct → CR-amt (echo) → done, no clicks. Adding a block
  // is EXPLICIT (Enter, see addBlockBelow). Commits an amount atomically first
  // so the walk sees the pending value (undefined = account field, no commit).
  const advanceField = (lineId: string, which: "account" | "amount", back: boolean, commitVal?: number | null) => {
    if (locked) return;
    const applyAmt = (ls: JeLine[]): JeLine[] =>
      commitVal === undefined ? ls : ls.map((l) => {
        if (l.id !== lineId) return l;
        const s = sideOf(l);
        const echoNext = commitVal === amountOf(l) ? l.echo : undefined; // tab-through keeps echo; a real edit is hand-typed
        return s === "dr" ? { ...l, dr: commitVal, cr: null, side: s, echo: echoNext } : { ...l, cr: commitVal, dr: null, side: s, echo: echoNext };
      });
    if (commitVal !== undefined) setLines(applyAmt);
    const L = applyAmt(orderLines(d.lines)); // the walk sees the pending commit
    const target = jeTabTarget(L, lineId, which, back);
    if (target) setAuthoring({ lineId: target.lineId, which: target.which, seq: Date.now() });
  };

  /** ENTER = add a block on THIS side, directly below, focus its account (JT1).
   *  Commits a pending amount first so nothing is lost. */
  const addBlockBelow = (lineId: string, commitVal?: number | null) => {
    if (locked) return;
    const l = lines.find((x) => x.id === lineId);
    if (!l) return;
    const side = sideOf(l);
    const nid = cardId("l");
    setLines((ls) => {
      const committed = commitVal === undefined ? ls : ls.map((x) => {
        if (x.id !== lineId) return x;
        const s = sideOf(x);
        const echoNext = commitVal === amountOf(x) ? x.echo : undefined;
        return s === "dr" ? { ...x, dr: commitVal, cr: null, side: s, echo: echoNext } : { ...x, cr: commitVal, dr: null, side: s, echo: echoNext };
      });
      const i = committed.findIndex((x) => x.id === lineId);
      const nl: JeLine = { id: nid, account: "", dr: null, cr: null, side };
      return i < 0 ? insertLine(committed, side, nl) : [...committed.slice(0, i + 1), nl, ...committed.slice(i + 1)];
    });
    setAuthoring({ lineId: nid, which: "account", seq: Date.now() });
  };

  /** FLIP (JT4): swap every line's side (dr↔cr) — accounts, amounts, memos, ids
   *  preserved; the invariant re-sorts the shape. Undoable via the bus. Many JEs
   *  are the flip of another (reversing entries, "the other side"). */
  const flip = () => { if (!locked) updateFn((prev) => ({ lines: flipSides((prev.lines as JeLine[]) ?? []) })); };
  // THE POLYOMINO: array order IS render order; each row's indent follows its
  // EFFECTIVE side (traps can cross columns), so the silhouette shows the truth.
  const inds = effLines.map((l) => (sideOf(l) === "cr" ? ctx.jeIndent : 0));

  // LINE-LEVEL ARROWS (PROMPT A): each block carries ln:<lineId>:l|r handles.
  // React Flow caches handle positions per node — after a hop/reorder moves a
  // block, tell it to re-measure so anchored edges follow the block.
  const updateNodeInternals = useUpdateNodeInternals();
  const linesShape = lines.map((l, i) => `${l.id}:${inds[i]}`).join("|");
  useEffect(() => {
    updateNodeInternals(id);
  }, [linesShape, id, updateNodeInternals]);
  /** Gold ring on a block whose line is an endpoint of the clicked edge. */
  const glowLine = (data as Record<string, unknown>)._glowLine as string | undefined;

  // ---- REVIEW LOCK (A3): the answer-key state — review-only, no drag/edit ---
  const locked = !!d.reviewLock;
  const [cloneMenu, setCloneMenu] = useState<HTMLElement | null>(null);

  /** Clone lands directly UNDERNEATH the original (PROMPT A item 7 — column/
   *  shape comparison; replaced the old clone-to-the-right). asPractice = the
   *  student copy: blank silhouette + solution stamped + practice mode. */
  const cloneAs = (asPractice: boolean) => {
    const node = rf.getNode(id);
    if (!node) return;
    const src = structuredClone(node.data) as unknown as JeCard;
    const key = src.solution?.length ? src.solution : src.lines;
    const data = asPractice
      ? {
          ...src,
          mode: "practice" as const,
          settings: { ...JE_PRESETS.practice },
          reviewLock: false,
          helpOpen: false,
          revealUsed: false,
          solution: structuredClone(key),
          lines: blankFrom(key, () => cardId("l")),
        }
      : src;
    const below = { x: node.position.x, y: node.position.y + (node.measured?.height ?? d.lines.length * BLOCK_H + 80) + 24 };
    bus.dispatch(
      addNodesCmd(
        rf as unknown as RfLike,
        [{ ...node, id: cardId("je"), selected: false, position: below, data: data as unknown as Record<string, unknown> }],
        asPractice ? "clone as practice copy" : "duplicate card",
      ),
    );
    setCloneMenu(null);
  };

  // ---- SCENARIO PICKER (A12): adopt a library entry's description + answer key.
  // An untouched card also adopts the scenario's ghost silhouette; a card with
  // work on it keeps its lines (only caption/solution/bank update).
  const applyScenario = (it: LibraryItem) => {
    const made = it.make() as JeCard;
    updateFn((prev) => {
      const cur = (prev.lines as JeLine[]) ?? [];
      const patch: Record<string, unknown> = {
        caption: made.caption,
        title: made.title,
        solution: structuredClone(made.solution ?? made.lines),
        accountBank: [...new Set([...((prev.accountBank as string[]) ?? []), ...(made.accountBank ?? [])])],
      };
      if (!hasAttempt(cur)) patch.lines = blankFrom(made.lines, () => cardId("l"));
      return patch;
    });
    setDescMenu(null);
  };

  // ---- CARD-FLIP HELP (A2): the tetris-card back doing double duty ----------
  const flipHelp = () => update({ helpOpen: !d.helpOpen });
  /** Reveal the correct answer: the stored solution wins; else unhide everything.
   *  Marks revealUsed — in PRACTICE that's what surfaces the balance chip (V2). */
  const revealCorrect = () =>
    updateFn((prev) => {
      const sol = prev.solution as JeLine[] | undefined;
      if (sol?.length) return { lines: structuredClone(sol), helpOpen: false, revealUsed: true };
      return { lines: ((prev.lines as JeLine[]) ?? []).map((l) => ({ ...l, hidden: false, flipped: false })), helpOpen: false, revealUsed: true };
    });
  const switchToGuided = () => update({ mode: "guided", settings: { ...JE_PRESETS.guided }, helpOpen: false });
  /** First line's TEXT memo — the hint. Solution memos win (practice copies blank lines). */
  const hint = (d.solution ?? d.lines).map((l) => textMemoOf(l)).find(Boolean) ?? null;

  const addLine = (side: JeSide) =>
    setLines((lines) => insertLine(lines, side, { id: cardId("l"), account: "", dr: null, cr: null, side, label: "" }));

  /** Delete honors THE INVARIANT: a side never drops below one block — deleting
   *  the last block on a side re-spawns a blank socket there. */
  const deleteLine = (lid: string) =>
    setLines((lines) => ensureMinLines(lines.filter((x) => x.id !== lid), () => cardId("l")));

  /** Gap drop: place the dragged line at ARRAY gap `gap` on `side` — explicit
   *  placement; the gap index shifts down when the line came from above it. */
  const onDropGap = (side: JeSide, gap: number) => {
    if (!dragLine) return;
    setLines((lines) => {
      const orig = lines.findIndex((l) => l.id === dragLine);
      return placeLine(lines, dragLine, side, orig >= 0 && gap > orig ? gap - 1 : gap);
    });
    setDragLine(null);
    setHotSocket(null);
  };
  const onDropSwap = (targetId: string) => {
    if (!dragLine || dragLine === targetId) { setDragLine(null); return; }
    setLines((lines) => swapLines(lines, dragLine, targetId));
    setDragLine(null);
    setHotSocket(null);
  };

  // ---- MEMO ARROWS (V2 + PROMPT A): floating TEXT and CALC boxes, each with
  // its own pointer arrow, in rows-local node space -----------------------------
  /** Default spawn: right of the line's block; the calc box staggers below the
   *  text box so both open readable when a line carries the pair. */
  const defaultMemoPos = (i: number, kind: JeMemo["kind"]) =>
    ({ x: inds[i] + blockW + 22, y: i * BLOCK_H - 2 + (kind === "calc" ? 30 : 0) });
  const lineOf = (lid: string) => lines.find((l) => l.id === lid);
  const toggleMemo = (lid: string, kind: JeMemo["kind"]) => {
    const i = lines.findIndex((l) => l.id === lid);
    const l = lines[i];
    const m = l && memoOf(l, kind);
    if (!l || !m) return;
    patchLine(lid, patchMemo(l, kind, { open: !m.open, pos: m.pos ?? defaultMemoPos(i, kind) }));
  };
  /** Save a memo's full object (Phase 1: body + title + memoKind + category are
   *  all editable after creation). A fresh memo pops open right of its block. */
  const saveMemo = (lid: string, kind: JeMemo["kind"], payload: { text: string; title?: string; memoKind?: MemoKind; category?: string }) => {
    const i = lines.findIndex((l) => l.id === lid);
    const l = lines[i];
    if (!l) return;
    const hadIt = !!memoOf(l, kind);
    const extra: Partial<JeMemo> = {
      title: payload.title?.trim() || undefined,
      memoKind: payload.memoKind,
      category: payload.category?.trim() || undefined,
    };
    if (payload.text && !hadIt) { extra.open = true; extra.pos = defaultMemoPos(i, kind); }
    patchLine(lid, upsertMemo(l, kind, payload.text, extra));
  };
  const memoMoved = useRef(false); // suppress click-to-edit right after a drag
  const startMemoDrag = (e: React.PointerEvent, lid: string, kind: JeMemo["kind"], from: { x: number; y: number }) => {
    if (locked) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    memoMoved.current = false;
    setMemoDrag({ id: lid, kind, startX: e.clientX, startY: e.clientY, from, pos: from });
  };
  const moveMemoDrag = (e: React.PointerEvent) => {
    if (!memoDrag) return;
    if (Math.abs(e.clientX - memoDrag.startX) + Math.abs(e.clientY - memoDrag.startY) > 3) memoMoved.current = true;
    const zoom = rf.getZoom() || 1;
    setMemoDrag({ ...memoDrag, pos: { x: memoDrag.from.x + (e.clientX - memoDrag.startX) / zoom, y: memoDrag.from.y + (e.clientY - memoDrag.startY) / zoom } });
  };
  const endMemoDrag = () => {
    if (!memoDrag) return;
    const l = lineOf(memoDrag.id);
    if (l) patchLine(memoDrag.id, patchMemo(l, memoDrag.kind, { pos: { x: Math.round(memoDrag.pos.x), y: Math.round(memoDrag.pos.y) } })); // bus — undoable
    setMemoDrag(null);
  };

  /** Gap drop-socket while dragging a line: a slim row split into DR/CR halves —
   *  drop chooses BOTH the array position (the gap) and the side. */
  const gapSocket = (gap: number) => {
    if (!dragLine) return null;
    const zone = (side: JeSide) => {
      const key = `${side}-${gap}`;
      const hot = hotSocket === key;
      return (
        <div
          className="nodrag grid flex-1 place-items-center rounded border-2 border-dashed text-[9px] font-bold uppercase tracking-wide"
          style={{
            borderColor: hot ? NEON.yellow : "rgba(252,163,17,0.55)",
            color: hot ? NEON.yellow : "rgba(252,163,17,0.75)",
            background: hot ? "rgba(252,163,17,0.18)" : "rgba(252,163,17,0.06)",
          }}
          onDragOver={(e) => { e.preventDefault(); setHotSocket(key); }}
          onDragLeave={() => setHotSocket((h) => (h === key ? null : h))}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropGap(side, gap); }}
        >
          {side}
        </div>
      );
    };
    return (
      <div className="flex h-6 items-stretch gap-1 py-0.5" style={{ width: ctx.jeIndent + blockW, animation: "je-socket-pulse 1.1s ease-in-out infinite" }}>
        {zone("dr")}
        {zone("cr")}
      </div>
    );
  };

  /** One exposed-edge segment of the union outline. Per-row segments (left/right
   *  always, top/bottom only where the neighbor row doesn't cover) add up to ONE
   *  continuous outline around the polyomino — ghost rows draw theirs dashed. */
  const edgeSeg = (key: string, ghost: boolean, color: string, st: React.CSSProperties, vertical?: boolean) => (
    <span
      key={key}
      className="pointer-events-none absolute z-[3]"
      style={{
        ...(vertical
          ? { width: 0, borderLeft: `1.5px ${ghost ? "dashed" : "solid"} ${color}` }
          : { height: 0, borderTop: `1.5px ${ghost ? "dashed" : "solid"} ${color}` }),
        ...st,
      }}
    />
  );

  const row = (l: JeLine, i: number) => {
    const ind = inds[i];
    const side: JeSide = ind > 0 ? "cr" : "dr";
    const trapOn = !!l.flipped && !!l.trap;
    const amt = amountOf(eff(l));
    const isSel = selLine === l.id;
    const empty = !eff(l).account;
    // TAB AUTHORING (#2): does the keyboard currently drive THIS block's fields?
    const authAcct = authoring && authoring.lineId === l.id && authoring.which === "account" ? authoring.seq : undefined;
    const authAmt = authoring && authoring.lineId === l.id && authoring.which === "amount" ? authoring.seq : undefined;
    // AMOUNT ECHO (item 1): superseded the dim ghost suggestion — in GUIDED the
    // balancing figure is AUTO-COMMITTED into the sole open amount by autoBalance
    // (see setLines), so it's a real editable value, not a hint. `l.echo` marks a
    // cell the tool filled so it renders subtly (italic/muted) — still committed.
    const isEcho = !!l.echo && amt != null;
    // ACTIONABLE = an empty account slot the user can still fill (not locked).
    // Amber is reserved for exactly this — filled content never wears amber.
    const actionable = empty && !locked;
    const amtEmpty = amt == null && !locked;
    // GUIDED/PRACTICE: unfilled template lines render as dashed segments of the shape
    const socketStyle = empty && S.showGhosts;
    const prevInd = i === 0 ? null : inds[i - 1];
    const nextInd = i === inds.length - 1 ? null : inds[i + 1];
    const IND = ctx.jeIndent;
    // empty rows keep their amber ghost edge (fillable); FILLED rows go the
    // calm silver at rest, brighter platinum SILVER when the cluster is
    // selected — selection reads as a cool active-tool shift, not amber.
    const edgeColor = socketStyle ? "rgba(252,163,17,0.75)" : selected ? SILVER : PAPER.cardEdge;
    const edges = [
      edgeSeg("el", socketStyle, edgeColor, { left: 0, top: 0, bottom: 0 }, true),
      edgeSeg("er", socketStyle, edgeColor, { right: 0, top: 0, bottom: 0 }, true),
    ];
    if (prevInd === null) edges.push(edgeSeg("et", socketStyle, edgeColor, { left: 0, right: 0, top: 0 }));
    else if (prevInd !== ind)
      edges.push(
        ind > prevInd
          ? edgeSeg("et", socketStyle, edgeColor, { right: 0, width: IND, top: 0 })
          : edgeSeg("et", socketStyle, edgeColor, { left: 0, width: IND, top: 0 }),
      );
    if (nextInd === null) edges.push(edgeSeg("eb", socketStyle, edgeColor, { left: 0, right: 0, bottom: 0 }));
    else if (nextInd !== ind)
      edges.push(
        ind > nextInd
          ? edgeSeg("eb", socketStyle, edgeColor, { right: 0, width: IND, bottom: 0 })
          : edgeSeg("eb", socketStyle, edgeColor, { left: 0, width: IND, bottom: 0 }),
      );
    // gold ring: this line is an endpoint of the clicked arrow (PROMPT A)
    const isGlow = glowLine === l.id;
    const stp = spotTargetProps(sp, id, l.id);
    return (
      <div key={l.id} {...stp.props} className="je-row relative" style={{ ...spotStyle(stp.state), transformOrigin: "left center", marginLeft: ind, width: blockW, height: BLOCK_H, opacity: l.hidden ? 0.15 : stp.state === "dim" ? 0.85 : 1 }}>
        {edges}
        {/* LINE-LEVEL CONNECTION DOTS (PROMPT A): edges anchor to the LINE id,
            so they follow this block through hops/reorders and save/load. */}
        <Handle
          id={lineHandleId(l.id, "l")}
          type="source"
          position={Position.Left}
          className="conn-dot line-dot"
          style={{ left: -5, top: "50%", width: 8, height: 8, background: "#101B31", border: `2px solid ${NEON.yellow}`, borderRadius: 999 }}
        />
        <Handle
          id={lineHandleId(l.id, "r")}
          type="source"
          position={Position.Right}
          className="conn-dot line-dot"
          style={{ right: -5, top: "50%", width: 8, height: 8, background: "#101B31", border: `2px solid ${NEON.yellow}`, borderRadius: 999 }}
        />
        {/* the block — outer edge drags the CLUSTER (no nodrag); inner row is the HTML5 line-drag.
            Clicking ANYWHERE on the block (incl. the gap between account + amount)
            selects it (#5) — ←/→ then toggle THIS block's side. */}
        <div
          className={`group/block relative z-[1] h-full ${!locked ? "cursor-pointer" : ""}`}
          style={{
            // SELECTED BLOCK (#5): a CLEAR platinum highlight — bright inset ring
            // + soft outer halo + faint silver wash — distinct from the calm
            // at-rest edge and unmistakably "this block is selected".
            background: (isSel || isGlow) && !socketStyle ? "rgba(174,185,201,0.16)" : socketStyle ? "rgba(252,163,17,0.05)" : PAPER.card,
            boxShadow: trapOn
              ? "inset 0 0 0 2px rgba(194,24,50,0.5)"
              : isSel || isGlow
                // SELECTED block (#5) OR an arrow endpoint (#6) → the SAME clear
                // platinum highlight (silver, per spec — endpoints match block
                // selection). Bright inset ring + soft halo + faint wash.
                ? `inset 0 0 0 2px ${SILVER}, 0 0 0 2px rgba(174,185,201,0.55), 0 0 12px -1px ${SILVER_SHEEN}`
                : undefined,
          }}
          onClick={() => { if (!locked) selectLine(l.id); }}
          onDragOver={(e) => { if (dragLine && dragLine !== l.id) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropSwap(l.id); }}
        >
          <div
            className="nodrag flex h-full items-center gap-1 px-1.5"
            draggable={!locked}
            onDragStart={(e) => { if (locked) return; e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragLine(l.id); }}
            onDragEnd={() => { setDragLine(null); setHotSocket(null); }}
          >
            {locked && !empty && <Lock className="h-2.5 w-2.5 shrink-0" style={{ color: PAPER.inkFaint }} />}

            {/* ACCOUNT — FILLABILITY LANGUAGE (visual-polish run): an EMPTY,
                actionable slot is warm amber + DASHED ("fill me"); a FILLED
                account recedes to calm parchment with a faint solid edge. The
                amber affordance brightens while the cluster is selected and
                takes the one-shot fill-pulse then. */}
            {/* ACCOUNT REGION (JT2): a positioned flex-1 wrapper so the Practice
                free-type input overlays ONLY the account slot — the amount + gap
                stay visible and independently clickable at all times. */}
            <div className="relative flex min-w-0 flex-1 items-center">
            <button
              className={`group/dd flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[13px] transition-colors ${actionable && selected ? "je-fill-pulse" : ""}`}
              style={{
                color: trapOn ? PAPER.red : actionable ? "rgba(138,90,0,0.85)" : PAPER.ink,
                fontStyle: empty ? "italic" : undefined,
                background: dragLine === l.id
                  ? "rgba(20,33,61,0.08)"
                  : actionable
                    ? `rgba(252,163,17,${selected ? 0.11 : 0.06})`
                    : locked ? "transparent" : "rgba(20,33,61,0.02)",
                border: locked
                  ? "1px solid transparent"
                  : actionable
                    ? `1px dashed rgba(252,163,17,${selected ? 0.8 : 0.55})`
                    : "1px solid rgba(20,33,61,0.12)",
              }}
              title={eff(l).account || (S.showPicker ? "Choose account" : "Type the account")}
              data-je-acct={l.id}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => { if (!locked) e.currentTarget.style.borderColor = actionable ? "rgba(252,163,17,0.95)" : "rgba(20,33,61,0.4)"; }}
              // clear the imperative override so the inline `border` (which
              // tracks selected/actionable) wins again — self-heals on re-render
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
              // TAB AUTHORING (#2, Guided): Tab from the focused account button
              // advances to the amount (Enter/Space opens the picker to fill it).
              onKeyDown={(e) => {
                if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); advanceField(l.id, "account", e.shiftKey); }
              }}
              onClick={(e) => {
                if (locked) return; // review-only
                e.stopPropagation();
                selectLine(l.id);
                if (S.showPicker) setPickerFor(pickerFor?.id === l.id ? null : { id: l.id, anchor: e.currentTarget });
              }}
            >
              <span className="min-w-0 flex-1 truncate">{eff(l).account || "Choose account"}</span>
              {!locked && S.showPicker && (
                <ChevronDown className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover/dd:opacity-90" style={{ color: PAPER.navy }} />
              )}
            </button>
            {pickerFor?.id === l.id && S.showPicker && (
              <CardPopover anchor={pickerFor.anchor} side="left" onClose={() => setPickerFor(null)}>
                <CoaPicker
                  groups={ctx.coa}
                  recent={sceneRecentAccounts(rf, id)}
                  showChips={S.showNormalChips}
                  onToggleChips={(v) => update({ settings: { ...(d.settings ?? {}), showNormalChips: v } })}
                  courseName={ctx.courseName}
                  onManageAccounts={ctx.onManageAccounts}
                  // pick → fill → auto-advance to the amount (fast Tab flow, #2)
                  onPick={(name) => { patchLine(l.id, { account: name }); setPickerFor(null); advanceField(l.id, "account", false); }}
                  onClose={() => setPickerFor(null)}
                />
              </CardPopover>
            )}
            {!S.showPicker && !locked && (
              <FreeTypeEditor
                line={l}
                onOpen={() => selectLine(l.id)}
                onCommit={(v) => patchLine(l.id, { account: v })}
                names={[...(d.accountBank ?? []), ...ctx.coaNames]}
                cardId={id}
                openSeq={authAcct}
                onFieldTab={(back) => advanceField(l.id, "account", back)}
                onEnter={() => addBlockBelow(l.id)}
              />
            )}
            </div>{/* /account region */}

            {/* AMOUNT — ??? is the permanent no-value state; it now reads as a
                fillable amber slot that RHYMES with the dashed account box
                (dashed amber underline), so both halves of the block say
                "fill me". A real amount recedes to calm ink. One click opens
                entry (A8). Pulses once with the block on selection. */}
            <div className="w-20 shrink-0 text-right" style={{ color: trapOn ? PAPER.red : PAPER.ink }}>
              {locked ? (
                <span className={`tabular-nums ${amt == null ? "opacity-30" : ""}`}>{amt == null ? "???" : fmtNum(amt)}</span>
              ) : (
                <EditableNumber
                  value={amt}
                  placeholder="???"
                  clickToEdit
                  className={isEcho ? "italic opacity-70" : ""}
                  emptyClassName={`${amtEmpty && selected ? "je-fill-pulse " : ""}border-b border-dashed px-0.5`}
                  emptyStyle={{ color: "rgba(138,90,0,0.85)", borderColor: `rgba(252,163,17,${selected ? 0.8 : 0.55})` }}
                  openSeq={authAmt}
                  onFieldTab={(back, val) => advanceField(l.id, "amount", back, val)}
                  onEnter={(val) => addBlockBelow(l.id, val)}
                  onChange={(v) => commitAmount(l.id, side, v)}
                />
              )}
            </div>

            {/* distractor flip */}
            {l.trap && (
              <button
                className="nodrag grid h-5 w-5 shrink-0 place-items-center rounded"
                style={{ color: trapOn ? PAPER.red : PAPER.inkMuted, background: trapOn ? "rgba(194,24,50,0.1)" : "transparent" }}
                title={trapOn ? "Flip back to the correct version" : "Flip to the trap version"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !l.flipped;
                  patchLine(l.id, { flipped: next });
                  setFlipFeedback(next ? l.trap!.feedback : null);
                }}
              >
                <Repeat className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* per-block controls — a VERTICAL RAIL just OUTSIDE the cluster's
              right edge (J1), aligned to this block's row. The connection dots
              stay on the cluster/block edge; the rail sits BEYOND them, so
              lightbulb (TEXT memo) · calculator (CALC memo) · ⊗ delete never
              collide with the dots at any zoom. The transparent left padding
              bridges the block→rail gap so hover doesn't flicker (the dots are
              z-30, so they still win pointer events inside the gap). Hover-only;
              review-lock hides edits but keeps set memos. */}
          <div
            className="nodrag absolute z-[2] flex items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100"
            style={{ left: "100%", top: (BLOCK_H - 20) / 2, paddingLeft: ctx.jeCardWidth + RAIL_GUTTER - (ind + blockW) }}
          >
            {/* MEMO REWIRE (item 3): text/calc icons now use the MemoLightbulb
                attach gesture — each spawns an INDEPENDENT memo NODE + red pointer
                arrow anchored to THIS line's block, one undoable command. No more
                legacy in-card popover. */}
            {(() => {
              const memoBtn = (kind: "note" | "calc", Icon: typeof Lightbulb, addTitle: string) =>
                S.lightbulbs && !locked ? (
                  <button
                    key={kind}
                    className="grid h-5 w-5 place-items-center rounded-full"
                    style={{ color: PAPER.inkMuted, background: "rgba(251,249,244,0.9)", border: `1px solid ${PAPER.cardEdge}` }}
                    title={addTitle}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); attachMemo(rf, id, lineHandleId(l.id, "r"), { kind }); }}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ) : null;
              return (
                <>
                  {memoBtn("note", Lightbulb, "Attach a memo to this line")}
                  {memoBtn("calc", Calculator, "Attach a calc memo to this line")}
                </>
              );
            })()}
            {!locked && (
              <button
                className="grid h-5 w-5 place-items-center rounded-full"
                style={{ color: PAPER.red, background: "rgba(251,249,244,0.9)", border: "1px solid rgba(194,24,50,0.35)" }}
                title="Delete line"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deleteLine(l.id); }}
              >
                <CircleX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>
    );
  };

  /** MEMO LAYER (V2 + PROMPT A): floating TEXT and CALC boxes anywhere in
   *  rows-local node space, EACH with its own thin arrow that re-routes live
   *  to the EXACT block it annotates. A line can float both at once. Hidden
   *  while a line drag reshuffles the rows (indexes are in motion). */
  const memoLayer = () => {
    if (dragLine) return null;
    const open: { l: JeLine; i: number; m: JeMemo }[] = [];
    lines.forEach((l, i) => {
      for (const m of memosOf(l)) if (m.open && m.text) open.push({ l, i, m });
    });
    if (open.length === 0) return null;
    const BOX_W = 190;
    const geom = open.map(({ l, i, m }) => {
      const live = memoDrag && memoDrag.id === l.id && memoDrag.kind === m.kind;
      const pos = live ? memoDrag.pos : (m.pos ?? defaultMemoPos(i, m.kind));
      // The GUARANTEED DEFAULT pointer (J2) targets the memo's OWN line; a
      // re-target (J3) points it at another block IN THIS CARD via m.point.
      // Cross-card arrows are RF edges grown from the memo dot — the edge layer
      // draws those, not this in-card leader.
      const tIdx = m.point ? lines.findIndex((x) => x.id === m.point) : i;
      const ti = tIdx >= 0 ? tIdx : i;
      const g = memoLeaderGeom({ boxX: pos.x, boxY: pos.y, boxW: BOX_W, blockInd: inds[ti], blockW, rowIndex: ti, blockH: BLOCK_H });
      return { l, i, m, pos, ...g };
    });
    return (
      <>
        <svg className="pointer-events-none absolute left-0 top-0 z-[3]" style={{ width: 0, height: 0, overflow: "visible" }}>
          <defs>
            <marker id={`memo-arr-${id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(252,163,17,0.85)" />
            </marker>
          </defs>
          {geom.map((a) => (
            <line key={`${a.l.id}-${a.m.kind}`} x1={a.mx} y1={a.my} x2={a.bx} y2={a.by} stroke="rgba(252,163,17,0.55)" strokeWidth={1.5} markerEnd={`url(#memo-arr-${id})`} />
          ))}
        </svg>
        {geom.map((a) => (
          <div
            key={`memo-${a.l.id}-${a.m.kind}`}
            className={`nodrag absolute z-[4] rounded-md px-2 py-1 leading-snug ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
            style={{
              left: a.pos.x,
              top: a.pos.y,
              width: BOX_W,
              color: "rgba(244,246,250,0.9)",
              background: "rgba(16,27,49,0.92)",
              border: "1px solid rgba(252,163,17,0.35)",
              boxShadow: "0 10px 24px -12px rgba(0,0,0,0.6)",
            }}
            onPointerDown={(e) => startMemoDrag(e, a.l.id, a.m.kind, a.pos)}
            onPointerMove={moveMemoDrag}
            onPointerUp={endMemoDrag}
          >
            {/* MEMO ARROW DOT (J3): drag from here to grow an ordinary arrow to
                any block or card (persist/undo/× all inherited from the edge
                system). Drop it on another block IN THIS CARD → re-targets the
                default leader instead (onConnect intercepts same-card memo→line).
                stopPropagation keeps the box-drag from firing; RF's connection
                runs on mousedown, so it still starts. */}
            {!locked && (
              <Handle
                id={memoHandleId(a.l.id, a.m.kind)}
                type="source"
                position={Position.Right}
                className="conn-dot memo-dot"
                style={{ right: -5, top: "50%", width: 9, height: 9, background: "#101B31", border: `2px solid ${NEON.yellow}`, borderRadius: 999 }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Drag to point this memo at another block or card"
              />
            )}
            <button
              className="nodrag absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full"
              style={{ color: NEON.muted, background: "#101B31", border: "1px solid rgba(147,160,180,0.4)" }}
              title="Dismiss"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => toggleMemo(a.l.id, a.m.kind)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
            <span className="block">{/* legacy in-card leader (inert post-migration; memos are nodes now) */}
              {/* TITLE + semantic-kind chip (Phase 1) — the memo's name + its
                  deck bucket (Note/Tip/Trap/Cheat/Calc), shown when set. */}
              {(a.m.title || (a.m.memoKind && a.m.memoKind !== "note" && a.m.memoKind !== "calc")) && (
                <span className="mb-0.5 flex items-center gap-1">
                  {a.m.title && <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold" style={{ color: "#F5D48F" }}>{a.m.title}</span>}
                  <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: "rgba(252,163,17,0.9)", border: "1px solid rgba(252,163,17,0.4)" }}>
                    {memoKindOf(a.m)}
                  </span>
                </span>
              )}
              {a.m.kind === "calc" ? (
                // CALC: tabular arithmetic, = signs aligned in a 2-col grid
                <span className="grid grid-cols-[1fr_auto] gap-x-1 text-[10.5px] tabular-nums" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
                  <Calculator className="col-span-2 mb-0.5 h-3 w-3" style={{ color: "rgba(252,163,17,0.8)" }} />
                  {calcRows(a.m.text).map((r, ri) =>
                    r.right === null ? (
                      <span key={ri} className="col-span-2 text-right">{r.left}</span>
                    ) : (
                      <span key={ri} className="contents">
                        <span className="text-right">{r.left}</span>
                        <span>= {r.right}</span>
                      </span>
                    ),
                  )}
                </span>
              ) : (
                <span className="text-[11px]">{a.m.text}</span>
              )}
            </span>
          </div>
        ))}
      </>
    );
  };

  /** Add-line "+" in the INDENT NOOK: dr under the debit column's left edge,
   *  cr at the indent (A7). */
  const nook = (side: JeSide) => (
    <button
      className="nodrag grid h-5 w-7 place-items-center rounded-md opacity-0 transition-opacity hover:!opacity-100 group-hover/cluster:opacity-40"
      style={{ color: NEON.muted, border: `1px dashed ${NEON.borderSoft}` }}
      title={side === "dr" ? "Add debit line" : "Add credit line"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); addLine(side); }}
    >
      <Plus className="h-3 w-3" />
    </button>
  );

  const entryType = d.entryType ?? "standard";

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/cluster animate-in fade-in zoom-in-95 relative rounded-2xl duration-150"
      style={{
        width: ctx.jeCardWidth,
        // RING PADDING (JE fixes #8): content-box keeps the tetris at its
        // design width while this gutter pushes the node's selection outline +
        // ambient sheen well clear of the description / accounts / amounts, so
        // nothing touches the border. Uniform, so selecting never reflows.
        boxSizing: "content-box",
        padding: 12,
        // FILMING SCALE (FF-2): shrink the whole cluster for a framed shot.
        transform: cardScale !== 1 ? `scale(${cardScale})` : undefined,
        transformOrigin: "top left",
        ...cardDim,
        // LIGHT CARD (contrast pass): the JE is now a PAPER body — an off-white
        // "flashcard" that pops off the navy table, matching the T-account
        // standard (BaseCard). Dark ink is the default; colour is reserved for
        // meaning (amber=empty, silver=selected, green/red=balance). The tetris
        // silhouette rides ON this body — its per-row edges still draw the shape.
        background: PAPER.card,
        color: PAPER.ink,
        border: `1px solid ${deckFlash ? NEON.yellow : selected ? SILVER : PAPER.cardEdge}`,
        // pop off the dark table; selection adds a silver ring + platinum sheen;
        // a deck flash (item 4e) overrides with a bright gold ring for ~1.2s
        boxShadow: deckFlash
          ? `0 0 0 3px ${NEON.yellow}, 0 0 22px -2px ${NEON.yellow}`
          : selected
            ? `0 0 0 1.5px ${SILVER}, 0 0 22px -6px ${SILVER_SHEEN}, 0 14px 34px -14px rgba(0,0,0,0.6)`
            : "0 12px 32px -14px rgba(0,0,0,0.55)",
        transition: "box-shadow 200ms ease-out, border-color 200ms ease-out",
      }}
    >
      <style>{SOCKET_PULSE_CSS}</style>
      <ConnectionDots />

      {/* DECK CHIP (item 4b) — top-left, hover-revealed; names this JE's deck and
          is the drag handle to (re)assign it to a named deck. */}
      <div className={`card-actions absolute -top-6 left-1 z-[2] transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover/cluster:opacity-100"}`}>
        <DeckChip nodeId={id} deckId={d.deckId} />
      </div>

      {/* FLIP (JT4) — to the LEFT of the cluster, left of the connection dots;
          hover-revealed. Swaps debits ↔ credits (a JE is often the flip of
          another: reversing entries, "now the other side"). */}
      {!locked && (
        <button
          className="card-actions absolute -left-9 top-1/2 z-[2] grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity group-hover/cluster:opacity-100"
          style={{ color: NEON.muted, background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
          title="Flip — swap debits and credits"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); flip(); }}
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ONE chrome grid (V2) — top-right, 2×3, hover/selection only:
          [↗ deck | clone | ×] / [lock | gear | ? flip-help] */}
      <div
        className={`card-actions absolute -top-12 right-1 z-[2] grid grid-cols-3 gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected || d.helpOpen || locked ? "opacity-100" : "opacity-0 group-hover/cluster:opacity-100"}`}
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
      >
        {d.deckMember ? (
          <ChromeBtn title="Tuck into deck (s)" onClick={tuck}>
            <span className="text-[11px] font-black leading-none">_</span>
          </ChromeBtn>
        ) : (
          <ChromeBtn title="Add to deck (top-right)" onClick={addToDeck}>
            <ArrowUpRight className="h-3 w-3" />
          </ChromeBtn>
        )}
        <button
          title={locked ? "Clone… (locked original stays the answer key)" : "Clone (lands underneath)"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (locked) setCloneMenu(cloneMenu ? null : e.currentTarget); else cloneAs(false); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: cloneMenu ? NEON.yellow : NEON.muted }}
        >
          <Copy className="h-3 w-3" />
        </button>
        <ChromeBtn title="Delete" danger onClick={remove}><X className="h-3 w-3" /></ChromeBtn>
        <button
          title={locked ? "Unlock — allow drag + edits" : "Lock for review — no drag, no edits (the answer-key state)"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ reviewLock: !locked }); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: locked ? NEON.yellow : NEON.muted }}
        >
          {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </button>
        <button
          title={locked ? "Unlock to change settings" : "Card settings"}
          disabled={locked}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setGearAnchor(gearAnchor ? null : e.currentTarget); }}
          className="nodrag grid h-5 w-5 place-items-center rounded disabled:opacity-30"
          style={{ color: gearAnchor ? NEON.yellow : NEON.muted }}
        >
          <Settings2 className="h-3 w-3" />
        </button>
        <ChromeBtn title={d.helpOpen ? "Flip back to the entry" : "Stuck? Flip for help"} onClick={flipHelp}>
          {d.helpOpen ? <Undo2 className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}
        </ChromeBtn>
      </div>
      {cloneMenu && (
        <CardPopover anchor={cloneMenu} align="right" onClose={() => setCloneMenu(null)}>
          <div
            className="nodrag w-56 rounded-lg p-1.5 shadow-xl"
            style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold hover:bg-black/5"
              style={{ color: PAPER.navy }}
              onClick={() => cloneAs(true)}
            >
              Clone as Practice copy
              <span className="block text-[10px] font-normal" style={{ color: PAPER.inkMuted }}>
                blank silhouette for the student — this locked original stays the answer key
              </span>
            </button>
            <button
              className="block w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold hover:bg-black/5"
              style={{ color: PAPER.ink }}
              onClick={() => cloneAs(false)}
            >
              Exact clone
            </button>
          </div>
        </CardPopover>
      )}
      {gearAnchor && (
        <CardPopover anchor={gearAnchor} side="left" onClose={() => setGearAnchor(null)}>
          <GearPanel
            mode={mode}
            entryType={entryType}
            date={d.date}
            onMode={(m) => update({ mode: m, settings: { ...JE_PRESETS[m] } })}
            onEntryType={(t) => update({ entryType: t })}
            onDate={(v) => update({ date: v })}
            onReset={() =>
              updateFn((prev) => {
                const sol = prev.solution as JeLine[] | undefined;
                const cur = (prev.lines as JeLine[]) ?? [];
                return { lines: blankFrom(sol?.length ? sol : cur, () => cardId("l")), helpOpen: false, revealUsed: false };
              })
            }
            onSaveToLibrary={() => setSaveToLibOpen(true)}
            onClose={() => setGearAnchor(null)}
          />
          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Principle tags</div>
            <PrincipleTagPicker value={d.principleTags ?? []} onChange={(tags) => update({ principleTags: tags })} />
          </div>
        </CardPopover>
      )}
      {saveToLibOpen && (
        <SaveToLibraryDialog
          card={d}
          defaultCourseId={ctx.courseId}
          defaultChapterId={ctx.chapterId}
          onSaved={(scenarioId) => update({ scenarioId })}
          onClose={() => setSaveToLibOpen(false)}
        />
      )}

      {d.helpOpen ? (
        <HelpBack
          width={ctx.jeCardWidth - 8}
          caption={d.caption}
          hint={hint}
          mode={mode}
          mustAttempt={mode === "practice" && !hasAttempt(d.lines)}
          onReveal={revealCorrect}
          onGuided={switchToGuided}
          onFlipBack={flipHelp}
        />
      ) : (
        <>
          {/* description (no box) — drags the cluster. A JE badge would be noise:
              the badge renders ONLY for the special types (ADJ / CL). */}
          <div className="group/desc mb-2 flex items-start gap-1.5">
            {/* DATE ICON (#7): dates are occasional, so the calendar hides to
                the LEFT of the description and reveals on hover; it stays lit
                while a date is set (so you can change/remove it). Click opens
                the picker → sets the "Mon D ·" prefix rendered below. */}
            {!locked && (
              <button
                className={`nodrag mt-1 grid h-4 w-4 shrink-0 place-items-center rounded transition-opacity hover:!opacity-100 ${d.date ? "opacity-80" : "opacity-0 group-hover/desc:opacity-60"}`}
                style={{ color: d.date ? NEON.yellow : NEON.muted }}
                title={d.date ? "Change or remove the date" : "Add a date"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setDateAnchor(dateAnchor ? null : e.currentTarget); }}
              >
                <CalendarDays className="h-3 w-3" />
              </button>
            )}
            {entryType !== "standard" && (
              <span
                className="mt-0.5 shrink-0 rounded px-1 text-[9px] font-black tracking-wider"
                style={{ color: NEON.pink, border: `1px solid rgba(224,40,74,0.55)`, fontFamily: JE_FONT }}
              >
                {BADGE[entryType]}
              </span>
            )}
            {locked && (
              <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center" title="Locked for review">
                <Lock className="h-3 w-3" style={{ color: NEON.yellow }} />
              </span>
            )}
            {fmtJeDate(d.date) && (
              // "Jan 15 · Purchasing insurance upfront" — the date is set in the gear
              <span
                className="mt-0.5 shrink-0 text-[13px] font-semibold"
                style={{ color: NEON.yellow, fontFamily: JE_FONT, letterSpacing: "-0.01em" }}
                title={d.date}
              >
                {fmtJeDate(d.date)} ·
              </span>
            )}
            <TitleEditor
              value={d.caption}
              readOnly={locked}
              editing={titleEditing}
              onOpen={(anchor) => setDescMenu(descMenu ? null : anchor)}
              onCommit={(v) => { update({ caption: v }); setTitleEditing(false); }}
              onCancel={() => setTitleEditing(false)}
            />
          </div>
          {descMenu && (
            <CardPopover anchor={descMenu} side="left" onClose={() => setDescMenu(null)}>
              <JeScenarioPicker
                items={ctx.jeLibrary}
                courseId={ctx.courseId}
                courseName={ctx.courseName}
                contentResetMissing={ctx.contentResetMissing}
                onPick={applyScenario}
                onCustom={() => { setDescMenu(null); setTitleEditing(true); }}
                onClose={() => setDescMenu(null)}
              />
            </CardPopover>
          )}
          {dateAnchor && (
            <CardPopover anchor={dateAnchor} side="left" onClose={() => setDateAnchor(null)}>
              <DatePopover date={d.date} onDate={(v) => update({ date: v })} onClose={() => setDateAnchor(null)} />
            </CardPopover>
          )}

          {/* ONE TETRIS PIECE — rows share edges, zero gap; the per-row exposed
              edges add up to a single continuous outline around the union.
              (relative: the memo layer positions in THIS coordinate space) */}
          <div className="relative flex flex-col">
            {gapSocket(0)}
            {lines.map((l, i) => (
              <div key={l.id} className="flex flex-col">
                {row(l, i)}
                {gapSocket(i + 1)}
              </div>
            ))}
            {memoLayer()}
          </div>
          {!locked && !dragLine && (
            <div className="mt-1 flex items-center">
              {nook("dr")}
              <span style={{ width: Math.max(4, ctx.jeIndent - 28) }} />
              {nook("cr")}
            </div>
          )}

          {flipFeedback && (
            <div className="mt-2 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.15)", color: "#FF8B9E", border: `1px solid rgba(194,24,50,0.4)`, width: blockW }}>
              {flipFeedback}
            </div>
          )}

          {/* balance chip — GUIDED always; PRACTICE only after attempt+reveal.
              UNKNOWN renders NOTHING (PROMPT A item 2: the old "?" pill at the
              cluster's bottom-right was pure noise — chrome-consolidation era).
              BALANCED reads as a bare ✓ (item 2 — the word "balanced" was
              redundant; balanceState already requires BOTH sides fully valued);
              OFF keeps the signed Δ so the miss is legible. */}
          {(mode === "guided" || d.revealUsed) && bal.state !== "unknown" && (
            <div className="mt-1.5 flex justify-end">
              <span
                className={`rounded-full py-0.5 text-[10.5px] font-bold tabular-nums ${bal.state === "balanced" ? "px-1.5" : "px-2"}`}
                title={bal.state === "balanced" ? "Debits equal credits" : "Debits do not equal credits"}
                style={
                  bal.state === "balanced"
                    ? { color: NEON.green, border: `1px solid rgba(59,245,160,0.6)`, background: "rgba(59,245,160,0.1)" }
                    : { color: "#FF8B9E", border: `1px solid rgba(194,24,50,0.5)`, background: "rgba(194,24,50,0.12)" }
                }
              >
                {bal.state === "balanced" ? "✓" : `Δ ${fmtNum(Math.abs(bal.sumDr - bal.sumCr))} ${bal.sumDr - bal.sumCr > 0 ? "DR" : "CR"}`}
              </span>
            </div>
          )}
        </>
      )}

      {/* FILMING SCALE (FF-2 UI) — corner grip + % readout, undoable, persists */}
      <CardScaleHandle scale={cardScale} onScale={(s) => update({ scale: s })} corner="bl" />
    </div>
  );
}

/** The BACK FACE (A2) — navy SURVIVE-back styling, the "stuck?" panel. Reveal is
 *  gated in PRACTICE: no attempt yet → "Try it first" with a Switch-to-Guided out.
 *  Every card type inherits this mechanism later (roadmap). */
function HelpBack({ width, caption, hint, mode, mustAttempt, onReveal, onGuided, onFlipBack }: {
  width: number;
  caption: string;
  hint: string | null;
  mode: JePreset;
  mustAttempt: boolean;
  onReveal: () => void;
  onGuided: () => void;
  onFlipBack: () => void;
}) {
  const [showHint, setShowHint] = useState(false);
  const [gate, setGate] = useState(false); // "Try it first" dialog
  const btn = (label: string, onClick: () => void, opts?: { gold?: boolean; disabled?: boolean }) => (
    <button
      className="nodrag w-full rounded px-2 py-1.5 text-left text-[11.5px] font-semibold transition-colors disabled:opacity-40"
      style={{
        color: opts?.gold ? "#E8B84B" : "#F4EFE6",
        border: `1px solid ${opts?.gold ? "rgba(232,184,75,0.55)" : "rgba(244,239,230,0.25)"}`,
        background: "rgba(11,15,30,0.45)",
      }}
      disabled={opts?.disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {label}
    </button>
  );
  return (
    <div
      className="animate-in fade-in zoom-in-95 rounded-xl p-3 duration-150"
      style={{ width, background: "#14213D", border: "1px solid rgba(232,184,75,0.55)", boxShadow: "inset 0 0 0 3px rgba(232,184,75,0.25), 0 14px 34px -14px rgba(0,0,0,0.65)" }}
    >
      <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#E8B84B" }}>Stuck?</div>
      {caption && <div className="mb-2 text-[12px] leading-snug" style={{ color: "rgba(244,239,230,0.85)" }}>{caption}</div>}

      {gate ? (
        <div className="rounded-lg p-2" style={{ border: "1px solid rgba(232,184,75,0.4)", background: "rgba(232,184,75,0.08)" }}>
          <p className="mb-2 text-[11.5px] leading-snug" style={{ color: "#F4EFE6" }}>
            <b>Try it first.</b> Put down an account or an amount — even a wrong guess teaches more than peeking.
          </p>
          <div className="flex flex-col gap-1">
            {btn("OK — I'll try", () => { setGate(false); onFlipBack(); })}
            {btn("Switch to Guided instead", onGuided, { gold: true })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {btn("Reveal the correct answer", () => (mustAttempt ? setGate(true) : onReveal()), { gold: true })}
          {hint && btn(showHint ? "Hide hint" : "Hint", () => setShowHint((v) => !v))}
          {mode === "practice" && btn("Switch to Guided", onGuided)}
        </div>
      )}

      {showHint && hint && !gate && (
        <div className="mt-2 rounded px-2 py-1.5 text-[11.5px] leading-snug" style={{ color: "#F4EFE6", background: "rgba(232,184,75,0.12)", border: "1px solid rgba(232,184,75,0.4)" }}>
          <Lightbulb className="mr-1 inline h-3 w-3" style={{ color: "#E8B84B" }} />
          {hint}
        </div>
      )}
    </div>
  );
}

function ChromeBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag grid h-5 w-5 place-items-center rounded transition-colors"
      style={{ color: NEON.muted }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? "#FF5C6C" : "#FCA311")}
      onMouseLeave={(e) => (e.currentTarget.style.color = NEON.muted)}
    >
      {children}
    </button>
  );
}

/** Floating description — Poppins (A11), modern and clean, no box.
 *  At rest it DRAGS the cluster; a click opens the SCENARIO PICKER (A12) via
 *  onOpen — free-text lives behind the picker's "type custom" (parent-driven
 *  `editing`). */
function TitleEditor({ value, readOnly, editing, onOpen, onCommit, onCancel }: {
  value: string;
  readOnly?: boolean;
  editing: boolean;
  onOpen: (anchor: HTMLElement) => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(value);
  // "type custom" opens the editor from the picker — sync local at that moment
  useEffect(() => { if (editing) setLocal(value); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!editing || readOnly) {
    return (
      <span
        className={`min-w-0 flex-1 text-[16.5px] leading-snug ${readOnly ? "" : "cursor-pointer"}`}
        style={{
          // dark ink on the parchment body (contrast pass) — a filled caption
          // is calm navy; the empty prompt is muted ink, not washed-out grey
          color: value ? PAPER.navy : PAPER.inkMuted,
          fontFamily: JE_FONT,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          fontStyle: value ? undefined : "italic",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={readOnly ? value || undefined : "Pick from the scenario library or type your own"}
        onClick={(e) => { if (!readOnly) { setLocal(value); onOpen(e.currentTarget); } }}
      >
        {value || "New entry"}
      </span>
    );
  }
  return (
    <textarea
      rows={2}
      autoFocus
      className="nodrag min-w-0 flex-1 resize-none rounded bg-black/5 px-1 py-0.5 text-[16.5px] leading-snug outline-none ring-1 ring-[rgba(20,33,61,0.25)]"
      style={{ color: PAPER.navy, fontFamily: JE_FONT, fontWeight: 600 }}
      defaultValue={value}
      placeholder="New entry"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommit(local); }
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
    />
  );
}

/** Free-text account entry when the picker is off (PRACTICE): one click to type.
 *  TAB AUTHORING (#2): the card can force it open + intercept Tab. */
function FreeTypeEditor({ line, onOpen, onCommit, names, cardId: cid, openSeq, onFieldTab, onEnter }: {
  line: JeLine; onOpen?: () => void; onCommit: (v: string) => void; names: string[]; cardId: string;
  openSeq?: number; onFieldTab?: (back: boolean) => void; onEnter?: () => void;
}) {
  const listId = `bank-${cid}-${line.id}`;
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // keyboard authoring: a new openSeq opens + focuses once, then self-manages.
  // Retry across frames — a freshly-spawned block's input mounts a tick later.
  useEffect(() => {
    if (openSeq === undefined) return;
    setOpen(true); onOpen?.();
    let tries = 0, raf = 0;
    const grab = () => {
      const el = inputRef.current;
      if (el) { el.focus(); el.select(); }
      else if (tries++ < 10) raf = requestAnimationFrame(grab);
    };
    raf = requestAnimationFrame(grab);
    return () => cancelAnimationFrame(raf);
  }, [openSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) {
    return (
      <span
        className="absolute inset-0 cursor-text"
        onClick={(e) => { e.stopPropagation(); onOpen?.(); setOpen(true); }}
        title="Click to type the account"
      />
    );
  }
  return (
    <>
      <datalist id={listId}>{[...new Set(names)].map((n) => <option key={n} value={n} />)}</datalist>
      <input
        ref={inputRef}
        autoFocus
        list={listId}
        defaultValue={line.account}
        placeholder="Account"
        className="nodrag absolute inset-0 w-full rounded bg-white px-1.5 py-0.5 text-[13px] outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
        style={{ color: PAPER.ink }}
        onBlur={(e) => { onCommit(e.target.value); setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === "Tab" && onFieldTab) { e.preventDefault(); onCommit((e.target as HTMLInputElement).value); setOpen(false); onFieldTab(e.shiftKey); e.stopPropagation(); return; }
          if (e.key === "Enter") { e.preventDefault(); onCommit((e.target as HTMLInputElement).value); setOpen(false); if (onEnter) { onEnter(); e.stopPropagation(); return; } }
          if (e.key === "Escape") setOpen(false);
          e.stopPropagation();
        }}
      />
    </>
  );
}

/** The four semantic memoKinds an author can pick for a TEXT memo (a calc memo
 *  is always memoKind 'calc'). Each feeds a memo deck later (Phase 3). */
const MEMO_TEXT_KINDS: { key: MemoKind; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "tip", label: "Tip" },
  { key: "trap", label: "Trap" },
  { key: "cheat", label: "Cheat" },
];

/** FULL MEMO EDITOR (Phase 1 — memos are objects, fully editable after creation):
 *  title (name), semantic kind (note/tip/trap/cheat, or fixed calc), free category
 *  tag, and body. Reopening an existing memo pre-fills every field. */
function MemoPopover({
  kind,
  memo,
  onSave,
  onClose,
}: {
  kind: JeMemo["kind"];
  memo: JeMemo | undefined;
  onSave: (payload: { text: string; title?: string; memoKind?: MemoKind; category?: string }) => void;
  onClose: () => void;
}) {
  const calc = kind === "calc";
  const [body, setBody] = useState(memo?.text ?? "");
  const [title, setTitle] = useState(memo?.title ?? "");
  const [category, setCategory] = useState(memo?.category ?? "");
  const [mk, setMk] = useState<MemoKind>(memo ? memoKindOf(memo) : calc ? "calc" : "note");
  const existed = !!memo;
  const chip = (active: boolean): React.CSSProperties => ({
    color: active ? "#8A5A00" : PAPER.inkMuted,
    background: active ? "rgba(252,163,17,0.16)" : "transparent",
    border: `1px solid ${active ? "rgba(138,90,0,0.5)" : PAPER.line}`,
  });
  return (
    <div
      className="nodrag w-60 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFF9E8", border: "1px solid rgba(138,90,0,0.35)", boxShadow: "0 14px 30px -10px rgba(20,33,61,0.4)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        {calc ? <Calculator className="h-3 w-3" style={{ color: PAPER.gold }} /> : <Lightbulb className="h-3 w-3" style={{ color: PAPER.gold }} />}
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "#8A5A00" }}>{calc ? "Calc memo" : "Memo"}</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Dismiss"><X className="h-3 w-3" /></button>
      </div>

      {/* NAME (optional) */}
      <input
        className="mb-1 w-full rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold outline-none"
        style={{ color: PAPER.ink, border: `1px solid ${PAPER.line}` }}
        value={title}
        placeholder="Name (optional)"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />

      {/* SEMANTIC KIND — text memos pick note/tip/trap/cheat (calc is fixed) */}
      {!calc && (
        <div className="mb-1 flex flex-wrap gap-1">
          {MEMO_TEXT_KINDS.map((k) => (
            <button
              key={k.key}
              className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={chip(mk === k.key)}
              onClick={() => setMk(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        rows={calc ? 4 : 3}
        autoFocus
        className="w-full resize-none rounded bg-white/70 px-1.5 py-1 leading-snug outline-none"
        style={{
          color: PAPER.ink,
          border: `1px solid ${PAPER.line}`,
          fontSize: calc ? 11 : 11.5,
          fontFamily: calc ? "ui-monospace, Menlo, Consolas, monospace" : undefined,
        }}
        value={body}
        placeholder={calc ? "500,000 × 8% × 6/12 = 20,000\n(one step per line — = signs align)" : "Why this line…"}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
      />

      {/* CATEGORY (free tag — memo-deck filter) */}
      <input
        className="mt-1 w-full rounded bg-white/70 px-1.5 py-0.5 text-[10.5px] outline-none"
        style={{ color: PAPER.ink, border: `1px solid ${PAPER.line}` }}
        value={category}
        placeholder="Category tag (optional)"
        onChange={(e) => setCategory(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div className="mt-1.5 flex items-center">
        {existed && (
          <button
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ color: PAPER.red, border: "1px solid rgba(194,24,50,0.35)" }}
            title={`Remove this ${calc ? "calc " : ""}memo`}
            onClick={() => onSave({ text: "" })}
          >
            remove
          </button>
        )}
        <button
          className="ml-auto rounded px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.35)" }}
          onClick={() => onSave({ text: body, title, memoKind: calc ? "calc" : mk, category })}
        >
          save
        </button>
      </div>
    </div>
  );
}

/** DATE picker popover (#7) — the hover calendar's dropdown. Native date input
 *  + a remove button; setting a value stamps the "Mon D ·" prefix on the entry.
 *  The gear still carries a date field too — this is the quick, in-place path. */
function DatePopover({ date, onDate, onClose }: { date: string | undefined; onDate: (v: string | undefined) => void; onClose: () => void }) {
  return (
    <div
      className="nodrag w-48 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <CalendarDays className="h-3 w-3" style={{ color: PAPER.inkMuted }} />
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>Entry date</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close"><X className="h-3 w-3" /></button>
      </div>
      <input
        type="date"
        autoFocus
        value={date ?? ""}
        className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
        style={{ color: date ? PAPER.ink : PAPER.inkMuted, border: "1px solid rgba(20,33,61,0.35)", background: "transparent" }}
        onChange={(e) => onDate(e.target.value || undefined)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
      />
      {date && (
        <button
          className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ color: PAPER.red, border: "1px solid rgba(194,24,50,0.4)", background: "rgba(194,24,50,0.05)" }}
          title="Remove the date"
          onClick={() => { onDate(undefined); onClose(); }}
        >
          remove date
        </button>
      )}
    </div>
  );
}

/** Gear contents (V2 + PROMPT A): mode · entry type · DATE · RESET. Normal-
 *  balance chips moved into the picker header; amounts-visible and
 *  picker-search are always-on. */
function GearPanel({ mode, entryType, date, onMode, onEntryType, onDate, onReset, onSaveToLibrary, onClose }: {
  mode: JePreset;
  entryType: (typeof ENTRY_TYPES)[number];
  date: string | undefined;
  onMode: (m: JePreset) => void;
  onEntryType: (t: (typeof ENTRY_TYPES)[number]) => void;
  onDate: (v: string | undefined) => void;
  onReset: () => void;
  onSaveToLibrary: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="nodrag w-52 rounded-lg p-2 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center">
        <span className="flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: PAPER.inkMuted }}>This entry</span>
        <button style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close"><X className="h-3 w-3" /></button>
      </div>
      {/* MODE — guided teaches, practice tests (reveal gated behind an attempt) */}
      <div className="mb-1.5 flex gap-1">
        {(["guided", "practice"] as const).map((m) => (
          <button
            key={m}
            className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
            style={{
              color: mode === m ? "#FFFFFF" : PAPER.navy,
              background: mode === m ? PAPER.navy : "transparent",
              border: "1px solid rgba(20,33,61,0.35)",
            }}
            title={m === "guided" ? "Picker + chips + memos; reveal is free" : "Free-type; reveal requires an attempt"}
            onClick={() => onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {/* entry type — the corner badge follows (JE → ADJ → CL) */}
      <div className="mb-1.5 flex gap-1">
        {ENTRY_TYPES.map((t) => (
          <button
            key={t}
            className="flex-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase"
            style={{
              color: entryType === t ? "#FFFFFF" : PAPER.navy,
              background: entryType === t ? PAPER.navy : "transparent",
              border: "1px solid rgba(20,33,61,0.35)",
            }}
            onClick={() => onEntryType(t)}
          >
            {BADGE[t]}
          </button>
        ))}
      </div>
      {/* DATE (PROMPT A): optional; renders "Jan 15 · <description>" when set */}
      <div className="mb-1.5 flex items-center gap-1">
        <CalendarDays className="h-3 w-3 shrink-0" style={{ color: PAPER.inkMuted }} />
        <input
          type="date"
          value={date ?? ""}
          className="min-w-0 flex-1 rounded px-1 py-0.5 text-[10.5px] outline-none"
          style={{ color: date ? PAPER.ink : PAPER.inkMuted, border: "1px solid rgba(20,33,61,0.35)", background: "transparent" }}
          onChange={(e) => onDate(e.target.value || undefined)}
        />
        {date && (
          <button
            className="shrink-0 rounded px-1 text-[9.5px] font-bold uppercase"
            style={{ color: PAPER.red, border: "1px solid rgba(194,24,50,0.35)" }}
            title="Remove the date"
            onClick={() => onDate(undefined)}
          >
            ×
          </button>
        )}
      </div>
      <button
        className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.4)", background: "rgba(20,33,61,0.05)" }}
        title="Save this entry as an authored scenario (the content library)"
        onClick={() => { onSaveToLibrary(); onClose(); }}
      >
        save to library
      </button>
      <button
        className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: PAPER.red, border: "1px solid rgba(194,24,50,0.4)", background: "rgba(194,24,50,0.05)" }}
        title="Blank the lines back to an unattempted silhouette (Ctrl+Z restores)"
        onClick={() => { onReset(); onClose(); }}
      >
        reset attempt
      </button>
    </div>
  );
}
