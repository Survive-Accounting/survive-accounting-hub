// COURSE OUTLINE — the SNAKE (V2), fit-first. Frame 2 of every lesson's Hook, so
// it rides in every video. DERIVED, never typed: it self-fetches the course tree
// and lays the bound course's chapters (in order, real titles) as steps that flow
// left→right, wrap and reverse right→left (boustrophedon), AUTO-FITTING steps-per-
// row so all lessons fit inside the card without clipping or illegible shrink.
//
// EMPHASIS BY SIZE: the CURRENT lesson renders largest with brand glow; its
// neighbours normal; the rest quiet. The final lesson ("Lock It In") gets its own
// summit treatment — a touch larger than normal + a flag, so it reads as the
// destination even when it isn't current. GATE: paid lessons (past freeThrough)
// desaturate; a compact boundary marker + "Requires study pass" sits between the
// last free and first paid step. SAFE ZONES: the snake band clears the camera
// corner (top-left) and watermark (bottom-right). FILM-CLEAN chromeless shell.
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeResizer, useReactFlow } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Flag, Lightbulb, Lock, LockOpen, Minus, Plus, MapPin, Settings2, X } from "lucide-react";

import { CardScaleHandle, useCardActions, useCardScale } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { ConnectionDots } from "../ConnectionDots";
import { attachMemo } from "../MemoLightbulb";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { gateMarker, outlineSteps, type StepPos } from "../outline-snake";
import { fetchJeBrowserTree } from "@/lib/je-api";
import { NEON, PAPER } from "../theme";
import type { OutlineCard } from "../types";

interface Lesson { n: number; num: number | null; title: string; free: boolean }

const VBW = 1600;
const VBH = 900; // 16:9 viewBox for the connector overlay
const GOLD = "#E8B84B";
const NAVY = "#14213D";

/** Best-effort: walk up from the card to its containing lesson and pull a chapter
 *  number out of the lesson's label ("Ch 4 · …" → 4). Returns the 1-based step. */
function useAutoHere(id: string, lessons: Lesson[]): number | null {
  const rf = useReactFlow();
  let node = rf.getNode(id) as { parentId?: string; data?: unknown; type?: string } | undefined;
  let guard = 0;
  while (node?.parentId && guard++ < 6) {
    const p = rf.getNode(node.parentId) as { parentId?: string; data?: unknown; type?: string } | undefined;
    if (!p) break;
    if (p.type === "lesson") {
      const label = String((p.data as { label?: string } | undefined)?.label ?? "");
      const m = label.match(/ch(?:apter)?\.?\s*(\d+)/i) ?? label.match(/\b(\d+)\b/);
      if (m) {
        const num = parseInt(m[1], 10);
        const idx = lessons.findIndex((l) => l.num === num);
        if (idx >= 0) return idx + 1;
      }
      return null;
    }
    node = p;
  }
  return null;
}

