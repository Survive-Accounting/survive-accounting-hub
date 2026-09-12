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

import { BIG_FONT, NEON } from "../theme";
import { CycleRing, type PillState } from "./cycle-ring";
import { CYCLE_STEPS, checkExpect as checkExpectCycle, cycleStep, matchesStep, ringSteps, selfTestSteps, shuffledIds } from "./cycle-model";
import { StepPanel, useProbeRun } from "./lab-runner";
import type { RunStepDef } from "./probe-run";
import type { LabItem } from "./lab-items";

const GOLD = "#FCA311";

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
          <CycleRing states={states} labels={labels} centre={centre} onPill={mode === "definitions" ? (i) => setFocus(CYCLE_STEPS[i].id) : undefined} />
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
