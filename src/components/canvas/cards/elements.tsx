// DESIGN ELEMENTS — the non-card furniture (category "element") plus the
// BRIDGE placeholder cards. Elements never join the deck, never flip, carry no
// teaching settings: chrome is exactly clone · × · position-lock (+ resize).
// Gates are VISUAL PLACEHOLDERS ONLY — real gating ships with World v1.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { AlignCenter, AlignLeft, Braces, Copy, GripVertical, HandCoins, Lock, LockOpen, MessageCircleQuestion, Share2, SunDim, UserRoundPlus, Volume2, X } from "lucide-react";

import { useFrameNav } from "../FrameNavContext";
import { playSfx } from "../sfx";

import { BaseCard, useCardActions } from "../BaseCard";
import { bus } from "../commands";
import { CardPopover } from "../CardPopover";
import { ConnectionDots } from "../ConnectionDots";
import { useSpotTarget, spotStyle } from "../SpotlightContext";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { BIG_FONT, DISPLAY_FONT, NEON, NOTE_COLORS, PAPER } from "../theme";
import { useEditSignal } from "../ui";
import { renderTokens, TokenMenu } from "../variables";
import type { BridgeCard, CeqTeaseElement, ExamCueElement, GateElement, TextElement } from "../types";

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
  const re = /(~~[^~]+~~|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...renderTokens(text.slice(last, m.index), student));
    const seg = m[0];
    if (seg.startsWith("~~")) out.push(<s key={`${keyBase}s${i++}`} style={{ textDecoration: "line-through" }}>{renderTokens(seg.slice(2, -2), student)}</s>);
    else if (seg.startsWith("**")) out.push(<b key={`${keyBase}b${i++}`}>{renderTokens(seg.slice(2, -2), student)}</b>);
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
  const rf = useReactFlow();
  const nav = useFrameNav();
  const [editing, setEditing] = useState(false);
  const [tokenMenu, setTokenMenu] = useState<HTMLElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const c = NOTE_COLORS[d.color % NOTE_COLORS.length];
  // SPOTLIGHT (Lee): a text block is a single "self" target — Ctrl+click to pill,
  // Ctrl+Shift+click to super-flame, live while filming.
  const spot = useSpotTarget(id, "self");
  // CLEAN SHOT (Lee): a SPOTLIT text block in FILM drops its edit chrome (border,
  // resize box, grab handle, edit tooltip) so it reads clean on camera and the
  // spotlight scale spills past the box.
  const cleanShot = spot.state === "spot"; // clean whenever spotlit (film + authoring rehearsal)
  // KEYPAD SFX (Lee): play the keypad cue when this text enters its frame in FILM.
  const inCurrentFrame = nav.currentFrameId != null && rf.getNode(id)?.parentId === nav.currentFrameId;
  const wasInFrame = useRef(false);
  useEffect(() => {
    if (nav.film && inCurrentFrame && !wasInFrame.current && d.keypadSfx) playSfx("keypad");
    wasInFrame.current = inCurrentFrame;
  }, [inCurrentFrame, nav.film, d.keypadSfx]);
  useEditSignal((data as { _editSeq?: number })._editSeq, () => setEditing(true)); // F2 global edit (item 4)

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative rounded-lg duration-150"
      style={{
        width: d.w ?? 300,
        minHeight: d.h ?? 60,
        background: "transparent",
        border: cleanShot ? "1px solid transparent" : `1px ${selected ? "solid" : "dashed"} ${selected ? c.border : "rgba(147,160,180,0.25)"}`,
        padding: "6px 8px",
        overflow: "visible",
      }}
    >
      <ConnectionDots />
      {!cleanShot && <ElementChrome id={id} posLock={d.posLock} selected={selected} />}
      <ElementResizer id={id} selected={selected && !cleanShot} minWidth={140} minHeight={48} />
      {/* GRAB HANDLE (L4): hover grip so a bare text block is easy to grab; the
          padding box drags too. Edit is DOUBLE-click. Hidden on a clean shot. */}
      {!cleanShot && (
      <div
        className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
        title="Drag to move"
        style={{ color: NEON.muted }}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      )}
      {editing ? (
        <>
          <textarea
            ref={taRef}
            autoFocus
            rows={Math.max(3, d.body.split("\n").length + 1)}
            className="nodrag nowheel w-full resize-none rounded bg-black/30 px-1.5 py-1 text-[13px] leading-relaxed outline-none"
            style={{ color: "#F4F6FA", fontFamily: DISPLAY_FONT }}
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
          {...spot.props}
          className={`text-[13px] leading-relaxed${cleanShot ? "" : " cursor-text"}`}
          style={{ textAlign: d.align === "center" ? "center" : "left", color: d.faded ? "rgba(158,168,184,0.5)" : d.color === 0 ? "#F4F6FA" : c.name === "amber" ? "#F5D48F" : "#BBD3F5", fontFamily: DISPLAY_FONT, ...spotStyle(spot.state) }}
          title={cleanShot ? undefined : "Click to edit"}
          onClick={() => { if (!cleanShot) setEditing(true); }}
        >
          {d.body ? <MarkdownLite text={d.body} student={ctx.previewStudent} /> : <span style={{ opacity: 0.4, fontStyle: "italic" }}>Text…</span>}
        </div>
      )}
      {/* accent swatches + fade toggle on hover */}
      <div className="card-actions absolute -bottom-5 left-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/el:opacity-100">
        <button
          className="nodrag grid h-4 w-4 place-items-center rounded"
          style={{ color: d.faded ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ faded: !d.faded })}
          title={d.faded ? "Faded (greyed out) — click for full colour" : "Fade to grey (de-emphasize)"}
        >
          <SunDim className="h-3 w-3" />
        </button>
        {/* ALIGN (Lee) — left ↔ centre */}
        <button
          className="nodrag grid h-4 w-4 place-items-center rounded"
          style={{ color: d.align === "center" ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ align: d.align === "center" ? "left" : "center" })}
          title={d.align === "center" ? "Centred (click to left-align)" : "Left-aligned (click to centre)"}
        >
          {d.align === "center" ? <AlignCenter className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
        </button>
        {/* KEYPAD SFX (Lee) — reveal in film plays the keypad cue */}
        <button
          className="nodrag grid h-4 w-4 place-items-center rounded"
          style={{ color: d.keypadSfx ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ keypadSfx: !d.keypadSfx })}
          title={d.keypadSfx ? "Keypad sound on — plays when revealed in film (click to turn off)" : "Keypad sound — play a keypad cue when this reveals in film"}
        >
          <Volume2 className="h-3 w-3" />
        </button>
        <span className="mx-0.5 h-3 w-px" style={{ background: NEON.borderSoft }} />
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

