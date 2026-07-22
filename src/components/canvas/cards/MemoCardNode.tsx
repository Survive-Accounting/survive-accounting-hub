// MEMO NODE (memos-as-objects, Phase 1) — a FIRST-CLASS floating annotation.
// Unlike the JE in-line memo (a convenience bound to one line), a memo NODE lives
// anywhere on the canvas: standalone, or tied to any target (a JE line, a card, a
// T-account) by dragging an arrow from its connection dot. It carries a semantic
// memoKind (note|calc|trap|tip|cheat), an optional name, a category tag, and a
// body — all fully editable after creation (double-click). Because it's an
// ordinary node it persists for free and is collectable into a MEMO deck (P3).
import { useEffect, useRef, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Calculator, Lightbulb, ShieldAlert, Sparkles, Star } from "lucide-react";

import { CardResizeFrame, useCardActions } from "../BaseCard";
import { DeckChip, useDecks } from "../DecksContext";
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { ElementChrome } from "./elements";
import { calcRows } from "../je-logic";
import { useEditSignal } from "../ui";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { MEMO_SELF_TARGET } from "../spotlight";
import { renderInline } from "../inline-md";
import { DISPLAY_FONT, NEON } from "../theme";
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

/** Per-category inline glyph (redesign Item 2) — one emoji system, tasteful + camera-
 *  legible. NO TAG → NO ICON (Lee): a memo with no category renders clean, no glyph.
 *  Covers the 5 named categories including ON THE EXAM if it appears as a category. */
