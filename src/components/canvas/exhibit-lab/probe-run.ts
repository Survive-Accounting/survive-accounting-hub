// PROBE RUN (Exhibit Lab v2, §2–§3) — the step machine every exhibit runs on,
// and the place THE ASK-FIRST LAW is enforced STRUCTURALLY:
//
//   "An exhibit never shows an explanation before an attempt or an explicit
//    skip. Question first, always."
//
// The law is not authoring discipline. It is this module's shape: a step's
// REVEAL payload exists only through `reveal(run)`, and `reveal(run)` returns
// null until the current step carries a resolution (an attempt or a skip).
// `next()` refuses to advance past an unresolved step. An exhibit component
// receives `{ step, reveal }` from the runner — it has no other way to get the
// explanation, so it cannot show one early even by mistake. Pure; tested.
import type { ExhibitProbeRef } from "./probes";

export type StepKind = "choice" | "text" | "sign" | "order" | "confirm";

export interface RunStepDef {
  id: string;
  /** The QUESTION — shown first, always. */
  prompt: string;
  kind: StepKind;
  /** Choice / sign options (sign = exactly two, e.g. ["Debit", "Credit"]). */
  options?: string[];
  /** The explanation / correct answer. NEVER read directly by a surface —
   *  it reaches the screen only via reveal(run). */
  explain: string;
  /** Exhibit-private data for checking + painting (e.g. the expected chip). */
  data?: Record<string, unknown>;
  /** May be toggled OFF per run (§4 "steps Lee chooses"). Default true. */
  optional?: boolean;
}

export type Resolution =
  | { kind: "attempt"; response: string; correct: boolean | null; ms: number }
  | { kind: "skip"; ms: number };

export interface RunStep extends RunStepDef {
  enabled: boolean;
  resolution?: Resolution;
}

export interface ProbeRun {
  ref: ExhibitProbeRef;
  steps: RunStep[];
  /** Index into steps — always an ENABLED step while the run is live. */
  cursor: number;
  startedAt: number;
  stepStartedAt: number;
  done: boolean;
}

const firstEnabledFrom = (steps: RunStep[], from: number, dir: 1 | -1): number => {
  for (let i = from; i >= 0 && i < steps.length; i += dir) if (steps[i].enabled) return i;
  return -1;
};

export function startRun(ref: ExhibitProbeRef, defs: RunStepDef[], now = 0): ProbeRun {
  const off = new Set(ref.stepsOff ?? []);
  const steps: RunStep[] = defs.map((d) => ({ ...d, enabled: !(d.optional && off.has(d.id)) }));
  const cursor = firstEnabledFrom(steps, 0, 1);
  return { ref, steps, cursor, startedAt: now, stepStartedAt: now, done: cursor < 0 };
}

export const currentStep = (run: ProbeRun): RunStep | null => (run.done || run.cursor < 0 ? null : run.steps[run.cursor] ?? null);

/** THE LAW, as a predicate: a step may reveal only once resolved. */
export const canReveal = (step: RunStep | null | undefined): boolean => !!step?.resolution;

/** The ONLY door to an explanation. Null until the current step is attempted
 *  or explicitly skipped. */
export function reveal(run: ProbeRun): { explain: string; resolution: Resolution } | null {
  const s = currentStep(run);
  if (!s || !s.resolution) return null;
  return { explain: s.explain, resolution: s.resolution };
}

/** Record an attempt on the current step. `correct` is null when the step has
 *  no machine-checkable answer (a text reflection). Stays on the step — the
 *  reveal is now permitted; next() moves on. */
export function attempt(run: ProbeRun, response: string, correct: boolean | null, now = 0): ProbeRun {
  const s = currentStep(run);
  if (!s || s.resolution) return run; // the FIRST answer stands — no re-tries on a revealed step
  const steps = run.steps.map((st, i) => (i === run.cursor ? { ...st, resolution: { kind: "attempt" as const, response, correct, ms: Math.max(0, now - run.stepStartedAt) } } : st));
  return { ...run, steps };
}

/** An EXPLICIT skip — the other door the law allows. */
export function skip(run: ProbeRun, now = 0): ProbeRun {
  const s = currentStep(run);
  if (!s || s.resolution) return run;
  const steps = run.steps.map((st, i) => (i === run.cursor ? { ...st, resolution: { kind: "skip" as const, ms: Math.max(0, now - run.stepStartedAt) } } : st));
  return { ...run, steps };
}

/** Advance — REFUSED while the current step is unresolved (no reveal, no
 *  advance: the law has no third door). */
export function next(run: ProbeRun, now = 0): ProbeRun {
  const s = currentStep(run);
  if (!s || !s.resolution) return run;
  const n = firstEnabledFrom(run.steps, run.cursor + 1, 1);
  if (n < 0) return { ...run, done: true };
  return { ...run, cursor: n, stepStartedAt: now };
}

/** Step back to re-ask. The earlier step keeps its resolution (history), so
 *  its reveal stays visible — going back never hides an answer you gave. */
export function prev(run: ProbeRun, now = 0): ProbeRun {
  const p = firstEnabledFrom(run.steps, (run.done ? run.steps.length : run.cursor) - 1, -1);
  if (p < 0) return run;
  return { ...run, cursor: p, done: false, stepStartedAt: now };
}

/** Per-run question toggles (§4). Only OPTIONAL steps may be turned off, and
 *  only ones not yet reached — the current/answered ones stay as they were. */
export function setStepEnabled(run: ProbeRun, stepId: string, on: boolean): ProbeRun {
  const i = run.steps.findIndex((s) => s.id === stepId);
  if (i < 0 || i <= run.cursor || !run.steps[i].optional) return run;
  const steps = run.steps.map((s, k) => (k === i ? { ...s, enabled: on } : s));
  return { ...run, steps };
}

/** Exhibits with LOOPING probes (the Rubric's "anything else affected?")
 *  append the next round's steps mid-run. */
export function appendSteps(run: ProbeRun, defs: RunStepDef[]): ProbeRun {
  const off = new Set(run.ref.stepsOff ?? []);
  const more: RunStep[] = defs.map((d) => ({ ...d, enabled: !(d.optional && off.has(d.id)) }));
  const steps = [...run.steps, ...more];
  // A finished run that gains steps is live again.
  const cursor = run.done ? firstEnabledFrom(steps, run.steps.length, 1) : run.cursor;
  return { ...run, steps, cursor, done: cursor < 0 };
}

/** Tally for the filming strip + the attempts log. */
export function runSummary(run: ProbeRun): { total: number; answered: number; correct: number; skipped: number } {
  const live = run.steps.filter((s) => s.enabled);
  const answered = live.filter((s) => s.resolution?.kind === "attempt").length;
  const correct = live.filter((s) => s.resolution?.kind === "attempt" && s.resolution.correct === true).length;
  const skipped = live.filter((s) => s.resolution?.kind === "skip").length;
  return { total: live.length, answered, correct, skipped };
}

/** Generic checker for option steps whose expected answer rides in
 *  `data.expect`; null (ungraded) when a step carries none. */
export function checkExpect(step: RunStepDef, response: string): boolean | null {
  const want = step.data?.expect;
  return typeof want === "string" ? want === response : null;
}
