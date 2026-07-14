// DESIGN ELEMENTS — the non-card furniture (category "element") plus the
// BRIDGE placeholder cards. Elements never join the deck, never flip, carry no
// teaching settings: chrome is exactly clone · × · position-lock (+ resize).
// Gates are VISUAL PLACEHOLDERS ONLY — real gating ships with World v1.
import { useRef, useState } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { Braces, Copy, GripVertical, HandCoins, Lock, LockOpen, MessageCircleQuestion, Share2, UserRoundPlus, X } from "lucide-react";

import { BaseCard, useCardActions } from "../BaseCard";
import { bus } from "../commands";
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { NEON, NOTE_COLORS, PAPER } from "../theme";
import { renderTokens, TokenMenu } from "../variables";
import type { BridgeCard, GateElement, TextElement } from "../types";

// ---- shared element chrome: clone · × · pos-lock (hover only) ---------------
export function ElementChrome({ id, posLock, selected }: { id: string; posLock?: boolean; selected?: boolean }) {
  const { update, remove, duplicate } = useCardActions(id);
  const btn = (title: string, onClick: () => void, child: React.ReactNode, active?: boolean) => (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag grid h-5 w-5 place-items-center rounded"
      style={{ color: active ? NEON.yellow : NEON.muted }}
    >
      {child}
    </button>
  );
  return (
    <div
      className={`card-actions absolute -top-6 right-0 z-[2] flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity ${selected || posLock ? "opacity-100" : "opacity-0 group-hover/el:opacity-100"}`}
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
    >
      {btn("Duplicate", duplicate, <Copy className="h-3 w-3" />)}
      {btn(
        posLock ? "Unlock position" : "Lock in place",
        () => update({ posLock: !posLock }),
        posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />,
        posLock,
      )}
      {btn("Delete", remove, <X className="h-3 w-3" />)}
    </div>
  );
}

// ---- shared bus-committed resizer (quick resize; one undo step) -------------
export function ElementResizer({ id, selected, minWidth, minHeight, keepAspect = false }: {
  id: string;
  selected?: boolean;
  minWidth: number;
  minHeight: number;
  keepAspect?: boolean;
}) {
  const rf = useReactFlow();
  const start = useRef<{ pos: { x: number; y: number }; w?: number; h?: number } | null>(null);
  return (
    <NodeResizer
      isVisible={!!selected}
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspect}
      lineStyle={{ borderColor: NEON.yellow }}
      handleStyle={{ width: 7, height: 7, borderRadius: 2, background: NEON.yellow, border: "none" }}
      onResizeStart={() => {
        const me = rf.getNode(id);
        if (me) start.current = { pos: { ...me.position }, w: (me.data as { w?: number }).w, h: (me.data as { h?: number }).h };
      }}
      onResizeEnd={(_, p) => {
        const before = start.current;
        start.current = null;
        if (!before) return;
        const apply = (pos: { x: number; y: number }, w: number | undefined, h: number | undefined) =>
          rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { ...pos }, width: w, height: h, data: { ...n.data, w, h } } : n)));
        bus.dispatch({
          label: "resize element",
          do: () => apply({ x: p.x, y: p.y }, Math.max(minWidth, Math.round(p.width)), Math.max(minHeight, Math.round(p.height))),
          undo: () => apply(before.pos, before.w, before.h),
        });
      }}
    />
  );
}

// ---- markdown-lite: **bold**, *italic*, "- " bullets, line breaks -----------
function mdInline(text: string, student: Parameters<typeof renderTokens>[1], keyBase: string): React.ReactNode[] {
  // tokens substitute FIRST-class: split on md markers, render tokens inside
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...renderTokens(text.slice(last, m.index), student));
    const seg = m[0];
    if (seg.startsWith("**")) out.push(<b key={`${keyBase}b${i++}`}>{renderTokens(seg.slice(2, -2), student)}</b>);
    else out.push(<i key={`${keyBase}i${i++}`}>{renderTokens(seg.slice(1, -1), student)}</i>);
    last = m.index + seg.length;
  }
  if (last < text.length) out.push(...renderTokens(text.slice(last), student));
  return out;
}

