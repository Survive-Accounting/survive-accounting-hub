// THE ACCOUNTING CYCLE EXHIBIT (Exhibit Lab v2, §5) — the nine steps around
// the oval, in four ways:
//   · DEFINITIONS — click a step: it ASKS first ("in your words, what happens
//     here?"); the definition lands in the centre only after an attempt or a
//     Skip. The law, even for the definition-on-click.
//   · SELF-TEST — type each step in order; unrevealed steps are TEASED (blurred
//     pill, crisp outline); Skip reveals one.
//   · BUILD — place the steps in order from a shuffled pool; immediate
//     feedback per placement (the placement IS the attempt).
//   · REWIND / FAST-FORWARD probes — "what comes before/after this step?"
//
// Geometry mirrors the canvas CycleNode's oval on purpose (same look on camera)
// but is kept local: the canvas card is a ReactFlow node with scene data and
// is deliberately untouched this pass.
import { useCallback, useMemo, useState } from "react";

import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { CYCLE_STEPS, checkExpect as checkExpectCycle, cycleStep, matchesStep, ringSteps, selfTestSteps, shuffledIds } from "./cycle-model";
import { StepPanel, useProbeRun } from "./lab-runner";
import type { RunStepDef } from "./probe-run";
import type { LabItem } from "./lab-items";

const VB_W = 1000, VB_H = 600, CX = 500, CY = 300, RX = 392, RY = 236;
const T = "opacity 200ms ease, filter 200ms ease, box-shadow 200ms ease, border-color 200ms ease, transform 200ms ease";
const GOLD = "#FCA311", GOOD = "#3BF5A0", BAD = "#FF8B9E";

const place = (i: number, n: number) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; return { ang, x: (CX + RX * Math.cos(ang)) / VB_W * 100, y: (CY + RY * Math.sin(ang)) / VB_H * 100 }; };
const arc = (a0: number, a1: number) => { const p = (a: number) => `${(CX + RX * Math.cos(a)).toFixed(1)} ${(CY + RY * Math.sin(a)).toFixed(1)}`; return `M ${p(a0)} A ${RX} ${RY} 0 0 1 ${p(a1)}`; };

type PillState = "normal" | "lit" | "teased" | "good" | "bad" | "dim";

