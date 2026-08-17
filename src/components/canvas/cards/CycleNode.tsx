// ACCOUNTING CYCLE (Lee) — an OPAQUE callout whose steps sit evenly around an
// OVAL, joined by clockwise flow arrows that close the loop. Add / remove / rename
// steps; the oval re-solves from the step count. Design ELEMENT: resizable, never
// in the deck. EMPHASIS (A3) is the shared EXHIBIT-HIGHLIGHT system: in film
// mode, clicking a step toggles a brand-orange GLOW; any number can glow at once
// (light a run like "Unadjusted TB → Adjusting → Adjusted TB"); the arc between
// two adjacent lit steps glows too, so a sequence reads as a flowing path; `
// clears everything. Glow is shadow/border/opacity ONLY — the old spotlight's
// pop-to-centre transform resized the card mid-take and is gone. Order is taught
// with highlights now, so the pills carry no number badges. Shift-click an arrow
// to toggle its animated-dashed style (like the element-connect arrows).
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical, Plus, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { cardId, type CycleElement, type CycleStep } from "../types";

// Landscape viewBox the SVG + pills share (preserveAspectRatio:none maps it 1:1
// onto the box, so a pill's % position lines up with the arcs).
const VB_W = 1000;
const VB_H = 600;
const CX = 500;
const CY = 300;
const RX = 392;
const RY = 236;

const CYCLE_CSS = `
@keyframes cyc-dash-march { to { stroke-dashoffset: -32; } }
.cyc-dash { animation: cyc-dash-march 0.55s linear infinite; }
`;

interface Placed extends CycleStep {
  /** angle on the ring, radians (−90° = top, clockwise). */
  ang: number;
  xPct: number;
  yPct: number;
}

function placeSteps(steps: CycleStep[]): Placed[] {
  const n = Math.max(steps.length, 1);
  return steps.map((s, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = CX + RX * Math.cos(ang);
    const y = CY + RY * Math.sin(ang);
    return { ...s, ang, xPct: (x / VB_W) * 100, yPct: (y / VB_H) * 100 };
  });
}

/** One clockwise elliptical-arc path (with a gap at each end so the pills sit in
 *  clear space and the arrowhead reads). Returns the `d` string. */
function arcBetween(a0: number, a1: number): string {
  const p = (a: number) => `${(CX + RX * Math.cos(a)).toFixed(1)} ${(CY + RY * Math.sin(a)).toFixed(1)}`;
  return `M ${p(a0)} A ${RX} ${RY} 0 0 1 ${p(a1)}`;
}

/** ARROW GAPS (Lee) — the head used to disappear UNDER the next pill: the old
 *  symmetric gap was seg*0.14, which at 9 steps is ~5.6° — far less than a pill's
 *  angular half-width, so the point landed beneath its rounded border. The gap is
 *  asymmetric now: a small one leaving the pill behind, a MUCH larger one before
 *  the next pill so the arrowhead always lands in open space and reads on camera.
 *  Both are capped so a 3-step cycle doesn't lose its arcs entirely. */
const gapAfter = (seg: number) => Math.min(seg * 0.16, 0.16);
const gapBefore = (seg: number) => Math.min(seg * 0.42, 0.42);

/** Width of the longest line — a multi-line step sizes to its widest row, not its
 *  total character count (which would make a 3-line pill absurdly wide). */
const longestLine = (t: string): number => t.split("\n").reduce((m, l) => Math.max(m, l.length), 0);