export function MarkdownLite({ text, student }: { text: string; student: Parameters<typeof renderTokens>[1] }) {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: React.ReactNode[] = [];
  const flush = (k: string) => {
    if (bullets.length) {
      out.push(<ul key={k} className="my-0.5 list-disc pl-4">{bullets}</ul>);
      bullets = [];
    }
  };
  lines.forEach((ln, i) => {
    if (/^\s*-\s+/.test(ln)) {
      bullets.push(<li key={`l${i}`}>{mdInline(ln.replace(/^\s*-\s+/, ""), student, `l${i}`)}</li>);
    } else {
      flush(`u${i}`);
      out.push(<p key={`p${i}`} className="my-0.5 min-h-[0.9em]">{mdInline(ln, student, `p${i}`)}</p>);
    }
  });
  flush("uend");
  return <>{out}</>;
}

// ---- TEXT ELEMENT ------------------------------------------------------------
export function TextElementNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextElement;
  const { update, toFront } = useCardActions(id);
  const ctx = useCanvasSettings();
  const [editing, setEditing] = useState(false);
  const [tokenMenu, setTokenMenu] = useState<HTMLElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const c = NOTE_COLORS[d.color % NOTE_COLORS.length];

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative rounded-lg duration-150"
      style={{
        width: d.w ?? 300,
        minHeight: d.h ?? 60,
        background: "transparent",
        border: `1px ${selected ? "solid" : "dashed"} ${selected ? c.border : "rgba(147,160,180,0.25)"}`,
        padding: "6px 8px",
      }}
    >
      <ConnectionDots />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={140} minHeight={48} />
      {/* GRAB HANDLE (L4): hover grip so a bare text block is easy to grab; the
          padding box drags too. Edit is DOUBLE-click (single click/drag moves). */}
      <div
        className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
        title="Drag to move"
        style={{ color: NEON.muted }}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {editing ? (
        <>
          <textarea
            ref={taRef}
            autoFocus
            rows={Math.max(3, d.body.split("\n").length + 1)}
            className="nodrag nowheel w-full resize-none rounded bg-black/30 px-1.5 py-1 text-[13px] leading-relaxed outline-none"
            style={{ color: "#F4F6FA" }}
            defaultValue={d.body}
            placeholder={"Write… (**bold**, *italic*, - bullets, {first_name})"}
            onBlur={(e) => { if (!tokenMenu) { update({ body: e.target.value }); setEditing(false); } }}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); e.stopPropagation(); }}
          />
          <button
            className="nodrag absolute -bottom-2.5 right-1 grid h-5 w-5 place-items-center rounded"
            style={{ color: NEON.cyan, background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
            title="Insert variable"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setTokenMenu(tokenMenu ? null : e.currentTarget); }}
          >
            <Braces className="h-3 w-3" />
          </button>
          {tokenMenu && (
            <CardPopover anchor={tokenMenu} align="right" onClose={() => setTokenMenu(null)}>
              <TokenMenu
                student={ctx.previewStudent}
                onInsert={(tok) => {
                  const ta = taRef.current;
                  if (ta) {
                    const at = ta.selectionStart ?? ta.value.length;
                    ta.value = ta.value.slice(0, at) + tok + ta.value.slice(ta.selectionEnd ?? at);
                    ta.focus();
                  }
                  setTokenMenu(null);
                }}
              />
            </CardPopover>
          )}
        </>
      ) : (
        <div
          className="cursor-text text-[13px] leading-relaxed"
          style={{ color: d.color === 0 ? "#F4F6FA" : c.name === "amber" ? "#F5D48F" : "#BBD3F5", fontFamily: "'Inter', system-ui, sans-serif" }}
          title="Click to edit"
          onClick={() => setEditing(true)}
        >
          {d.body ? <MarkdownLite text={d.body} student={ctx.previewStudent} /> : <span style={{ opacity: 0.4, fontStyle: "italic" }}>Text…</span>}
        </div>
      )}
      {/* accent swatches on hover */}
      <div className="card-actions absolute -bottom-5 left-1 flex gap-1 opacity-0 transition-opacity group-hover/el:opacity-100">
        {NOTE_COLORS.map((nc, i) => (
          <button
            key={nc.name}
            className="nodrag h-3 w-3 rounded-full"
            style={{ background: nc.ink, opacity: i === d.color ? 1 : 0.35, border: `1px solid ${NEON.borderSoft}` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => update({ color: i })}
            title={nc.name}
          />
        ))}
      </div>
    </div>
  );
}

