// ACCOUNTING CYCLE (Lee) — an OPAQUE callout whose steps sit evenly around an
// OVAL, joined by clockwise flow arrows that close the loop. Add / remove / rename
// steps; the oval re-solves from the step count. Design ELEMENT: resizable, never
// in the deck. SPOTLIGHT is per-STEP (not the whole element): spotlighting or
// super-spotlighting a step POPS it to the centre of the oval (over the title) so
// it never runs off the frame even when the card is stretched large. Shift-click
// an arrow to toggle its animated-dashed style (like the element-connect arrows).
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical, Plus, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { ConnectionDots } from "../ConnectionDots";
import { useFilm } from "../film-lock";
import { useSpotlight } from "../SpotlightContext";
import { ElementChrome, ElementResizer } from "./elements";
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
  const { update, toFront } = useCardActions(id);
  const sp = useSpotlight();
  // FILM LOCK (A1): on camera this card is a TEACHING SURFACE, not an editor —
  // no move grip, no step editing, no add/remove. ElementChrome/Resizer already
  // self-gate; these are the card's CUSTOM affordances obeying the same signal.
  const film = useFilm();
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  const steps = d.steps ?? [];
  const placed = placeSteps(steps);
  // BIGGER BY DEFAULT (Lee): a 9-step cycle at 620×380 crowded its pills together.
  // Only NEW cards pick this up — anything already placed keeps its saved w/h.
  const w = d.w ?? 900;
  const h = d.h ?? 560;
  const pillFont = Math.max(10, Math.min(16, w / 52));
  const n = Math.max(placed.length, 1);
  const seg = (2 * Math.PI) / n;
  const dashed = new Set(d.dashedArrows ?? []);
  // Only STEPS are spotlightable. When any step is lit, drop the element's edit
  // chrome so the shot reads clean.
  const litIds = steps.filter((s) => sp?.targetState(id, s.id) === "spot").map((s) => s.id);
  const anySpot = litIds.length > 0;
  // CHAIN EMPHASIS (Lee): ONE lit step pops to the centre (it's a single callout).
  // TWO OR MORE stay exactly where they are — popping them all to the centre would
  // stack them on top of each other, and the whole point of lighting a run like
  // "Unadjusted TB → Adjusting Entries → Adjusted TB" is to SEE the sequence sitting
  // in order around the ring. Unlit steps recede instead.
  const chainMode = litIds.length > 1;

  const setStep = (sid: string, text: string) => update({ steps: steps.map((s) => (s.id === sid ? { ...s, text } : s)) });
  const addStep = () => update({ steps: [...steps, { id: cardId("cy"), text: "New step" }] });
  const removeStep = (sid: string) => { if (steps.length > 1) update({ steps: steps.filter((s) => s.id !== sid) }); };
  const toggleDashed = (i: number) => { const next = new Set(dashed); if (next.has(i)) next.delete(i); else next.add(i); update({ dashedArrows: [...next].sort((a, b) => a - b) }); };
  // Ctrl-click a step → spotlight pill · Ctrl+Shift-click → super-flame. Mirrors
  // spotTargetProps, but we render the emphasis ourselves (pop-to-centre) instead
  // of via FLAME_CSS, so the positioning transform is ours to control.
  const spotClick = (sid: string) => (e: React.PointerEvent) => {
    if (!sp) return;
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); sp.toggleFlame(id, sid, e.altKey ? "warn" : "focus"); return; }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation();
      // ALWAYS start() — it toggles this ONE target (applyRegularClick adds/removes)
      // and leaves the rest of the set alone. It used to call exit() on a lit step,
      // which cleared EVERY spotlight, making a multi-step chain impossible to build:
      // lighting the 3rd step then correcting the 2nd wiped all three.
      sp.start(id, sid);
    }
  };

  return (
    <div onPointerDownCapture={toFront} className="group/el animate-in fade-in relative duration-150" style={{ width: w, minHeight: h }}>
      <ConnectionDots />
      {!anySpot && <ElementChrome id={id} posLock={d.posLock} selected={selected} />}
      <ElementResizer id={id} selected={selected && !anySpot} minWidth={340} minHeight={220} />
      {!anySpot && !film && (
        <div
          className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`}
          title="Drag to move"
          style={{ color: NEON.muted }}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* the callout — OPAQUE so nothing shows through (covers the bg watermark) */}
      <div
        className="relative rounded-3xl"
        style={{
          width: "100%",
          height: h,
          background: "radial-gradient(ellipse at 50% 42%, rgb(28,40,72), rgb(9,13,26))",
          border: "1.5px solid rgba(252,163,17,0.4)",
          boxShadow: "0 18px 44px -18px rgba(0,0,0,0.7)",
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
            // CHAIN EMPHASIS: the arc BETWEEN two lit steps is part of the chain —
            // it brightens with them; every other arc recedes so the run reads.
            const inChain = chainMode && litIds.includes(s.id) && litIds.includes(placed[(i + 1) % n].id);
            const dim = chainMode && !inChain;
            return (
              <path
                key={s.id}
                d={arcBetween(a0, a1)}
                fill="none"
                stroke={inChain ? "#FCA311" : `url(#cyc-grad-${id})`}
                strokeWidth={inChain ? 4.2 : 3.2}
                strokeLinecap="round"
                markerEnd={`url(#cyc-arrow-${id})`}
                className={`nodrag${isDash ? " cyc-dash" : ""}`}
                style={{ vectorEffect: "non-scaling-stroke", pointerEvents: "stroke", cursor: "pointer", strokeDasharray: isDash ? "9 7" : undefined, opacity: dim ? 0.22 : 1, transition: "opacity 160ms ease, stroke-width 160ms ease", filter: inChain ? "drop-shadow(0 0 6px rgba(252,163,17,0.85))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}
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

        {/* the step pills — around the oval, POPPING to the centre when spotlit */}
        {placed.map((s, i) => {
          const spotState = sp?.targetState(id, s.id) ?? null;
          const flamed = sp?.isFlamed(id, s.id) ?? false;
          const warn = (sp?.flameTone(id, s.id) ?? null) === "warn"; // 🚨 red "BAD" super
          const isSpot = spotState === "spot";
          // ONE lit step → pop to centre. A CHAIN (2+) stays in place, scaled just
          // enough to lift off the ring; unlit steps fade back so the run reads.
          const popToCentre = isSpot && !chainMode;
          const bigScale = flamed ? 2.15 : 1.7;
          const chainScale = flamed ? 1.3 : 1.16;
          const faded = chainMode && !isSpot;
          return (
            <div
              key={s.id}
              data-spot-target={s.id}
              onPointerDownCapture={spotClick(s.id)}
              className="group/pill absolute"
              style={popToCentre
                ? { left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${bigScale})`, zIndex: 40, transition: "transform 160ms ease" }
                : {
                    left: `${s.xPct}%`, top: `${s.yPct}%`,
                    transform: `translate(-50%, -50%)${isSpot ? ` scale(${chainScale})` : ""}`,
                    zIndex: isSpot ? 30 : undefined,
                    opacity: faded ? 0.34 : 1,
                    filter: faded ? "saturate(0.4)" : undefined,
                    transition: "transform 160ms ease, opacity 160ms ease, filter 160ms ease",
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
                    border: `1.5px solid ${isSpot ? (flamed ? (warn ? "#FF1E32" : "#FF7A00") : "#FCA311") : "rgba(252,163,17,0.55)"}`,
                    boxShadow: isSpot
                      ? (flamed
                          ? (warn
                              ? "0 0 0 3px rgba(9,13,26,0.95), 0 0 28px rgba(255,30,50,0.95)"
                              : "0 0 0 3px rgba(9,13,26,0.95), 0 0 28px rgba(255,122,0,0.9)")
                          : "0 0 0 3px rgba(9,13,26,0.95), 0 0 22px rgba(252,163,17,0.75)")
                      : "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)",
                  }}
                  title={film ? "Ctrl-click to spotlight (Ctrl+Shift = 🔥 · Ctrl+Alt+Shift = 🚨)" : "Click to edit · Ctrl-click to spotlight (Ctrl+Shift = 🔥 · Ctrl+Alt+Shift = 🚨)"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={film ? (e) => e.stopPropagation() : (e) => { e.stopPropagation(); setEditingStep(s.id); }}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black" style={{ background: "#FCA311", color: "#0B0F1E" }}>
                    {i + 1}
                  </span>
                  {s.text || "Step"}
                  {steps.length > 1 && !isSpot && !film && (
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
        {!anySpot && !film && (
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
    </div>
  );
}