// ---- EXAM CUE (Lee) — a big emoji-illustration callout that HOOKS a common-exam
//      -question frame: a bouncing sheet of paper + "Your exam" + a red "on the
//      exam" tag, so students feel they'll meet this on the real test. Design
//      element: resizable, spotlightable (Ctrl+click) / super-spotlightable
//      (Ctrl+Shift+click), never in the deck. ----
const EXAMCUE_CSS = `
@keyframes sa-examcue-bounce { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-15px) rotate(3deg); } }
`;
const EXAM_EMOJIS = ["📄", "📝", "🧾", "📋", "✍️", "🎯", "⏰", "🔥", "💰", "💯", "⭐"];

export function ExamCueNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ExamCueElement;
  const { update, toFront } = useCardActions(id);
  const nav = useFrameNav();
  const [editing, setEditing] = useState(false);
  // SPOTLIGHT: whole-element "self" target — Ctrl+click pills it, Ctrl+Shift+click
  // super-flames it, live while filming.
  const spot = useSpotTarget(id, "self");
  // CLEAN SHOT (Lee): spotlit-in-film drops the resize box / grab / edit tooltip
  // (the design callout border stays — it's the look, not edit chrome).
  const cleanShot = spot.state === "spot"; // clean whenever spotlit (film + authoring rehearsal)
  useEditSignal((data as { _editSeq?: number })._editSeq, () => setEditing(true)); // F2 global edit
  const emoji = d.emoji || "📄";
  const w = d.w ?? 300;
  const h = d.h ?? 230;
  const emojiPx = Math.max(44, Math.min(150, h * 0.34));
  const labelPx = Math.max(20, Math.min(72, w * 0.14));

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/el animate-in fade-in relative duration-150"
      style={{ width: w, minHeight: h }}
    >
      <style>{EXAMCUE_CSS}</style>
      <ConnectionDots />
      {!cleanShot && <ElementChrome id={id} posLock={d.posLock} selected={selected} />}
      <ElementResizer id={id} selected={selected && !cleanShot} minWidth={180} minHeight={170} keepAspect />
      {/* GRAB HANDLE — a clear affordance; the whole box drags too. Hidden clean. */}
      {!cleanShot && (
      <div
        className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
        title="Drag to move"
        style={{ color: NEON.muted }}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      )}

      {/* the callout — spotlight wraps the whole thing */}
      <div
        {...spot.props}
        className="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-3xl px-4 py-5 text-center"
        style={{
          minHeight: h,
          // noPlate (Lee): drop the plate + border so it's JUST the bouncing emoji
          // (and whatever label/tag are still enabled) — more layout flexibility.
          background: d.noPlate ? "transparent" : "radial-gradient(ellipse at 50% 20%, rgba(30,42,74,0.85), rgba(9,13,26,0.9))",
          border: d.noPlate ? "none" : `1.5px solid rgba(224,40,74,0.45)`,
          boxShadow: d.noPlate ? "none" : "0 18px 44px -18px rgba(0,0,0,0.7)",
          ...spotStyle(spot.state),
        }}
      >
        <span
          aria-hidden
          style={{ fontSize: emojiPx, lineHeight: 1, animation: "sa-examcue-bounce 1.5s ease-in-out infinite", filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.55))" }}
        >
          {emoji}
        </span>
        {d.showLabel === false ? null : editing ? (
          <input
            autoFocus
            className="nodrag w-[85%] rounded bg-black/30 px-2 py-1 text-center outline-none"
            style={{ color: "#F4EFE6", fontFamily: BIG_FONT, fontWeight: 800, fontSize: Math.min(labelPx, 34), letterSpacing: "-0.01em" }}
            defaultValue={d.label}
            placeholder="Your exam"
            onBlur={(e) => { update({ label: e.target.value }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { update({ label: (e.target as HTMLInputElement).value }); setEditing(false); } if (e.key === "Escape") setEditing(false); e.stopPropagation(); }}
          />
        ) : (
          <span
            className={`leading-none${cleanShot ? "" : " cursor-text"}`}
            style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: labelPx, letterSpacing: "-0.01em", color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
            title={cleanShot ? undefined : "Double-click to edit"}
            onDoubleClick={() => setEditing(true)}
          >
            {d.label || "Your exam"}
          </span>
        )}
        {d.showTag !== false && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]"
            style={{ color: "#FFFFFF", background: "rgba(224,40,74,0.92)", boxShadow: "0 0 16px rgba(224,40,74,0.55)" }}
          >
            You'll see this on the exam
          </span>
        )}
      </div>

      {/* emoji swatches + text/tag toggles on hover */}
      <div className="card-actions absolute -bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg px-1.5 py-1 opacity-0 transition-opacity group-hover/el:opacity-100" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}>
        <button
          className="nodrag grid h-5 w-5 place-items-center rounded text-[10px] font-black"
          style={{ color: d.showLabel === false ? NEON.muted : NEON.yellow, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ showLabel: d.showLabel === false }); }}
          title={d.showLabel === false ? "Text hidden — click to show the label" : "Hide the label (show just the emoji)"}
        >
          Aa
        </button>
        <button
          className="nodrag grid h-5 place-items-center rounded px-1 text-[8px] font-black uppercase"
          style={{ color: d.showTag === false ? NEON.muted : NEON.yellow, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ showTag: d.showTag === false }); }}
          title={d.showTag === false ? "Tag hidden — click to show it" : "Hide the 'on the exam' tag"}
        >
          tag
        </button>
        <button
          className="nodrag grid h-5 place-items-center rounded px-1 text-[8px] font-black uppercase"
          style={{ color: d.noPlate ? NEON.muted : NEON.yellow, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ noPlate: !d.noPlate }); }}
          title={d.noPlate ? "Plate hidden — click to show the background shape" : "Hide the background plate (just the bouncing emoji)"}
        >
          plate
        </button>
        <button
          className="nodrag grid h-5 place-items-center rounded px-1 text-[8px] font-black"
          style={{ color: NEON.green, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ label: "Easy Points!", emoji: "🎯", showLabel: true, showTag: false }); }}
          title="Preset: 'Easy Points!' callout"
        >
          ⚡ Easy
        </button>
        <span className="mx-0.5 h-4 w-px" style={{ background: NEON.borderSoft }} />
        {EXAM_EMOJIS.map((em) => (
          <button
            key={em}
            className="nodrag grid h-5 w-5 place-items-center rounded text-[13px]"
            style={{ background: emoji === em ? "rgba(252,163,17,0.2)" : "transparent" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); update({ emoji: em }); }}
            title={`Use ${em}`}
          >
            {em}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- CEQ TEASE (Lee): floating exam icon + auto-scaling question on an OPAQUE
//      plate that covers the baked-in SURVIVE watermark. The text shrinks to fit
//      the plate — the container wins, never the text. ----
const CEQ_TEASE_EMOJIS = ["📝", "📄", "🧾", "✍️", "🎯", "❓", "📋"];

export function CeqTeaseNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CeqTeaseElement;
  const { update, toFront } = useCardActions(id);
  const ctx = useCanvasSettings();
  const nav = useFrameNav();
  const [editing, setEditing] = useState(false);
  const spot = useSpotTarget(id, "self");
  const cleanShot = spot.state === "spot"; // clean whenever spotlit (film + authoring rehearsal)
  useEditSignal((data as { _editSeq?: number })._editSeq, () => setEditing(true));
  const w = d.w ?? 720;
  const h = d.h ?? 150;
  const emoji = d.emoji || "📝";
  const iconBox = Math.max(52, Math.min(h - 26, 150));

  // AUTO-FIT: measure the question at its base size, then a transform scales it
  // DOWN to fit the text column (never up — the container wins).
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const box = boxRef.current, el = textRef.current;
    if (!box || !el) return;
    const prev = el.style.transform;
    el.style.transform = "none";
    const natW = el.scrollWidth, natH = el.scrollHeight;
    el.style.transform = prev;
    const s = Math.min(1, (box.clientWidth || natW) / (natW || 1), (box.clientHeight || natH) / (natH || 1));
    setScale(s > 0 && Number.isFinite(s) ? s : 1);
  }, [d.text, w, h, emoji, editing]);

  return (
    <div onPointerDownCapture={toFront} className="group/el animate-in fade-in relative duration-150" style={{ width: w, height: h }}>
      <style>{EXAMCUE_CSS}</style>
      <ConnectionDots />
      {!editing && !cleanShot && <ElementChrome id={id} posLock={d.posLock} selected={selected} />}
      <ElementResizer id={id} selected={selected && !cleanShot} minWidth={260} minHeight={90} />
      {!cleanShot && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {/* OPAQUE plate — covers the baked-in SURVIVE watermark */}
      <div
        {...spot.props}
        className="flex h-full w-full items-center gap-3 rounded-3xl px-4"
        style={{ background: "linear-gradient(135deg, #12203E, #070C1A)", border: "1.5px solid rgba(120,150,210,0.28)", boxShadow: "0 18px 44px -18px rgba(0,0,0,0.8)", ...spotStyle(spot.state) }}
      >
        {/* floating exam icon */}
        <div className="grid shrink-0 place-items-center rounded-2xl" style={{ width: iconBox, height: iconBox, background: "radial-gradient(ellipse at 40% 30%, rgba(45,64,110,0.92), rgba(12,18,36,0.96))", border: "1px solid rgba(120,150,210,0.32)" }}>
          <span aria-hidden style={{ fontSize: iconBox * 0.52, lineHeight: 1, animation: "sa-examcue-bounce 1.6s ease-in-out infinite", filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.55))" }}>{emoji}</span>
        </div>
        {/* the question — auto-scales down to fit the column */}
        <div ref={boxRef} className="relative flex min-w-0 flex-1 items-center overflow-hidden" style={{ height: "100%" }}>
          {editing ? (
            <textarea
              autoFocus
              className="nodrag nowheel h-[82%] w-full resize-none rounded bg-black/30 px-2 py-1 outline-none"
              style={{ color: "#F4EFE6", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em" }}
              defaultValue={d.text}
              placeholder={'"What type of account is ___?"'}
              onBlur={(e) => { update({ text: e.target.value }); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); update({ text: (e.target as HTMLTextAreaElement).value }); setEditing(false); } if (e.key === "Escape") setEditing(false); e.stopPropagation(); }}
            />
          ) : (
            <div
              ref={textRef}
              className={`w-full whitespace-pre-line leading-tight${cleanShot ? "" : " cursor-text"}`}
              style={{ transform: `scale(${scale})`, transformOrigin: "left center", fontFamily: BIG_FONT, fontWeight: 800, letterSpacing: "-0.01em", fontSize: 46, color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
              title={cleanShot ? undefined : "Double-click to edit"}
              onDoubleClick={() => setEditing(true)}
            >
              {d.text ? renderTokens(d.text, ctx.previewStudent) : <span style={{ opacity: 0.5 }}>&quot;What type of account is ___?&quot;</span>}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <div className="nodrag absolute -bottom-7 left-2 flex items-center gap-0.5 rounded-lg px-1 py-0.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }} onPointerDown={(e) => e.stopPropagation()}>
          {CEQ_TEASE_EMOJIS.map((em) => (
            <button key={em} className="nodrag grid h-5 w-5 place-items-center rounded text-[13px]" style={{ background: emoji === em ? "rgba(252,163,17,0.2)" : "transparent" }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); update({ emoji: em }); }} title={`Use ${em}`}>{em}</button>
          ))}
        </div>
      )}
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
              // LV2 item 6: plain Enter commits; Shift+Enter reserved for line breaks.
              if (e.key === "Enter" && !e.shiftKey) { update({ label: (e.target as HTMLInputElement).value }); setEditing(false); }
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