export function OutlineCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as OutlineCard;
  const { update, remove, toFront, duplicate, addToDeck, tuck } = useCardActions(id);
  const rf = useReactFlow();
  const ctx = useCanvasSettings();
  const sp = useSpotlight();
  const scale = useCardScale(id, d);
  const dim = useCardDim(id);
  const [gear, setGear] = useState<HTMLElement | null>(null);

  const courseId = d.courseId ?? ctx.courseId;
  const tree = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 60_000 });
  const freeThrough = d.freeThrough ?? 8;
  const w = d.w ?? 900;
  const layout = d.layout === "grid" ? "grid" : "snake"; // legacy "staircase" → snake

  const course = tree.data?.courses.find((c) => c.id === courseId);
  const lessons: Lesson[] = (course?.chapters ?? [])
    .filter((ch) => ch.id !== "__unassigned__" && (ch.status ?? "active") !== "archived")
    .slice()
    .sort((a, b) => (a.chapter_number ?? 9999) - (b.chapter_number ?? 9999))
    .slice(0, 15)
    .map((ch, i) => ({ n: i + 1, num: ch.chapter_number, title: ch.chapter_name?.trim() || `Lesson ${i + 1}`, free: i < freeThrough }));

  const { steps } = outlineSteps(lessons.length, {
    layout,
    stepsPerRow: d.stepsPerRow ?? null,
    gateAt: freeThrough,
  });
  const autoHere = useAutoHere(id, lessons);
  const hereIdx = d.hereOverride ?? autoHere; // 1-based, or null
  const lastIdx = lessons.length - 1; // the destination ("Lock It In")

  const firstPaid = lessons.findIndex((l) => !l.free);
  const gate = firstPaid > 0 && firstPaid < steps.length
    ? gateMarker(steps[firstPaid - 1], steps[firstPaid])
    : null;

  const iconBtn = "nodrag grid h-5 w-5 place-items-center rounded";
  const iconStyle = { color: PAPER.inkMuted, background: "rgba(251,249,244,0.92)", border: `1px solid ${PAPER.cardEdge}` } as const;

  return (
    <div
      onPointerDownCapture={toFront}
      className="group/outline animate-in fade-in zoom-in-95 relative select-none rounded-xl duration-150"
      style={{
        width: w,
        background: PAPER.card,
        border: `1px solid ${selected ? GOLD : PAPER.cardEdge}`,
        boxShadow: selected ? `0 0 0 1.5px ${GOLD}, 0 14px 34px -14px rgba(0,0,0,0.65)` : "0 12px 32px -14px rgba(0,0,0,0.6)",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
        ...dim,
      }}
    >
      <ConnectionDots color={GOLD} />
      <NodeResizer
        isVisible={!!selected}
        keepAspectRatio
        minWidth={360}
        lineStyle={{ borderColor: GOLD }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: GOLD, border: "none" }}
        onResize={(_, p) => update({ w: Math.round(p.width), h: Math.round(p.height) })}
      />

      {/* hover actions — all authoring chrome (film hides `.card-actions`) */}
      <div className="card-actions absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/outline:opacity-100">
        <span className="mr-1 rounded px-1 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: GOLD, border: `1px solid ${GOLD}66` }}>Outline</span>
        <button title="Outline settings" className={iconBtn} style={iconStyle} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setGear(gear ? null : e.currentTarget); }}><Settings2 className="h-3 w-3" /></button>
        <button title="Attach a memo" className={iconBtn} style={iconStyle} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); attachMemo(rf, id, "r"); }}><Lightbulb className="h-3 w-3" /></button>
        {d.deckMember ? (
          <button title="Tuck into deck (s)" className={iconBtn} style={iconStyle} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); tuck(); }}><Minus className="h-3 w-3" /></button>
        ) : (
          <button title="Add to deck" className={iconBtn} style={iconStyle} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addToDeck(); }}><Plus className="h-3 w-3" /></button>
        )}
        <button title="Duplicate" className={iconBtn} style={iconStyle} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); duplicate(); }}><Copy className="h-3 w-3" /></button>
        <button title={d.posLock ? "Unlock position" : "Lock in place"} className={iconBtn} style={{ ...iconStyle, color: d.posLock ? "#8A5A00" : PAPER.inkMuted }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); update({ posLock: !d.posLock }); }}>{d.posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}</button>
        <button title="Delete" className={iconBtn} style={{ ...iconStyle, color: PAPER.red }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(); }}><X className="h-3 w-3" /></button>
      </div>

      {gear && (
        <CardPopover anchor={gear} side="left" onClose={() => setGear(null)}>
          <OutlineSettings
            d={d}
            courseName={course?.course_name ?? ctx.courseName}
            lessonCount={lessons.length}
            onUpdate={update}
            onClose={() => setGear(null)}
          />
        </CardPopover>
      )}

      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 9", background: "transparent" }}>
        {/* the snake path through the steps + the compact gate tick */}
        <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <polyline
            points={steps.map((s) => `${s.x * VBW},${s.y * VBH}`).join(" ")}
            fill="none"
            stroke={PAPER.line}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {gate && (
            <line
              x1={gate.x1 * VBW} y1={gate.y1 * VBH} x2={gate.x2 * VBW} y2={gate.y2 * VBH}
              stroke={PAPER.red} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* compact "Requires study pass" label at the gate boundary */}
        {gate && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ left: `${gate.labelX * 100}%`, top: `${gate.labelY * 100}%`, color: PAPER.red, background: "rgba(194,24,50,0.1)", border: `1px solid ${PAPER.red}66` }}
          >
            <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />Requires study pass
          </div>
        )}

        {/* steps */}
        {lessons.map((l, i) => {
          const p: StepPos = steps[i] ?? { x: 0.5, y: 0.5 };
          const here = hereIdx === l.n;
          const isDest = i === lastIdx && lessons.length > 1;
          const neighbor = hereIdx != null && Math.abs(l.n - hereIdx) === 1;
          const st = spotTargetProps(sp, id, `step:${l.n}`);
          const spotOn = st.state === "spot";
          // EMPHASIS BY SIZE: current biggest, destination a summit, neighbours
          // normal, the rest quiet (dimmed). Spotlight overrides to current-size.
          const emphasized = here || spotOn;
          const stepScale = here || spotOn ? 1.42 : isDest ? 1.2 : neighbor ? 1.06 : 1;
          const quiet = !emphasized && !isDest && !neighbor;
          const badgeBg = l.free ? GOLD : "#C9CBD1";
          const ring = here || spotOn ? PAPER.red : isDest ? "#8A5A00" : l.free ? "rgba(58,42,0,0.35)" : "#9AA1AC";
          return (
            <div
              key={l.n}
              {...st.props}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center transition-transform duration-200"
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                width: 128,
                transform: `translate(-50%,-50%) scale(${stepScale})`,
                zIndex: here || spotOn ? 40 : isDest ? 30 : 10 + i,
                filter: l.free ? undefined : "grayscale(1)",
                opacity: st.state === "dim" ? 0.6 : quiet ? 0.8 : l.free ? 1 : 0.82,
                ...spotStyle(st.state),
              }}
            >
              {here && <MapPin className="h-3.5 w-3.5" style={{ color: PAPER.red }} />}
              {isDest && !here && <Flag className="h-3.5 w-3.5" style={{ color: "#8A5A00" }} fill="#E8B84B" />}
              <div
                className="grid place-items-center rounded-full font-black tabular-nums"
                style={{
                  height: isDest && !here ? 36 : 32,
                  width: isDest && !here ? 36 : 32,
                  fontSize: isDest && !here ? 14 : 13,
                  color: l.free ? "#3A2A00" : "#4A4A4A",
                  background: badgeBg,
                  border: `${here || spotOn ? 2.5 : isDest ? 2.5 : 2}px solid ${ring}`,
                  boxShadow: emphasized
                    ? `0 0 0 3px rgba(232,184,75,0.4), 0 6px 18px -4px rgba(0,0,0,0.55)`
                    : isDest
                      ? `0 0 0 2px rgba(232,184,75,0.3), 0 4px 12px -4px rgba(0,0,0,0.5)`
                      : "0 3px 8px -3px rgba(0,0,0,0.4)",
                }}
              >
                {l.num ?? l.n}
              </div>
              <div
                className="line-clamp-2 leading-tight"
                style={{
                  fontFamily: "'Poppins','Inter',system-ui,sans-serif",
                  fontSize: here || spotOn ? 12 : 10.5,
                  fontWeight: here || spotOn || isDest ? 800 : 600,
                  color: here || spotOn ? NAVY : isDest ? "#5A4300" : l.free ? PAPER.ink : "#6B7280",
                  textShadow: emphasized || isDest ? "0 1px 6px rgba(255,255,255,0.9)" : undefined,
                }}
              >
                {l.title}
              </div>
              {isDest && <span className="text-[7.5px] font-bold uppercase tracking-widest" style={{ color: "#8A5A00" }}>the summit</span>}
            </div>
          );
        })}

        {/* empty / unbound states — authoring only */}
        {tree.isLoading && <Centered muted>loading course…</Centered>}
        {!tree.isLoading && !course && <Centered muted>Set the scene course to derive this outline</Centered>}
        {!tree.isLoading && course && lessons.length === 0 && <Centered muted>No chapters in {course.course_name ?? "this course"} yet</Centered>}
      </div>

      <CardScaleHandle scale={scale} onScale={(s) => update({ scale: s })} />
    </div>
  );
}