function Oval({ states, labels, onPill, centre }: { states: PillState[]; labels: (string | null)[]; onPill?: (i: number) => void; centre: React.ReactNode }) {
  const n = CYCLE_STEPS.length;
  const seg = (2 * Math.PI) / n;
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="lab-cyc-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FCA311" /><stop offset="100%" stopColor="#E0284A" /></linearGradient>
          <marker id="lab-cyc-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#FCA311" /></marker>
        </defs>
        {CYCLE_STEPS.map((s, i) => {
          const { ang } = place(i, n);
          const lit = states[i] === "lit" && states[(i + 1) % n] === "lit";
          return <path key={s.id} d={arc(ang + Math.min(seg * 0.16, 0.16), ang + seg - Math.min(seg * 0.42, 0.42))} fill="none" stroke={lit ? GOLD : "url(#lab-cyc-grad)"} strokeWidth={lit ? 4.2 : 3.2} strokeLinecap="round" markerEnd="url(#lab-cyc-arrow)" style={{ vectorEffect: "non-scaling-stroke", opacity: states.some((x) => x === "lit") && !lit ? 0.25 : 1, transition: T, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }} />;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[24%] text-center">{centre}</div>
      {CYCLE_STEPS.map((s, i) => {
        const { x, y } = place(i, n);
        const st = states[i];
        const label = labels[i];
        const border = st === "lit" ? GOLD : st === "good" ? GOOD : st === "bad" ? BAD : "rgba(252,163,17,0.55)";
        return (
          <div key={s.id} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) scale(${st === "lit" ? 1.06 : 1})`, opacity: st === "dim" ? 0.3 : 1, transition: T, zIndex: st === "lit" ? 3 : 1 }}>
            <div onClick={onPill ? () => onPill(i) : undefined} className="rounded-2xl px-3 py-1.5 text-center font-semibold" style={{ cursor: onPill ? "pointer" : "default", minWidth: 92, maxWidth: 200, whiteSpace: "pre-line", lineHeight: 1.18, fontFamily: DISPLAY_FONT, fontSize: 13, color: "#F4EFE6", background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))", border: `1.5px solid ${border}`, boxShadow: st === "lit" ? `0 0 22px rgba(252,163,17,0.6)` : st === "good" ? `0 0 18px rgba(59,245,160,0.5)` : "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)", transition: T }}>
              {/* TEASE: the blur goes on the TEXT — crisp outline, unreadable label */}
              <span style={{ filter: st === "teased" ? "blur(6px)" : undefined, userSelect: st === "teased" ? "none" : undefined, transition: T }}>{label ?? (st === "teased" ? s.text : `${i + 1}`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CycleExhibit({ item }: { item: LabItem }) {
  const mode = item.probe ? "probe" : (item.mode ?? "definitions");
  const [focus, setFocus] = useState<string | null>(null);
  const pool = useMemo(() => shuffledIds(Number(item.seed?.shuffle ?? 7)), [item.seed?.shuffle]);

  // The run's ref: definitions mode keys on the focused step so each click is a
  // fresh one-question run; build/self-test/probe runs are whole-ring runs.
  const probeRef = useMemo(() => ({ exhibit: "cycle" as const, probe: item.probe ?? ("rewind" as const), stepsOff: item.stepsOff, seed: { ...(item.seed ?? {}), mode, ...(focus ? { focus } : {}) } }), [item.probe, item.stepsOff, item.seed, mode, focus]);

  const buildSteps = useCallback((): RunStepDef[] => {
    if (mode === "probe") return ringSteps(item.probe === "fast_forward" ? "fast_forward" : "rewind", typeof item.seed?.step === "string" ? item.seed.step : undefined);
    if (mode === "selftest") return selfTestSteps();
    if (mode === "build") return CYCLE_STEPS.map((s, i) => ({ id: `slot.${i}`, prompt: `Which step goes in position ${i + 1}?`, kind: "choice" as const, options: pool.map((id) => cycleStep(id)!.text), explain: `${s.text} — ${s.definition}`, data: { expect: s.text, slot: i } }));
    const f = focus ? cycleStep(focus) : null;
    if (!f) return [{ id: "pick", prompt: "Click a step on the ring to open it.", kind: "confirm", options: [], explain: "" }];
    return [{ id: `def.${f.id}`, prompt: `In your words — what happens at "${f.text}"?`, kind: "text", explain: f.definition, data: { stepId: f.id } }];
  }, [mode, item.probe, item.seed?.step, pool, focus]);

  const check = useCallback((step: RunStepDef, response: string): boolean | null => {
    const sid = step.data?.stepId;
    if (step.kind === "text" && typeof sid === "string") return step.id.startsWith("st.") ? matchesStep(response, cycleStep(sid)!) : null; // definitions = reflection, not graded
    return checkExpectCycle(step, response);
  }, []);

  const lab = useProbeRun(probeRef, buildSteps, check);
  const { run, step, rev } = lab;

  // ---- paint the ring from the run ---------------------------------------
  const states: PillState[] = CYCLE_STEPS.map(() => "normal");
  const labels: (string | null)[] = CYCLE_STEPS.map((s) => s.text);
  if (mode === "selftest") {
    CYCLE_STEPS.forEach((s, i) => {
      const st = run.steps.find((x) => x.id === `st.${s.id}`);
      if (!st?.resolution) { states[i] = "teased"; }
      else if (st.resolution.kind === "attempt" && st.resolution.correct) states[i] = "good";
      else states[i] = "lit"; // skipped or missed → revealed, shown lit so the reveal reads
      if (step?.id === `st.${s.id}` && !st?.resolution) states[i] = "lit";
    });
    // a lit current step keeps its text teased until resolved
    const curI = step ? CYCLE_STEPS.findIndex((s) => `st.${s.id}` === step.id) : -1;
    if (curI >= 0 && !step?.resolution) labels[curI] = null;
  } else if (mode === "build") {
    CYCLE_STEPS.forEach((s, i) => {
      const st = run.steps.find((x) => x.id === `slot.${i}`);
      if (!st?.resolution) { labels[i] = null; states[i] = step?.id === `slot.${i}` ? "lit" : "normal"; }
      else if (st.resolution.kind === "attempt") { labels[i] = st.resolution.response; states[i] = st.resolution.correct ? "good" : "bad"; }
      else { states[i] = "lit"; }
    });
  } else if (mode === "probe") {
    const asked = typeof step?.data?.stepId === "string" ? step.data.stepId : null;
    const ans = typeof step?.data?.answerId === "string" ? step.data.answerId : null;
    CYCLE_STEPS.forEach((s, i) => {
      if (s.id === asked) states[i] = "lit";
      else if (rev && s.id === ans) states[i] = "good";
      else if (asked) states[i] = "dim";
    });
  } else {
    CYCLE_STEPS.forEach((s, i) => { if (focus === s.id) states[i] = "lit"; else if (focus) states[i] = "dim"; });
  }

  const centre = mode === "definitions"
    ? (rev && focus ? <div className="pointer-events-auto rounded-xl px-4 py-3 text-[14px] leading-snug" style={{ background: "rgba(9,13,26,0.92)", border: `1px solid ${GOLD}`, color: "#F4EFE6", animation: "sa-lab-reveal 200ms ease", maxWidth: 420 }}><div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>{cycleStep(focus)?.text}</div>{rev.explain}</div>
      : <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 30, color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>{focus ? "" : "The Accounting Cycle"}</span>)
    : <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 30, color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>The Accounting Cycle</span>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: GOLD, color: "#0B1322" }}>Cycle</span>
        <span className="text-[12px] font-bold" style={{ color: "#F4EFE6" }}>{mode === "probe" ? (item.probe === "fast_forward" ? "Fast-Forward — what comes next?" : "Rewind — what came before?") : mode === "selftest" ? "Self-test — type each step (S skips; skipped steps reveal)" : mode === "build" ? "Build — place the steps in order" : "Definitions — click a step; it asks before it tells"}</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 items-center rounded-2xl p-4" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(37,52,88,0.5), rgba(9,13,26,0.9) 70%)", border: `1px solid ${NEON.borderSoft}` }}>
          <Oval states={states} labels={labels} centre={centre} onPill={mode === "definitions" ? (i) => setFocus(CYCLE_STEPS[i].id) : undefined} />
        </div>
        <div className="w-[380px] shrink-0">
          {mode === "definitions" && !focus
            ? <div className="rounded-xl p-4 text-[12px]" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}>Click any step on the ring. It asks you to say what happens there first — the definition only lands after you answer or press <b style={{ color: "#F4EFE6" }}>S</b> to skip.</div>
            : <StepPanel run={run} step={step} rev={rev} text={lab.text} setText={lab.setText} handlers={lab.handlers} />}
        </div>
      </div>
    </div>
  );
}