export function CycleNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CycleElement;
  const { update } = useCardActions(id);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  const steps = d.steps ?? [];
  // EXHIBIT BASE — this card DECLARES its shape; lock/highlights/`-reset/film
  // behavior all come from the shared layer (see exhibit-base.tsx).
  const decl: ExhibitDeclaration = { minWidth: 340, minHeight: 220, nodes: steps.map((st) => st.id), adjacency: "ring" };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const placed = placeSteps(steps);
  // BIGGER BY DEFAULT (Lee): a 9-step cycle at 620×380 crowded its pills together.
  // Only NEW cards pick this up — anything already placed keeps its saved w/h.
  const w = d.w ?? 900;
  const h = d.h ?? 560;
  const pillFont = Math.max(10, Math.min(16, w / 52));
  const n = Math.max(placed.length, 1);
  const seg = (2 * Math.PI) / n;
  const dashed = new Set(d.dashedArrows ?? []);

  const setStep = (sid: string, text: string) => update({ steps: steps.map((s) => (s.id === sid ? { ...s, text } : s)) });
  const addStep = () => update({ steps: [...steps, { id: cardId("cy"), text: "New step" }] });
  const removeStep = (sid: string) => { if (steps.length > 1) update({ steps: steps.filter((s) => s.id !== sid) }); };
  const toggleDashed = (i: number) => { const next = new Set(dashed); if (next.has(i)) next.delete(i); else next.add(i); update({ dashedArrows: [...next].sort((a, b) => a - b) }); };

  return (
    <ExhibitShell id={id} decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div
          className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
          title="Drag to move"
          style={{ color: NEON.muted }}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* the callout — TRANSPARENT (Lee, 08-14): pills + arcs float straight over
          the frame's world background (was an opaque navy radial that covered the
          bg watermark — Lee reversed that call). The pills carry their own
          near-opaque gradients so they read over anything. A faint border remains
          in AUTHORING ONLY as a bounds aid for drag/resize; film shows nothing. */}
      <div
        className="relative rounded-3xl"
        style={{
          width: "100%",
          height: h,
          background: "transparent",
          border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)",
        }}
      >
        <style>{CYCLE_CSS}</style>
        {/* flow arrows — brighter + thicker; shift-click one to toggle animated dashes */}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={`cyc-grad-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FCA311" />
              <stop offset="100%" stopColor="#E0284A" />
            </linearGradient>
            {/* refX=1 puts the marker's TIP at the path end (was 7, which pulled the
                point backwards INTO the arc). markerUnits=userSpaceOnUse keeps the head
                a constant size regardless of the slimmer stroke. */}
            <marker id={`cyc-arrow-${id}`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#FCA311" />
            </marker>
          </defs>
          {placed.map((s, i) => {
            const a0 = s.ang + gapAfter(seg);
            const a1 = s.ang + seg - gapBefore(seg);
            const isDash = dashed.has(i);
            // ADJACENCY GLOW (A3): the arc BETWEEN two lit steps is part of the lit
            // path — it glows with them; every other arc recedes so the run reads.
            const litArc = ex.edgeLit(s.id, placed[(i + 1) % n].id);
            const dim = hl.any && !litArc;
            return (
              <path
                key={s.id}
                d={arcBetween(a0, a1)}
                fill="none"
                stroke={litArc ? EXHIBIT_GLOW.arcStroke : `url(#cyc-grad-${id})`}
                strokeWidth={litArc ? 4.2 : 3.2}
                strokeLinecap="round"
                markerEnd={`url(#cyc-arrow-${id})`}
                className={`nodrag${isDash ? " cyc-dash" : ""}`}
                style={{ vectorEffect: "non-scaling-stroke", pointerEvents: "stroke", cursor: "pointer", strokeDasharray: isDash ? "9 7" : undefined, opacity: dim ? 0.22 : 1, transition: "opacity 160ms ease, stroke-width 160ms ease", filter: litArc ? EXHIBIT_GLOW.arcFilter : "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}
                onPointerDown={(e) => { if (e.shiftKey) e.stopPropagation(); }}
                onClick={(e) => { if (e.shiftKey) { e.stopPropagation(); toggleDashed(i); } }}
                data-i={i}
              >
                <title>Shift-click to toggle the animated-dashed arrow</title>
              </path>
            );
          })}
        </svg>

        {/* center title */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[26%] text-center">
          {editingTitle ? (
            <input
              autoFocus
              className="nodrag pointer-events-auto w-full rounded bg-black/40 px-2 py-1 text-center outline-none"
              style={{ color: "#F4EFE6", fontFamily: BIG_FONT, fontWeight: 800, fontSize: Math.max(15, w / 30), letterSpacing: "-0.01em" }}
              defaultValue={d.title ?? ""}
              placeholder="The Accounting Cycle"
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => { update({ title: e.target.value }); setEditingTitle(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { update({ title: (e.target as HTMLInputElement).value }); setEditingTitle(false); } if (e.key === "Escape") setEditingTitle(false); e.stopPropagation(); }}
            />
          ) : (
            <span
              className={`pointer-events-auto leading-tight${film ? "" : " cursor-text"}`}
              style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: Math.max(15, w / 30), letterSpacing: "-0.01em", color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
              title={film ? undefined : "Double-click to edit the title"}
              onDoubleClick={film ? undefined : (e) => { e.stopPropagation(); setEditingTitle(true); }}
            >
              {d.title || "The Accounting Cycle"}
            </span>
          )}
        </div>

        {/* the step pills — around the oval. Emphasis NEVER moves or scales a pill
            (the old pop-to-centre resized the card mid-take): lit = glow, unlit
            recedes in opacity, position is constant. */}
        {placed.map((s, i) => {
          const ns = ex.nodeStyle(s.id);
          const isLit = ns.lit;
          const faded = ns.dimmed;
          return (
            <div
              key={s.id}
              className="group/pill absolute"
              style={{
                left: `${s.xPct}%`, top: `${s.yPct}%`,
                // The one permitted motion: a slight lift on a LIT pill. It is a
                // transform on an absolutely-positioned node, so the card's own box is
                // untouched — the banned thing was a pop-to-centre that resized the card.
                transform: `translate(-50%, -50%) scale(${ns.scale})`,
                zIndex: isLit ? 30 : undefined,
                opacity: ns.opacity,
                filter: faded ? "saturate(0.5)" : undefined,
                transition: `opacity ${ns.transition}, filter ${ns.transition}, transform ${ns.transition}`,
              }}
            >
              {editingStep === s.id ? (
                // TEXTAREA, not input (Lee): long step names need line breaks so a
                // 9-step cycle doesn't stretch its pills into each other.
                // Shift+Enter = newline · Enter = commit — same contract as memo text.
                <textarea
                  autoFocus
                  rows={Math.max(1, s.text.split("\n").length)}
                  className="nodrag resize-none rounded-2xl bg-black/50 px-2.5 py-1 text-center outline-none"
                  style={{ width: Math.max(96, Math.min(200, longestLine(s.text) * 8 + 30)), color: "#F4EFE6", fontFamily: DISPLAY_FONT, fontSize: pillFont, border: "1.5px solid #FCA311", lineHeight: 1.2 }}
                  defaultValue={s.text}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => { setStep(s.id, e.target.value); setEditingStep(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setStep(s.id, (e.target as HTMLTextAreaElement).value); setEditingStep(null); }
                    if (e.key === "Escape") setEditingStep(null);
                    e.stopPropagation();
                  }}
                  title="Shift+Enter for a line break · Enter to commit"
                />
              ) : (
                <div
                  className="nodrag flex cursor-text items-center gap-1 rounded-2xl px-3 py-1.5 font-semibold"
                  style={{
                    // pre-line honours the author's \n; a single-line step still reads
                    // as one line, so nothing changes for short labels.
                    whiteSpace: "pre-line",
                    textAlign: "center",
                    lineHeight: 1.18,
                    maxWidth: 220,
                    fontFamily: DISPLAY_FONT,
                    fontSize: pillFont,
                    color: "#F4EFE6",
                    background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
                    border: `1.5px solid ${ns.border}`,
                    boxShadow: ns.boxShadow ?? "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)",
                    transition: `box-shadow ${ns.transition}, border-color ${ns.transition}`,
                  }}
                  title={film ? "Click: normal → highlighted → blurred → normal · ` clears · 0 resets every step" : "Click to edit"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={film ? ex.nodeClick(s.id) : (e) => { e.stopPropagation(); setEditingStep(s.id); }}
                >
                  {/* TEASE: the filter goes on the TEXT so the pill keeps a crisp
                      outline — the viewer sees a step is there and cannot read it. */}
                  <span style={{ filter: ns.contentFilter, transition: `filter ${ns.transition}`, userSelect: ns.blurred ? "none" : undefined }}>{s.text || "Step"}</span>
                  {steps.length > 1 && !film && (
                    <button
                      className="nodrag ml-0.5 hidden h-3.5 w-3.5 place-items-center rounded-full group-hover/pill:grid"
                      style={{ background: "rgba(224,40,74,0.9)", color: "#fff" }}
                      title="Remove step"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeStep(s.id); }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* add step (card-actions ⇒ FILM_LOCK_CSS also hides it in the popout) */}
        {!film && (
          <button
            className="nodrag card-actions absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold opacity-0 transition-opacity group-hover/el:opacity-100"
            style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.yellow }}
            title="Add a step to the cycle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); addStep(); }}
          >
            <Plus className="h-3 w-3" /> Step
          </button>
        )}
      </div>
    </ExhibitShell>
  );
}
