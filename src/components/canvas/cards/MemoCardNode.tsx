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
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { ElementChrome, ElementResizer } from "./elements";
import { calcRows } from "../je-logic";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { MEMO_SELF_TARGET } from "../spotlight";
import { NEON } from "../theme";
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

export function MemoCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MemoCard;
  const { update, toFront } = useCardActions(id);
  const rf = useReactFlow();
  const sp = useSpotlight();
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
  const accent = MEMO_ACCENTS[mk] ?? MEMO_ACCENTS.note;
  const Icon = accent.Icon;
  const calc = mk === "calc";

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
        border: `1px solid ${selected ? accent.ink : accent.edge}`,
        boxShadow: selected ? `0 0 18px -6px ${accent.ink}` : "0 10px 24px -12px rgba(0,0,0,0.6)",
        ...spotStyle(stp.state),
        ...dim,
      }}
    >
      <ConnectionDots color={accent.ink} />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={140} minHeight={48} />

      {/* header: kind chip + optional title */}
      <div className="mb-0.5 flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" style={{ color: accent.ink }} />
        {d.title ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold" style={{ color: accent.ink }}>{d.title}</span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: accent.ink, border: `1px solid ${accent.edge}` }}>
          {accent.label}
        </span>
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

      {editing && anchor && (
        <CardPopover anchor={anchor} side="left" onClose={() => setEditing(false)}>
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
  const [mk, setMk] = useState<MemoKind>(memo.memoKind ?? "note");
  const calc = mk === "calc";
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
      <div className="mb-1 flex flex-wrap gap-1">
        {MEMO_KIND_OPTIONS.map((k) => {
          const active = mk === k;
          const a = MEMO_ACCENTS[k];
          return (
            <button
              key={k}
              className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={{ color: active ? a.ink : NEON.muted, background: active ? "rgba(255,255,255,0.06)" : "transparent", border: `1px solid ${active ? a.edge : NEON.borderSoft}` }}
              onClick={() => setMk(k)}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      <textarea
        rows={calc ? 4 : 3}
        autoFocus
        className="w-full resize-none rounded bg-black/30 px-1.5 py-1 leading-snug outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}`, fontSize: calc ? 11 : 11.5, fontFamily: calc ? "ui-monospace, Menlo, Consolas, monospace" : undefined }}
        value={body}
        placeholder={calc ? "500,000 × 8% × 6/12 = 20,000\n(one step per line — = signs align)" : "The memo…"}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
      />
      <input
        className="mt-1 w-full rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] outline-none"
        style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
        value={category}
        placeholder="Category tag (optional)"
        onChange={(e) => setCategory(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="mt-1.5 flex justify-end">
        <button
          className="rounded px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)" }}
          onClick={() => onSave({ title: title.trim() || undefined, body, category: category.trim() || undefined, memoKind: mk })}
        >
          save
        </button>
      </div>
    </div>
  );
}
