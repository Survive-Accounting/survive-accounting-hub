// THE GUIDED PATH — three screens before the videos, for the students who want structure.
//
// ── THE SKIP LINK IS THE MOST IMPORTANT CONTROL HERE ──────────────────────────────────────────
// A student who got texted this link at 11pm the night before an exam must never be held up by a
// setup flow. "Skip — just show me the videos" is on step 1, above the fold, and it is not styled
// as a decline: it is a legitimate answer, and for the highest-intent visitor on the surface it is
// the RIGHT answer. The path exists for the other student — the one two weeks out who wants to be
// told what to do — and pretending both are the same person costs us the first one entirely.
//
// ── AND THE NUMBER IS THE REASON THE OTHER STUDENT STAYS ──────────────────────────────────────
// "Cram: 94 min" is a decision someone can make. "Start studying" is not. So the estimate is the
// biggest thing on step 1 and it moves as modes toggle — adding Practice has to visibly cost
// something, or the choice is decoration.
//
// Every number comes from lib/study-plan.ts, which reports whether it MEASURED or GUESSED, and
// this screen says which. A confident wrong number is the failure that costs trust.
import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowRight, Check, Clock, Loader2 } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  GRADE_LABEL,
  MODE_BLURB,
  MODE_LABEL,
  STUDY_MODES,
  estimatePlan,
  formatDuration,
  type EstimableSet,
  type StudyMode,
  type TargetGrade,
} from "@/lib/study-plan";

export const STUDY_PATH_CSS = `
@keyframes sa-plan-build {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes sa-plan-sweep {
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
.sa-plan-in { animation: sa-plan-build 320ms ease-out both; }
.sa-plan-sweep { transform-origin: left center; animation: sa-plan-sweep 1100ms cubic-bezier(0.3, 0, 0.2, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .sa-plan-in, .sa-plan-sweep { animation: none; }
}
`;

export type PathStep = "modes" | "grade" | "building";

