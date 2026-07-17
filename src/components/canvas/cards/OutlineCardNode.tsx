// COURSE OUTLINE — the STAIRCASE. Frame 2 of every lesson's Hook, so it rides in
// every video. It is DERIVED, never typed: it self-fetches the course tree and lays
// the bound course's chapters (in order, with their real titles) as steps climbing
// left→right. FREE lessons are full colour; PAID lessons past `freeThrough` go
// desaturated behind a gate line + "Requires study pass" — still visible/titled, but
// clearly gated. The YOU-ARE-HERE lesson (auto-detected from the containing frame's
// lesson, or a manual override) is scaled up and brand-glowing, and is a spotlight
// target so the space-walk can climb the steps. Camera-safe corners (top-left) and
// the watermark corner (bottom-right) are kept clear. FILM-CLEAN: chromeless shell —
// no navy header band; every control lives in the hover row (`.card-actions`, hidden
// on camera), so the staircase itself is the entire shot.
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeResizer, useReactFlow } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Lightbulb, Lock, LockOpen, Minus, Plus, MapPin, Settings2, X } from "lucide-react";

import { CardScaleHandle, useCardActions, useCardScale } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { ConnectionDots } from "../ConnectionDots";
import { attachMemo } from "../MemoLightbulb";
import { spotStyle, spotTargetProps, useCardDim, useSpotlight } from "../SpotlightContext";
import { outlineSteps, type StairOrigin, type StepPos } from "../outline-staircase";
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

  const course = tree.data?.courses.find((c) => c.id === courseId);
  const lessons: Lesson[] = (course?.chapters ?? [])
    .filter((ch) => ch.id !== "__unassigned__" && (ch.status ?? "active") !== "archived")
    .slice()
    .sort((a, b) => (a.chapter_number ?? 9999) - (b.chapter_number ?? 9999))
    .slice(0, 15)
    .map((ch, i) => ({ n: i + 1, num: ch.chapter_number, title: ch.chapter_name?.trim() || `Lesson ${i + 1}`, free: i < freeThrough }));

  const { steps, layout } = outlineSteps(lessons.length, { origin: d.origin ?? "bl", rise: d.rise ?? 0.6, layout: d.layout });
  const autoHere = useAutoHere(id, lessons);
  const hereIdx = d.hereOverride ?? autoHere; // 1-based, or null

  const firstPaid = lessons.findIndex((l) => !l.free);
  const gate = firstPaid > 0 && firstPaid < steps.length && layout === "staircase"
    ? gateGeometry(steps[firstPaid - 1], steps[firstPaid])
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
            layout={layout}
            onUpdate={update}
            onClose={() => setGear(null)}
          />
        </CardPopover>
      )}

      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 9", background: "transparent" }}>
        {/* connector line climbing through the steps + the free/paid gate */}
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
              stroke={PAPER.red} strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* "Requires study pass" label near the paid run */}
        {gate && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ left: `${gate.labelX * 100}%`, top: `${gate.labelY * 100}%`, color: PAPER.red, background: "rgba(194,24,50,0.08)", border: `1px solid ${PAPER.red}55` }}
          >
            <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />Requires study pass
          </div>
        )}

        {/* steps */}
        {lessons.map((l, i) => {
          const p = steps[i] ?? { x: 0.5, y: 0.5 };
          const here = hereIdx === l.n;
          const st = spotTargetProps(sp, id, `step:${l.n}`);
          const emphasized = here || st.state === "spot";
          return (
            <div
              key={l.n}
              {...st.props}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center transition-transform duration-200"
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                width: 132,
                transform: `translate(-50%,-50%) scale(${emphasized ? 1.32 : 1})`,
                zIndex: here ? 30 : 10 + i, // climb layers so later steps sit above earlier
                filter: l.free ? undefined : "grayscale(1)",
                opacity: st.state === "dim" ? 0.7 : l.free ? 1 : 0.82,
                ...spotStyle(st.state),
              }}
            >
              {here && <MapPin className="h-3.5 w-3.5" style={{ color: PAPER.red }} />}
              <div
                className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-black tabular-nums"
                style={{
                  color: l.free ? "#3A2A00" : "#4A4A4A",
                  background: l.free ? GOLD : "#C9CBD1",
                  border: here ? `2.5px solid ${PAPER.red}` : `2px solid ${l.free ? "rgba(58,42,0,0.35)" : "#9AA1AC"}`,
                  boxShadow: emphasized ? `0 0 0 3px rgba(232,184,75,0.35), 0 6px 16px -4px rgba(0,0,0,0.5)` : "0 3px 8px -3px rgba(0,0,0,0.4)",
                }}
              >
                {l.num ?? l.n}
              </div>
              <div
                className="line-clamp-2 leading-tight"
                style={{
                  fontFamily: "'Poppins','Inter',system-ui,sans-serif",
                  fontSize: here ? 12 : 10.5,
                  fontWeight: here ? 800 : 600,
                  color: here ? NAVY : l.free ? PAPER.ink : "#6B7280",
                  textShadow: emphasized ? "0 1px 6px rgba(255,255,255,0.9)" : undefined,
                }}
              >
                {l.title}
              </div>
            </div>
          );
        })}

        {/* empty / unbound states — authoring only */}
        {tree.isLoading && <Centered muted>loading course…</Centered>}
        {!tree.isLoading && !course && <Centered muted>Set the scene course to derive this outline</Centered>}
        {!tree.isLoading && course && lessons.length === 0 && <Centered muted>No chapters in {course.course_name ?? "this course"} yet</Centered>}
      </div>

      {/* FILMING SCALE (FF-2) — corner grip + % readout, undoable, persists */}
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

