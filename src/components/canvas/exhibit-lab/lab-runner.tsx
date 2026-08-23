// LAB RUNNER (Exhibit Lab v2) — the ONE step UI every exhibit renders its
// questions through, and the keyboard controller the Lab page drives.
//
// THE ASK-FIRST LAW is enforced here structurally, twice over:
//   1. StepPanel only ever receives `reveal` from probe-run's reveal(run),
//      which is null until the step is attempted or explicitly skipped.
//   2. The "next" affordance (button AND Enter) is disabled until then —
//      probe-run's next() refuses anyway; the UI just says so.
// Exhibit surfaces (Rubric, Cycle) draw their world around this panel and get
// the same `reveal` value — they never read a step's `explain` themselves.
//
// STANDARD KEYS (filming): 1–9 pick an option · Enter = submit / next ·
// S = skip · ← → = previous / next step · ` = restart the run ·
// [ ] = previous / next item in the filming queue. Space is NOT used — it
// belongs to the film controller everywhere else in the app, and the Lab
// keeps that muscle memory intact.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NEON } from "../theme";
import { eventFor, recordProbeAttempt } from "./probe-attempts";
import { attempt, canReveal, currentStep, next, prev, reveal, runSummary, setStepEnabled, skip, startRun, type ProbeRun, type RunStepDef } from "./probe-run";
import type { ExhibitProbeRef } from "./probes";

export interface RunHandlers {
  answer: (response: string, correct: boolean | null) => void;
  pickOption: (n: number) => void;
  submitText: () => void;
  skip: () => void;
  next: () => void;
  prev: () => void;
  restart: () => void;
}

/** The run, plus handlers that also RECORD every attempt/skip (§7). */
export function useProbeRun(ref: ExhibitProbeRef, buildSteps: () => RunStepDef[], check: (step: RunStepDef, response: string) => boolean | null, onAnswered?: (step: RunStepDef, response: string, correct: boolean | null) => void) {
  const [run, setRun] = useState<ProbeRun>(() => startRun(ref, buildSteps(), Date.now()));
  const [text, setText] = useState("");
  const restart = useCallback(() => { setRun(startRun(ref, buildSteps(), Date.now())); setText(""); }, [ref, buildSteps]);
  // A new ref (next queue item) starts a fresh run.
  const refKeyStr = `${ref.exhibit}:${ref.probe}:${JSON.stringify(ref.seed ?? {})}:${(ref.stepsOff ?? []).join(",")}`;
  const lastKey = useRef(refKeyStr);
  useEffect(() => { if (lastKey.current !== refKeyStr) { lastKey.current = refKeyStr; restart(); } }, [refKeyStr, restart]);

  const step = currentStep(run);
  // Side effects (recording, the exhibit's onAnswered) stay OUTSIDE setState
  // updaters — StrictMode double-invokes updaters and would double-record.
  const runRef = useRef(run);
  runRef.current = run;
  const answer = useCallback((response: string, correct: boolean | null) => {
    const r = runRef.current;
    const s = currentStep(r);
    if (!s || s.resolution) return;
    const n = attempt(r, response, correct, Date.now());
    runRef.current = n;
    setRun(n);
    const res = currentStep(n)?.resolution;
    if (res) recordProbeAttempt(eventFor(n, s.id, res));
    onAnswered?.(s, response, correct);
  }, [onAnswered]);
  const handlers: RunHandlers = useMemo(() => ({
    answer,
    pickOption: (n) => { const s = currentStep(runRef.current); const opt = s?.options?.[n - 1]; if (s && opt != null && !s.resolution) answer(opt, check(s, opt)); },
    submitText: () => { const s = currentStep(runRef.current); if (!s || s.resolution) return; if (s.kind === "text") { if (!text.trim()) return; answer(text.trim(), check(s, text.trim())); setText(""); } },
    skip: () => { const r = runRef.current; const s = currentStep(r); if (!s || s.resolution) return; const n = skip(r, Date.now()); runRef.current = n; setRun(n); const res = currentStep(n)?.resolution; if (res) recordProbeAttempt(eventFor(n, s.id, res)); },
    next: () => setRun((r) => next(r, Date.now())),
    prev: () => setRun((r) => prev(r, Date.now())),
    restart,
  }), [text, answer, check, restart]);

  return { run, setRun, step, rev: reveal(run), text, setText, handlers, summary: runSummary(run), toggle: (id: string, on: boolean) => setRun((r) => setStepEnabled(r, id, on)) };
}

