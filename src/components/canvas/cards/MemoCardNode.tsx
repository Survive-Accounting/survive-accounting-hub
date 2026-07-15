// MEMO NODE (memos-as-objects, Phase 1) — a FIRST-CLASS floating annotation.
// Unlike the JE in-line memo (a convenience bound to one line), a memo NODE lives
// anywhere on the canvas: standalone, or tied to any target (a JE line, a card, a
// T-account) by dragging an arrow from its connection dot. It carries a semantic
// memoKind (note|calc|trap|tip|cheat), an optional name, a category tag, and a
// body — all fully editable after creation (double-click). Because it's an
// ordinary node it persists for free and is collectable into a MEMO deck (P3).
import { useEffect, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Calculator, Lightbulb, ShieldAlert, Sparkles, Star } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { DeckChip, useDecks } from "../DecksContext";
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { ElementChrome, ElementResizer } from "./elements";
import { calcRows } from "../je-logic";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { MEMO_SELF_TARGET } from "../spotlight";
import { NEON } from "../theme";
import { PrincipleTagPicker } from "../PrincipleTagPicker";
import type { MemoCard, MemoKind } from "../types";

/** memoKind → accent + icon + label. On-brand: gold notes, green tips, red traps,
 *  bright-gold cheats, gold calc (mono/tabular). */
export const MEMO_ACCENTS: Record<MemoKind, { edge: string; ink: string; label: string; Icon: typeof Lightbulb }> = {
  note: { edge: "rgba(252,163,17,0.45)", ink: "#F5D48F", label: "Note", Icon: Lightbulb },
  tip: { edge: "rgba(59,245,160,0.5)", ink: "#7EF3C0", label: "Tip", Icon: Sparkles },
  trap: { edge: "rgba(224,40,74,0.6)", ink: "#FF8B9E", label: "Trap", Icon: ShieldAlert },
  cheat: { edge: "rgba(252,163,17,0.75)", ink: "#FCA311", label: "Cheat", Icon: Star },
  calc: { edge: "rgba(252,163,17,0.45)", ink: "#F5D48F", label: "Calc", Icon: Calculator },
};

export const MEMO_KIND_OPTIONS: MemoKind[] = ["note", "tip", "trap", "cheat", "calc"];

/** Item 5 — the four category tags that replaced the kind buttons (+ free text). */
export const MEMO_CATEGORIES = ["STEPS", "EXAM TRAPS", "CHEAT CODES", "OTHER TIPS"] as const;