function Centered({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px]" style={{ color: muted ? PAPER.inkMuted : PAPER.ink }}>
      {children}
    </div>
  );
}

/** Outline settings — steps-per-row (auto | manual), grid fallback, free-through
 *  gate, and the you-are-here override. */
function OutlineSettings({ d, courseName, lessonCount, onUpdate, onClose }: {
  d: OutlineCard;
  courseName: string | null;
  lessonCount: number;
  onUpdate: (p: Partial<OutlineCard>) => void;
  onClose: () => void;
}) {
  const row = "flex items-center justify-between gap-2 py-1 text-[11.5px]";
  const on = (v: boolean) => ({ color: v ? NEON.yellow : NEON.muted, background: v ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${v ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` });
  const freeThrough = d.freeThrough ?? 8;
  const layout = d.layout === "grid" ? "grid" : "snake";
  const auto = d.stepsPerRow == null;
  return (
    <div className="nodrag w-64 rounded-lg p-2.5 shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Course outline</div>
      <p className="mb-1.5 text-[10px] leading-snug" style={{ color: NEON.muted }}>
        Derived from <b style={{ color: NEON.text }}>{courseName ?? "the scene course"}</b> — {lessonCount} lesson{lessonCount === 1 ? "" : "s"}, laid as a {layout}.
      </p>

      <div className={row}>
        <span>Layout</span>
        <div className="flex gap-0.5">
          {(["snake", "grid"] as const).map((l) => (
            <button key={l} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={on(layout === l)} onClick={() => onUpdate({ layout: l })}>{l}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 py-1 text-[11.5px]">
        <span>Steps per row</span>
        <div className="flex items-center gap-1">
          <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={on(auto)} onClick={() => onUpdate({ stepsPerRow: null })}>auto</button>
          <input
            type="number" min={1} max={8} placeholder="#"
            value={d.stepsPerRow ?? ""}
            onChange={(e) => { const v = Number(e.target.value); onUpdate({ stepsPerRow: v >= 1 ? Math.min(8, v) : null }); }}
            className="w-12 rounded px-1.5 py-0.5 text-right tabular-nums outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 py-1 text-[11.5px]">
        <span>Free through lesson</span>
        <input
          type="number" min={0} max={15} value={freeThrough}
          onChange={(e) => onUpdate({ freeThrough: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })}
          className="w-14 rounded px-1.5 py-0.5 text-right tabular-nums outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 py-1 text-[11.5px]">
        <span>You-are-here</span>
        <div className="flex items-center gap-1">
          <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={on(d.hereOverride == null)} onClick={() => onUpdate({ hereOverride: null })}>auto</button>
          <input
            type="number" min={1} max={lessonCount || 15} placeholder="#"
            value={d.hereOverride ?? ""}
            onChange={(e) => { const v = Number(e.target.value); onUpdate({ hereOverride: v >= 1 ? v : null }); }}
            className="w-12 rounded px-1.5 py-0.5 text-right tabular-nums outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex justify-end">
        <button className="rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>done</button>
      </div>
    </div>
  );
}