// ---- GATE ELEMENTS (visual placeholders — World v1 does the real gating) ----
export function GateNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GateElement;
  const { update, toFront } = useCardActions(id);
  const pay = d.kind === "paygate";
  const edge = pay ? "#E8B84B" : NEON.cyan;
  const [editing, setEditing] = useState(false);
  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative duration-150"
      style={{ width: d.w ?? 640, height: 46 }}
    >
      <ConnectionDots color={edge} />
      <ElementChrome id={id} posLock={d.posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={260} minHeight={46} />
      {/* the boundary banner: gold/red gate treatment, theme-consistent */}
      <div
        className="flex h-full w-full items-center gap-2 rounded-md px-3"
        style={{
          background: pay
            ? "repeating-linear-gradient(45deg, rgba(232,184,75,0.16) 0 10px, rgba(206,17,38,0.12) 10px 20px)"
            : "repeating-linear-gradient(45deg, rgba(79,163,227,0.14) 0 10px, rgba(20,33,61,0.4) 10px 20px)",
          border: `1.5px solid ${edge}`,
          boxShadow: `0 0 18px -6px ${edge}`,
        }}
      >
        {pay ? <HandCoins className="h-4 w-4 shrink-0" style={{ color: edge }} /> : <UserRoundPlus className="h-4 w-4 shrink-0" style={{ color: edge }} />}
        {editing ? (
          <input
            autoFocus
            className="nodrag min-w-0 flex-1 bg-black/30 px-1 text-[13px] font-bold uppercase tracking-[0.14em] outline-none"
            style={{ color: "#F4EFE6" }}
            defaultValue={d.label}
            onBlur={(e) => { update({ label: e.target.value }); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { update({ label: (e.target as HTMLInputElement).value }); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <span
            className="nodrag min-w-0 flex-1 cursor-text truncate text-[13px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "#F4EFE6", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
            title="Click to edit the gate label"
            onClick={() => setEditing(true)}
          >
            {d.label}
          </span>
        )}
        <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title="Visual placeholder — real gating ships with World v1">
          placeholder
        </span>
      </div>
    </div>
  );
}

// ---- BRIDGE PLACEHOLDERS (deckable cards; no backend yet) --------------------
const BRIDGE_META = {
  asklee: { title: "Ask Lee", desc: "Send Lee a question right from this lesson.", icon: MessageCircleQuestion, cta: "Ask a question" },
  submitproblem: { title: "Submit a Problem", desc: "Photograph your textbook problem — get it solved.", icon: HandCoins, cta: "Submit a problem" },
  shareinvite: { title: "Share / Invite", desc: "Send this to a classmate who's cramming too.", icon: Share2, cta: "Share" },
} as const;

export function BridgeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BridgeCard;
  const meta = BRIDGE_META[d.kind];
  const Icon = meta.icon;
  return (
    <BaseCard id={id} data={d} selected={selected} accent="#E8B84B" noEditBtn noResize fixedWidth={280} kindBadge="soon">
      <div className="flex flex-col items-center gap-1.5 py-2 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "rgba(20,33,61,0.08)", border: "1px solid rgba(20,33,61,0.2)" }}>
          <Icon className="h-5 w-5" style={{ color: PAPER.navy }} />
        </span>
        <div className="text-[15px] font-bold" style={{ color: PAPER.navy, fontFamily: "'Poppins', 'Inter', sans-serif" }}>{meta.title}</div>
        <p className="px-2 text-[11px] leading-snug" style={{ color: PAPER.inkMuted }}>{meta.desc}</p>
        <button
          className="mt-1 cursor-not-allowed rounded-full px-3 py-1 text-[11px] font-bold opacity-50"
          style={{ color: "#FFFFFF", background: PAPER.navy }}
          title="Coming soon"
          disabled
        >
          {meta.cta}
        </button>
      </div>
    </BaseCard>
  );
}