/** Perpendicular gate segment between the last free step and first paid step, plus a
 *  label anchor sitting just off the paid side. All in 0..1 fractions. */
function gateGeometry(free: StepPos, paid: StepPos) {
  const mx = (free.x + paid.x) / 2;
  const my = (free.y + paid.y) / 2;
  const dx = paid.x - free.x;
  const dy = paid.y - free.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit perpendicular
  const px = -dy / len;
  const py = dx / len;
  const half = 0.11; // gate half-length in card fractions
  return {
    x1: mx + px * half, y1: my + py * half,
    x2: mx - px * half, y2: my - py * half,
    // label nudged toward the paid run, above the line
    labelX: mx + (dx / len) * 0.02 + px * (half + 0.02),
    labelY: my + (dy / len) * 0.02 + py * (half + 0.02),
  };
}

/** Outline settings — origin corner, ascent angle, free-through gate, grid fallback,
 *  and the you-are-here override. */
function OutlineSettings({ d, courseName, lessonCount, layout, onUpdate, onClose }: {
  d: OutlineCard;
  courseName: string | null;
  lessonCount: number;
  layout: "staircase" | "grid";
  onUpdate: (p: Partial<OutlineCard>) => void;
  onClose: () => void;
}) {
  const row = "flex items-center justify-between gap-2 py-1 text-[11.5px]";
  const on = (v: boolean) => ({ color: v ? NEON.yellow : NEON.muted, background: v ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${v ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` });
  const origin = d.origin ?? "bl";
  const rise = d.rise ?? 0.6;
  const freeThrough = d.freeThrough ?? 8;
  const ORIGINS: { k: StairOrigin; label: string }[] = [
    { k: "bl", label: "↗" }, { k: "br", label: "↖" }, { k: "tl", label: "↘" }, { k: "tr", label: "↙" },
  ];
  return (
    <div className="nodrag w-64 rounded-lg p-2.5 shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Course outline</div>
      <p className="mb-1.5 text-[10px] leading-snug" style={{ color: NEON.muted }}>
        Derived from <b style={{ color: NEON.text }}>{courseName ?? "the scene course"}</b> — {lessonCount} lesson{lessonCount === 1 ? "" : "s"}, rendered as a {layout}.
      </p>

      <div className={row}>
        <span>Climb from</span>
        <div className="flex gap-0.5">
          {ORIGINS.map((o) => (
            <button key={o.k} title={o.k} className="grid h-6 w-6 place-items-center rounded text-[13px] font-bold" style={on(origin === o.k)} onClick={() => onUpdate({ origin: o.k })}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="py-1">
        <div className="flex items-center justify-between text-[11.5px]"><span>Ascent angle</span><span className="tabular-nums" style={{ color: NEON.muted }}>{Math.round(rise * 100)}%</span></div>
        <input type="range" min={15} max={92} value={Math.round(rise * 100)} onChange={(e) => onUpdate({ rise: Number(e.target.value) / 100 })} className="mt-0.5 w-full accent-[#FCA311]" />
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

      <div className={row}>
        <span>Layout</span>
        <div className="flex gap-0.5">
          {(["staircase", "grid"] as const).map((l) => (
            <button key={l} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={on((d.layout ?? "staircase") === l)} onClick={() => onUpdate({ layout: l })}>{l}</button>
          ))}
        </div>
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