// ------------------------------------------------------------ keyboard

type KeyTarget = { handlers: RunHandlers; textFocused: () => boolean } | null;
const keyTargetRef: { current: KeyTarget } = { current: null };
export const registerKeyTarget = (t: KeyTarget): void => { keyTargetRef.current = t; };

/** Install once on the Lab page. Queue keys come from the page; run keys route
 *  to whichever exhibit is mounted. Typing in the self-test box keeps Enter
 *  (= submit) and blocks the single-letter keys. */
export function useLabKeys(queue: { prev: () => void; next: () => void }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = keyTargetRef.current;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "[" && !typing) { e.preventDefault(); queue.prev(); return; }
      if (e.key === "]" && !typing) { e.preventDefault(); queue.next(); return; }
      if (!t) return;
      if (e.key === "Enter") { e.preventDefault(); if (t.textFocused()) t.handlers.submitText(); else t.handlers.next(); return; }
      if (typing) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); t.handlers.pickOption(Number(e.key)); return; }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); t.handlers.skip(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); t.handlers.next(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); t.handlers.prev(); return; }
      if (e.key === "`") { e.preventDefault(); t.handlers.restart(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue]);
}

// ------------------------------------------------------------ the panel

const GOOD = "#3BF5A0", BAD = "#FF8B9E";