export function StudyPath({ sets, examLabel, onSkip, onCommit }: {
  /** The sets the plan covers — the selected exam's, so the estimate is about THIS exam. */
  sets: EstimableSet[];
  examLabel: string | null;
  onSkip: () => void;
  onCommit: (c: { modes: StudyMode[]; grade: TargetGrade; seconds: number; measured: boolean }) => void;
}) {
  const [step, setStep] = useState<PathStep>("modes");
  // Cram pre-selected: it is what the product IS, and an empty multiselect with a disabled
  // button is a screen that asks you to do work before it will tell you anything.
  const [modes, setModes] = useState<StudyMode[]>(["cram"]);
  const [grade, setGrade] = useState<TargetGrade>("a");

  const estimate = useMemo(() => estimatePlan(modes, sets), [modes, sets]);

  const toggleMode = (m: StudyMode) => {
    setModes((prev) => {
      const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
      // Never let it empty out — a plan with no modes has nothing to estimate and no CTA that
      // means anything. Un-picking the last mode is a no-op rather than a broken state.
      return next.length ? next : prev;
    });
  };

  if (step === "building") {
    return <BuildingPlan onDone={() => onCommit({ modes, grade, seconds: estimate.seconds, measured: estimate.measured })} />;
  }

  return (
    <div className="mx-auto w-full max-w-[520px]" style={{ fontFamily: BRAND_SANS }}>
      <style>{STUDY_PATH_CSS}</style>

      {/* THE NUMBER, FRONT AND CENTRE, on both steps. */}
      <div
        className="rounded-2xl px-4 py-4 text-center"
        style={{ background: "color-mix(in srgb, var(--lm-accent) 9%, transparent)", border: "1px solid color-mix(in srgb, var(--lm-accent) 38%, transparent)" }}
      >
        <p className="flex items-center justify-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--lm-muted)" }}>
          <Clock className="h-3.5 w-3.5" /> {examLabel ? `${examLabel} · your plan` : "Your plan"}
        </p>
        <p className="mt-1 text-[34px] font-black leading-none tabular-nums" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-accent)" }}>
          {formatDuration(estimate.seconds)}
        </p>
        {/* SAID, NOT IMPLIED. `measured` is false whenever any part of the total was filled in
            from an average or from the per-question guess — practice always is, because no
            practice player has shipped and nothing has ever been timed. */}
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--lm-muted)" }}>
          {estimate.measured
            ? "Measured from the actual video lengths."
            : "An estimate — practice time is a guess until the question player ships."}
        </p>
      </div>

      {step === "modes" ? (
        <div className="sa-plan-in mt-5">
          <h2 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
            How do you want to study?
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--lm-muted)" }}>Pick any. Each one adds to the time above.</p>

          <div className="mt-3 flex flex-col gap-2">
            {STUDY_MODES.map((m) => {
              const on = modes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMode(m)}
                  aria-pressed={on}
                  className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left"
                  style={{
                    background: on ? "color-mix(in srgb, var(--lm-accent) 10%, transparent)" : "rgba(255,255,255,0.035)",
                    border: `1px solid ${on ? "var(--lm-accent)" : "var(--lm-border)"}`,
                    cursor: "pointer", minHeight: 62,
                  }}
                >
                  <span
                    className="mt-0.5 grid shrink-0 place-items-center rounded-md"
                    style={{ height: 22, width: 22, background: on ? "var(--lm-accent)" : "transparent", border: `2px solid ${on ? "var(--lm-accent)" : "var(--lm-border)"}`, color: "var(--lm-accent-ink)" }}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-black" style={{ color: "var(--lm-text)" }}>{MODE_LABEL[m]}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--lm-muted)" }}>{MODE_BLURB[m]}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setStep("grade")}
            className="mt-4 w-full rounded-xl text-[15px] font-black"
            style={{ minHeight: 54, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
          >
            Next →
          </button>

          {/* THE ESCAPE HATCH. Not styled as a decline — see the note at the top of this file. */}
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 w-full text-[13.5px] font-bold underline underline-offset-4"
            style={{ minHeight: 48, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
          >
            Skip — just show me the videos
          </button>
        </div>
      ) : (
        <div className="sa-plan-in mt-5">
          <h2 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
            What are you going for?
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--lm-muted)" }}>
            No wrong answer. It changes what I put first.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {(["a", "b", "pass"] as TargetGrade[]).map((g) => {
              const on = grade === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 rounded-xl px-4 text-left"
                  style={{
                    minHeight: 56,
                    background: on ? "color-mix(in srgb, var(--lm-accent) 10%, transparent)" : "rgba(255,255,255,0.035)",
                    border: `1px solid ${on ? "var(--lm-accent)" : "var(--lm-border)"}`,
                    cursor: "pointer",
                  }}
                >
                  <span
                    className="grid shrink-0 place-items-center rounded-full"
                    style={{ height: 20, width: 20, border: `2px solid ${on ? "var(--lm-accent)" : "var(--lm-border)"}` }}
                  >
                    {on && <span style={{ height: 10, width: 10, borderRadius: 999, background: "var(--lm-accent)" }} />}
                  </span>
                  <span className="text-[15px] font-black" style={{ color: "var(--lm-text)" }}>{GRADE_LABEL[g]}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setStep("building")}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl text-[15px] font-black"
            style={{ minHeight: 54, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
          >
            Begin study plan <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setStep("modes")}
            className="mt-2 w-full text-[13px] font-bold"
            style={{ minHeight: 44, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

/** THE BUILD ANIMATION. ~1.1s, then it hands over.
 *
 *  It is not a fake loading bar for work that is not happening — the plan is derived
 *  synchronously — it is a BEAT, and the beat is doing real work for the student: it marks the
 *  moment their answers became a thing, which is what makes the plan screen feel like a result
 *  rather than the next form. Kept short enough that it never becomes a wait, and
 *  reduced-motion-safe (the sweep stops; the timer does not, so the flow cannot strand anyone). */
function BuildingPlan({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  // onDone is read from a ref so a parent re-render cannot restart the timer and leave the
  // student watching the sweep twice.
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => { setDone(true); cb.current(); }, 1100);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[520px] place-items-center py-16 text-center" style={{ fontFamily: BRAND_SANS }}>
      <style>{STUDY_PATH_CSS}</style>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--lm-accent)" }} />
      <p className="mt-3 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
        {done ? "Ready." : "Building your plan…"}
      </p>
      <span
        aria-hidden
        className="sa-plan-sweep mt-3 block h-[3px] w-[180px] rounded-full"
        style={{ background: "var(--lm-accent)" }}
      />
    </div>
  );
}