function memoGlyph(category: string | undefined): string | null {
  switch ((category ?? "").toUpperCase()) {
    case "CHEAT CODES": return "💡";
    case "EXAM TRAPS": return "⚠️";
    case "STEPS": return "🔢";
    case "ON THE EXAM": return "🎯";
    case "OTHER TIPS": return "💬";
    default: return null; // uncategorised memo → no icon
  }
}
const MEMO_MAXW = 340; // ≈ 42ch at 13px — long memos wrap here; short ones stay compact
const MEMO_HL = { bg: "rgba(252,163,17,0.32)", color: "#FFE9B8" }; // amber highlight on the dark memo

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
  const bodyRef = useRef<HTMLDivElement>(null);
  useEditSignal((data as { _editSeq?: number })._editSeq, () => { setAnchor(bodyRef.current); setEditing(true); }); // F2 global edit (item 4)
  // SL7 — spotlighting a memo glows the box AND its pointer arrow(s) together.
  useEffect(() => {
    const glow = stp.state === "spot" || stp.state === "range";
    const ids = rf.getEdges().filter((e) => e.source === id || e.target === id).map((e) => e.id);
    for (const eid of ids) document.querySelector(`.react-flow__edge[data-id="${eid}"]`)?.classList.toggle("spotlit-edge", glow);
    return () => { for (const eid of ids) document.querySelector(`.react-flow__edge[data-id="${eid}"]`)?.classList.remove("spotlit-edge"); };
  }, [stp.state, id, rf]);
  const mk = d.memoKind ?? "note";
  const calc = mk === "calc";
  // Dark body, GOLD border. The category is shown by an INLINE glyph at the start of
  // the text (redesign Item 2) — no standalone icon row. Font unified to the canvas
  // DISPLAY stack (Sora), the same one headings use (Item 3).
  const GOLD = { edge: "rgba(252,163,17,0.55)", ink: "#F5D48F" };
  const glyph = memoGlyph(d.category); // null when uncategorised → no icon
  const glyphStyle = { fontSize: "1.22em", marginRight: 5, verticalAlign: "-1px" } as const;
  // TEXT SCALES WITH THE CARD (Item 2): resize drives data.scale, applied as a
  // transform so the whole memo — padding, glyph, body — scales as one unit. We
  // COMPOSE with the spotlight's own scale(1.2) so a spotlit memo still pops. Read
  // d.scale directly (not useCardScale) — memos float, never take a frame's shot scale.
  const ss = spotStyle(stp.state);
  const userScale = typeof d.scale === "number" ? d.scale : 1;
  const spotScale = ss.transform ? 1.2 : 1; // "spot" state contributes scale(1.2)
  const totalScale = +(userScale * spotScale).toFixed(4);

  return (
    <div
      data-spot-target={MEMO_SELF_TARGET}
      onPointerDownCapture={(e) => { toFront(); if ((e.ctrlKey || e.metaKey) && sp) { e.preventDefault(); e.stopPropagation(); sp.start(id, MEMO_SELF_TARGET); } }}
      className="group/el animate-in fade-in relative rounded-md duration-150"
      style={{
        // AUTO-SIZE (Item 2): shrink to content, wrap long memos at a readable measure.
        // A manual resize (d.w / d.h) still wins.
        width: d.w ?? "fit-content",
        maxWidth: d.w ?? MEMO_MAXW,
        minHeight: d.h ?? undefined,
        padding: 15,
        color: "rgba(244,246,250,0.94)",
        background: "rgba(16,27,49,0.94)",
        border: `1px solid ${deckFlash ? NEON.yellow : selected ? GOLD.ink : GOLD.edge}`,
        boxShadow: deckFlash ? `0 0 0 3px ${NEON.yellow}, 0 0 20px -2px ${NEON.yellow}` : selected ? `0 0 18px -6px ${GOLD.ink}` : "0 10px 24px -12px rgba(0,0,0,0.6)",
        fontFamily: DISPLAY_FONT,
        ...ss,
        ...dim,
        transform: totalScale !== 1 ? `scale(${totalScale})` : undefined,
        transformOrigin: spotScale > 1 ? "left center" : "top left",
      }}
    >
      <ConnectionDots color={GOLD.ink} />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <CardResizeFrame scale={userScale} onScale={(s) => update({ scale: s })} accent={GOLD.ink} />

      {/* category tag + deck chip — hover chrome, top-right (no dead flow row above text) */}
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/el:opacity-100">
        {d.category ? (
          <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: GOLD.ink, background: "rgba(16,27,49,0.9)", border: `1px solid ${GOLD.edge}` }}>{d.category}</span>
        ) : null}
        <DeckChip nodeId={id} deckId={d.deckId} />
      </div>

      {/* body — glyph INLINE at the start of the text (Item 2); **bold** / ==highlight==
          (Item 3). Double-click to edit (single click/drag moves the node). */}
      <div
        ref={bodyRef}
        className="cursor-move whitespace-pre-wrap"
        style={{ fontSize: 13, lineHeight: 1.35 }}
        title="Double-click to edit · drag to move"
        onDoubleClick={(e) => { setAnchor(e.currentTarget); setEditing(true); }}
      >
        {calc && d.body ? (
          <span className="grid grid-cols-[1fr_auto] gap-x-1.5 text-[12px] tabular-nums" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
            {glyph && <span className="col-span-2 mb-0.5" aria-hidden style={{ fontSize: "1.2em" }}>{glyph}</span>}
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
        ) : d.body || d.title ? (
          <>
            {d.title ? (
              <div className="font-bold" style={{ color: GOLD.ink }}>
                {glyph && <span aria-hidden style={glyphStyle}>{glyph}</span>}
                {renderInline(d.title, MEMO_HL)}
              </div>
            ) : null}
            {d.body ? (
              <div style={d.title ? { marginTop: 3 } : undefined}>
                {!d.title && glyph ? <span aria-hidden style={glyphStyle}>{glyph}</span> : null}
                {renderInline(d.body, MEMO_HL)}
              </div>
            ) : null}
          </>
        ) : (
          <span className="italic" style={{ opacity: 0.55 }}>
            {glyph && <span aria-hidden style={glyphStyle}>{glyph}</span>}Double-click to write…
          </span>
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