export function MemoCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MemoCard;
  const { update, toFront } = useCardActions(id);
  const rf = useReactFlow();
  const sp = useSpotlight();
  const { highlightId: deckHighlightId } = useDecks();
  const deckFlash = !!d.deckId && deckHighlightId === d.deckId;
  const stp = spotTargetProps(sp, id, MEMO_SELF_TARGET);
  const dim = useCardDim(id);
  const [editing, setEditing] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // SL7 — spotlighting a memo glows the box AND its pointer arrow(s) together.
  useEffect(() => {
    const glow = stp.state === "spot" || stp.state === "range";
    const ids = rf.getEdges().filter((e) => e.source === id || e.target === id).map((e) => e.id);
    for (const eid of ids) document.querySelector(`.react-flow__edge[data-id="${eid}"]`)?.classList.toggle("spotlit-edge", glow);
    return () => { for (const eid of ids) document.querySelector(`.react-flow__edge[data-id="${eid}"]`)?.classList.remove("spotlit-edge"); };
  }, [stp.state, id, rf]);
  const mk = d.memoKind ?? "note";
  const calc = mk === "calc";
  // Item 3: memo nodes are a SINGLE look now — dark body, GOLD border, icon only
  // (no kind chip). Kind collapsed to note|calc; the old trap/tip/cheat became
  // category tags. calc keeps its Calculator icon.
  const GOLD = { edge: "rgba(252,163,17,0.55)", ink: "#F5D48F" };
  const Icon = calc ? Calculator : Lightbulb;

  return (
    <div
      data-spot-target={MEMO_SELF_TARGET}
      onPointerDownCapture={(e) => { toFront(); if ((e.ctrlKey || e.metaKey) && sp) { e.preventDefault(); e.stopPropagation(); sp.start(id, MEMO_SELF_TARGET); } }}
      className="group/el animate-in fade-in relative rounded-md duration-150"
      style={{
        width: d.w ?? 200,
        minHeight: d.h ?? 56,
        padding: "6px 8px",
        color: "rgba(244,246,250,0.92)",
        background: "rgba(16,27,49,0.94)",
        border: `1px solid ${deckFlash ? NEON.yellow : selected ? GOLD.ink : GOLD.edge}`,
        boxShadow: deckFlash ? `0 0 0 3px ${NEON.yellow}, 0 0 20px -2px ${NEON.yellow}` : selected ? `0 0 18px -6px ${GOLD.ink}` : "0 10px 24px -12px rgba(0,0,0,0.6)",
        ...spotStyle(stp.state),
        ...dim,
      }}
    >
      <ConnectionDots color={GOLD.ink} />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={140} minHeight={48} />

      {/* header: icon only (+ optional title / category tag) — no kind chip */}
      <div className="mb-0.5 flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" style={{ color: GOLD.ink }} />
        {d.title ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold" style={{ color: GOLD.ink }}>{d.title}</span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {d.category ? (
          <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: GOLD.ink, border: `1px solid ${GOLD.edge}` }}>
            {d.category}
          </span>
        ) : null}
        {/* DECK CHIP (item 4b) — hover-revealed; drag onto a memo deck to assign */}
        <span className="shrink-0 opacity-0 transition-opacity group-hover/el:opacity-100"><DeckChip nodeId={id} deckId={d.deckId} /></span>
      </div>

      {/* body — double-click to edit (single click/drag moves the node) */}
      <div
        className="cursor-move whitespace-pre-wrap leading-snug"
        title="Double-click to edit · drag to move"
        onDoubleClick={(e) => { setAnchor(e.currentTarget); setEditing(true); }}
      >
        {calc && d.body ? (
          <span className="grid grid-cols-[1fr_auto] gap-x-1 text-[10.5px] tabular-nums" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
            {calcRows(d.body).map((r, ri) =>
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
        ) : d.body ? (
          <span className="text-[11px]">{d.body}</span>
        ) : (
          <span className="text-[11px] italic" style={{ opacity: 0.5 }}>Double-click to write…</span>
        )}
      </div>

      {/* editor opens BELOW the memo node (which already sits to the RIGHT of the
          JE) — clear of the entry (item 5). */}
      {editing && anchor && (
        <CardPopover anchor={anchor} align="right" onClose={() => setEditing(false)}>
          <MemoNodeEditor
            memo={d}
            onSave={(patch) => { update(patch as Record<string, unknown>); setEditing(false); }}
            onClose={() => setEditing(false)}
          />
        </CardPopover>
      )}
    </div>
  );
}

/** Full editor for a memo NODE — name, kind, category, body. Mirrors the JE
 *  in-line memo editor so both feel identical. */
function MemoNodeEditor({
  memo,
  onSave,
  onClose,
}: {
  memo: MemoCard;
  onSave: (patch: Partial<MemoCard>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(memo.title ?? "");
  const [body, setBody] = useState(memo.body ?? "");
  const [category, setCategory] = useState(memo.category ?? "");
  const [principleTags, setPrincipleTags] = useState<string[]>(memo.principleTags ?? []);
  const calc = (memo.memoKind ?? "note") === "calc"; // kind is set at creation; the editor no longer changes it
  return (
    <div
      className="nodrag w-60 rounded-lg p-2 shadow-xl"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        className="mb-1 w-full rounded bg-black/30 px-1.5 py-0.5 text-[11px] font-semibold outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
        value={title}
        placeholder="Name (optional)"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {/* Item 5: kind buttons removed; no calc placeholder text. */}
      <textarea
        rows={calc ? 4 : 3}
        autoFocus
        className="w-full resize-none rounded bg-black/30 px-1.5 py-1 leading-snug outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}`, fontSize: calc ? 11 : 11.5, fontFamily: calc ? "ui-monospace, Menlo, Consolas, monospace" : undefined }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
      />
      {/* CATEGORY (item 5): four preset tags + optional free text. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {MEMO_CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ color: active ? "#0B1322" : NEON.muted, background: active ? NEON.yellow : "transparent", border: `1px solid ${active ? NEON.yellow : NEON.borderSoft}` }}
              onClick={() => setCategory(active ? "" : c)}
            >
              {c}
            </button>
          );
        })}
      </div>
      <input
        className="mt-1 w-full rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
        value={category}
        placeholder="…or a custom tag"
        onChange={(e) => setCategory(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: NEON.borderSoft }}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Principle tags</div>
        <PrincipleTagPicker value={principleTags} onChange={setPrincipleTags} />
      </div>
      <div className="mt-1.5 flex justify-end">
        <button
          className="rounded px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)" }}
          onClick={() => onSave({ title: title.trim() || undefined, body, category: category.trim() || undefined, principleTags })}
        >
          save
        </button>
      </div>
    </div>
  );
}