/** Prompt · options/text · Skip · (reveal, only when allowed) · prev/next. */
export function StepPanel({ run, step, rev, text, setText, handlers, optionLabel, children }: {
  run: ProbeRun;
  step: ReturnType<typeof currentStep>;
  rev: ReturnType<typeof reveal>;
  text: string;
  setText: (s: string) => void;
  handlers: RunHandlers;
  /** Exhibits may relabel options per step (the Rubric narrows the account list). */
  optionLabel?: (opt: string) => string;
  /** Rendered INSIDE the reveal box (exhibit-specific reveal painting). */
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { registerKeyTarget({ handlers, textFocused: () => document.activeElement === inputRef.current }); return () => registerKeyTarget(null); }, [handlers]);
  useEffect(() => { if (step?.kind === "text" && !step.resolution) inputRef.current?.focus(); }, [step?.id, step?.resolution, step?.kind]);
  const sum = runSummary(run);
  if (!step) {
    return (
      <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${GOOD}` }}>
        <div className="text-[12px] font-black uppercase tracking-wider" style={{ color: GOOD }}>Run complete</div>
        <div className="mt-1 text-[12px]" style={{ color: NEON.text }}>{sum.correct}/{sum.answered} answered right · {sum.skipped} skipped</div>
        <div className="mt-2 flex gap-2">
          <button className="rounded px-2 py-1 text-[11px] font-bold uppercase" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={handlers.prev}>← back</button>
          <button className="rounded px-2 py-1 text-[11px] font-bold uppercase" style={{ color: "#0B1322", background: NEON.yellow }} onClick={handlers.restart}>` restart</button>
        </div>
      </div>
    );
  }
  const resolved = canReveal(step);
  const isSkip = step.resolution?.kind === "skip";
  const correct = step.resolution?.kind === "attempt" ? step.resolution.correct : null;
  const idx = run.steps.filter((s) => s.enabled).findIndex((s) => s.id === step.id);
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${resolved ? (correct === false ? BAD : GOOD) : NEON.border}` }}>
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider" style={{ color: NEON.muted }}>
        <span>Step {idx + 1} / {sum.total}</span>
        {!resolved && <span style={{ color: NEON.yellow }}>· ask first</span>}
        {resolved && <span style={{ color: isSkip ? NEON.muted : correct === false ? BAD : GOOD }}>· {isSkip ? "skipped" : correct === false ? "not quite" : correct == null ? "noted" : "correct"}</span>}
      </div>
      <div className="mt-1 text-[17px] font-black leading-snug" style={{ color: "#F4EFE6" }}>{step.prompt}</div>

      {(step.kind === "choice" || step.kind === "sign" || step.kind === "confirm") && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(step.options ?? []).map((opt, i) => {
            const chosen = step.resolution?.kind === "attempt" && step.resolution.response === opt;
            return (
              <button key={opt} disabled={resolved} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:cursor-default" style={{ color: chosen ? "#0B1322" : NEON.text, background: chosen ? (correct === false ? BAD : GOOD) : "rgba(255,255,255,0.04)", border: `1px solid ${chosen ? "transparent" : NEON.borderSoft}`, opacity: resolved && !chosen ? 0.45 : 1, transition: "all 180ms ease" }}
                onClick={() => handlers.pickOption(i + 1)} title={`Press ${i + 1}`}>
                <span className="grid h-4 w-4 place-items-center rounded text-[9px] font-black" style={{ background: "rgba(0,0,0,0.35)", color: NEON.muted }}>{i + 1}</span>
                {optionLabel ? optionLabel(opt) : opt}
              </button>
            );
          })}
        </div>
      )}
      {step.kind === "text" && (
        <div className="mt-3 flex gap-1.5">
          <input ref={inputRef} disabled={resolved} value={resolved && step.resolution?.kind === "attempt" ? step.resolution.response : text} onChange={(e) => setText(e.target.value)} placeholder="type it… (Enter)" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${NEON.borderSoft}`, color: "#F4EFE6" }} />
          {!resolved && <button className="rounded-lg px-3 text-[11px] font-black uppercase" style={{ color: "#0B1322", background: NEON.yellow }} onClick={handlers.submitText}>check</button>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {!resolved && <button className="rounded px-2 py-1 text-[10px] font-bold uppercase" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={handlers.skip} title="S — skip this question (the reveal opens; it's recorded as a skip)">skip · S</button>}
        <span className="flex-1" />
        <button className="rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-30" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} disabled={idx <= 0} onClick={handlers.prev}>← prev</button>
        <button className="rounded px-2 py-1 text-[10px] font-black uppercase disabled:opacity-30" style={{ color: "#0B1322", background: resolved ? GOOD : NEON.muted }} disabled={!resolved} onClick={handlers.next} title={resolved ? "Enter / → — next step" : "Answer or skip first — nothing reveals before an attempt"}>next →</button>
      </div>

      {/* THE REVEAL — rendered ONLY from reveal(run). Before an attempt/skip
          this block does not exist in the DOM at all. */}
      {rev && (
        <div className="mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: "rgba(59,245,160,0.08)", border: `1px solid rgba(59,245,160,0.35)`, color: "#F4EFE6", animation: "sa-lab-reveal 200ms ease" }}>
          {rev.explain && <div>{rev.explain}</div>}
          {children}
        </div>
      )}
      <style>{`@keyframes sa-lab-reveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

/** Per-run question toggles (§4) — only OPTIONAL, not-yet-reached steps. */
export function StepToggles({ run, onToggle }: { run: ProbeRun; onToggle: (id: string, on: boolean) => void }) {
  const optional = run.steps.filter((s) => s.optional);
  if (!optional.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>
      <span>this run asks:</span>
      {optional.map((s, i) => {
        const locked = run.steps.findIndex((x) => x.id === s.id) <= run.cursor;
        return (
          <label key={s.id} className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ border: `1px solid ${s.enabled ? "rgba(59,245,160,0.5)" : NEON.borderSoft}`, color: s.enabled ? "#3BF5A0" : NEON.muted, opacity: locked ? 0.5 : 1, cursor: locked ? "default" : "pointer" }} title={locked ? "Already reached — toggles apply to steps ahead" : "Toggle this question for the current run"}>
            <input type="checkbox" disabled={locked} checked={s.enabled} onChange={(e) => onToggle(s.id, e.target.checked)} />
            {s.prompt.length > 34 ? s.prompt.slice(0, 32) + "…" : s.prompt}{i < optional.length - 1 ? "" : ""}
          </label>
        );
      })}
    </div>
  );
}
