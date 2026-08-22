// THE RUBRIC EXHIBIT (Exhibit Lab v2, §4) — A = L + E | Revs & Exps, with the
// FOUR QUESTIONS as a PROGRESSIVE ZOOM:
//   1. type   → that region lights, everything else dims
//   2. account→ the view narrows to that type's list; the pick becomes a CHIP
//   3. sign   → +/− or −/+ toggle; the sign region lights to show WHY
//   4. else?  → zoom back out, repeat — chips accumulate until it balances
// The chip tray IS the journal entry being assembled: when it balances it
// becomes one (debits first, credits indented) — the payoff on camera. The
// camera never cuts: the exhibit breathes in and out (150–250ms, no bounce).
//
// THE LAW: this surface never reads a step's `explain`. The only explanation
// it can paint comes from the runner's `rev` (probe-run's reveal), which is
// null until an attempt or a skip. Step 3 is optional per run (§4 toggles);
// when it's off, the sign is filled from the scenario so the entry still
// assembles.
import { useCallback, useMemo, useRef, useState } from "react";

import { BIG_FONT, NEON } from "../theme";
import { StepPanel, StepToggles, useProbeRun } from "./lab-runner";
import { appendSteps, type RunStepDef } from "./probe-run";
import type { ExhibitProbeRef } from "./probes";
import { ACCOUNTS, ACCT_TYPES, acctType, checkExpect, checkFourQuestions, entryBalanced, flipSteps, fourQuestionRound, journalLines, scenarioById, timingSteps, whatIfSteps, type AcctType, type Chip, type Scenario } from "./rubric-model";

const T = "transform 220ms ease, opacity 220ms ease, box-shadow 220ms ease, background 220ms ease, border-color 220ms ease";
const GOLD = "#FCA311", GOOD = "#3BF5A0";

type Stage = "full" | "type" | "account" | "sign";

/** The equation itself — regions light/dim by stage. Pure paint. */
function Equation({ lit, stage, signLit }: { lit: AcctType | null; stage: Stage; signLit: boolean }) {
  const region = (id: AcctType, text: string) => {
    const on = lit === id;
    const dim = lit != null && !on;
    return (
      <span key={id} className="relative inline-block rounded-xl px-3 py-1" style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: 56, lineHeight: 1, color: on ? "#0B1322" : "#F4EFE6", background: on ? GOLD : "transparent", boxShadow: on ? `0 0 34px rgba(252,163,17,0.55)` : undefined, opacity: dim ? 0.28 : 1, transform: on ? "scale(1.06)" : "scale(1)", transition: T }}>
        {text}
        {/* the SIGN under each region — step 3 lights it to show WHY */}
        <span className="absolute left-1/2 -bottom-5 -translate-x-1/2 rounded px-1.5 text-[13px] font-black tabular-nums" style={{ color: on && signLit ? "#0B1322" : GOLD, background: on && signLit ? GOOD : "transparent", boxShadow: on && signLit ? `0 0 18px rgba(59,245,160,0.7)` : undefined, transition: T, opacity: dim ? 0.28 : 1 }}>{acctType(id).sign}</span>
      </span>
    );
  };
  const scale = stage === "account" ? 0.55 : stage === "sign" ? 0.8 : 1;
  return (
    <div className="flex flex-col items-center" style={{ transform: `scale(${scale})`, transformOrigin: "top center", transition: T, opacity: stage === "account" ? 0.7 : 1 }}>
      <div className="flex items-end gap-2 whitespace-nowrap">
        {region("A", "A")}
        <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: 56, color: "#F4EFE6", opacity: lit ? 0.28 : 1, transition: T }}>=</span>
        {region("L", "L")}
        <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: 56, color: "#F4EFE6", opacity: lit ? 0.28 : 1, transition: T }}>+</span>
        {region("E", "E")}
        <span className="mx-3" style={{ fontFamily: BIG_FONT, fontWeight: 300, fontSize: 56, color: NEON.muted, opacity: lit ? 0.28 : 0.6, transition: T }}>|</span>
        {region("R", "Revs")}
        <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: 56, color: "#F4EFE6", opacity: lit ? 0.28 : 1, transition: T }}>&amp;</span>
        {region("X", "Exps")}
      </div>
      <div className="mt-8 flex w-full justify-between px-6 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>
        <span>balance sheet</span><span>R/E is the bridge</span><span>income statement</span>
      </div>
    </div>
  );
}

/** The tray: chips while assembling; a JOURNAL ENTRY the moment it balances. */
function Tray({ chips, pending, balanced }: { chips: Chip[]; pending: Partial<Chip>; balanced: boolean }) {
  if (balanced) {
    const lines = journalLines(chips);
    return (
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.94)", border: `2px solid ${GOOD}`, boxShadow: `0 0 40px rgba(59,245,160,0.35)`, animation: "sa-lab-reveal 240ms ease" }}>
        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#5b6b8a" }}>Journal entry — it balances</div>
        <table className="w-full text-[14px]" style={{ color: "#0B1322", fontVariantNumeric: "tabular-nums" }}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5 font-bold" style={{ paddingLeft: l.indent ? 28 : 0 }}>{l.account}</td>
                <td className="w-20 text-right">{l.dr != null ? l.dr.toLocaleString() : ""}</td>
                <td className="w-20 text-right">{l.cr != null ? l.cr.toLocaleString() : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.35)", border: `1px dashed ${NEON.borderSoft}`, transition: T }}>
      <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>entry</span>
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(252,163,17,0.16)", border: `1px solid ${GOLD}`, color: "#F4EFE6", animation: "sa-lab-reveal 200ms ease" }}>
          <span className="rounded px-1 text-[9px] font-black" style={{ background: c.dr ? GOOD : "#B79CFF", color: "#0B1322" }}>{c.dr ? "Dr" : "Cr"}</span>{c.account}
        </span>
      ))}
      {pending.account && (
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ border: `1px dashed ${GOLD}`, color: NEON.muted }}>
          <span className="rounded px-1 text-[9px] font-black" style={{ border: `1px solid ${NEON.borderSoft}` }}>?</span>{pending.account}
        </span>
      )}
      {!chips.length && !pending.account && <span className="text-[11px] italic" style={{ color: NEON.muted }}>chips land here as you answer — it becomes the entry when it balances</span>}
    </div>
  );
}

export function RubricExhibit({ probeRef }: { probeRef: ExhibitProbeRef }) {
  const sc: Scenario = useMemo(() => scenarioById(String(probeRef.seed?.scenario ?? "supplies-cash")), [probeRef.seed?.scenario]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [pending, setPending] = useState<Partial<Chip>>({});
  const chipsRef = useRef(chips); chipsRef.current = chips;
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const [effects, setEffects] = useState<string[]>([]);

  const buildSteps = useCallback((): RunStepDef[] => {
    setChips([]); setPending({}); setEffects([]);
    if (probeRef.probe === "four_questions") return fourQuestionRound(1);
    if (probeRef.probe === "what_if_we_dont") return whatIfSteps(sc);
    if (probeRef.probe === "flip_it") return flipSteps(sc);
    if (probeRef.probe === "accrual_or_deferral") return timingSteps(sc);
    return [{ id: "noop", prompt: `The Rubric doesn't run "${probeRef.probe}" yet — pick another probe.`, kind: "confirm", options: ["OK"], explain: "This probe is registered but no-ops on this exhibit for now." }];
  }, [probeRef.probe, sc]);

  const check = useCallback((step: RunStepDef, response: string): boolean | null => {
    const q = step.data?.q;
    if (typeof q === "string") return checkFourQuestions(sc, chipsRef.current, q, pendingRef.current, response).correct;
    return checkExpect(step, response);
  }, [sc]);

  const lab = useProbeRun(probeRef, buildSteps, check);
  const { run, setRun, step, rev } = lab;

  // FOUR QUESTIONS state machine — runs AFTER an attempt is recorded (never
  // before): patch the reveal text, advance the chip, narrow the next step.
  const onAnswered = useCallback((st: RunStepDef, response: string) => {
    const q = st.data?.q;
    if (typeof q !== "string") {
      if (probeRef.probe === "what_if_we_dont" && st.data?.expect) setEffects((e) => [...e, `${st.prompt.replace("If this entry is skipped: ", "").replace(" is…", "")}: ${String(st.data?.expect).toUpperCase()}`]);
      return;
    }
    const r = checkFourQuestions(sc, chipsRef.current, q, pendingRef.current, response);
    const round = Number(st.data?.round ?? 1);
    let nextPending = { ...pendingRef.current, ...(r.correct ? r.chip : {}) };
    setRun((cur) => {
      let steps = cur.steps.map((s) => (s.id === st.id ? { ...s, explain: r.explain } : s));
      if (q === "type" && r.correct && r.chip?.type) {
        // NARROW the universe: the account step now offers only this type's list.
        steps = steps.map((s) => (s.id === `r${round}.account` ? { ...s, options: ACCOUNTS[r.chip!.type!] } : s));
      }
      let n = { ...cur, steps };
      if (q === "account" && r.correct) {
        const signStep = steps.find((s) => s.id === `r${round}.sign`);
        if (signStep && !signStep.enabled) {
          // Step 3 toggled OFF for this run: fill the side from the scenario so
          // the entry still assembles on camera.
          const exp = sc.entry.find((e) => e.account === response);
          if (exp) { nextPending = { ...nextPending, dr: exp.dr }; }
        }
      }
      if (q === "else" && r.correct && response.startsWith("Yes")) n = appendSteps(n, fourQuestionRound(round + 1));
      return n;
    });
    // Commit the chip when its side is known (sign answered, or sign skipped via toggle).
    if ((q === "sign" && r.correct) || (q === "account" && r.correct && nextPending.dr != null)) {
      const done: Chip = { account: nextPending.account!, type: nextPending.type!, dr: nextPending.dr!, amount: sc.entry.find((e) => e.account === nextPending.account)?.amount };
      setChips((c) => [...c, done]);
      setPending({});
      return;
    }
    setPending(nextPending);
  }, [sc, setRun, probeRef.probe]);
  // Wire the exhibit's reaction into the runner's answer path.
  const labWithHook = useMemo(() => ({ ...lab, handlers: { ...lab.handlers, answer: (resp: string, correct: boolean | null) => { lab.handlers.answer(resp, correct); const st = step; if (st) onAnswered(st, resp); }, pickOption: (n: number) => { const opt = step?.options?.[n - 1]; if (step && opt != null && !step.resolution) { lab.handlers.answer(opt, check(step, opt)); onAnswered(step, opt); } } } }), [lab, step, onAnswered, check]);

  const q = typeof step?.data?.q === "string" ? (step.data.q as string) : null;
  const stage: Stage = !q || q === "else" ? "full" : q === "type" ? "type" : q === "account" ? "account" : "sign";
  const lit: AcctType | null = pending.type ?? (q === "type" && step?.resolution?.kind === "attempt" ? ACCT_TYPES.find((t) => t.label === (step.resolution as { response: string }).response)?.id ?? null : null);
  const balanced = entryBalanced(chips) && !pending.account && (probeRef.probe !== "four_questions" || run.done || q === "else");
  const showEntry = probeRef.probe !== "four_questions";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: GOLD, color: "#0B1322" }}>Rubric</span>
        <span className="text-[12px] font-bold" style={{ color: "#F4EFE6" }}>{sc.text}</span>
        <span className="flex-1" />
        <StepToggles run={run} onToggle={lab.toggle} />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-8 rounded-2xl p-6" style={{ background: "radial-gradient(ellipse at 50% 35%, rgba(37,52,88,0.55), rgba(9,13,26,0.9) 70%)", border: `1px solid ${NEON.borderSoft}` }}>
          <Equation lit={lit} stage={stage} signLit={stage === "sign" && !!step?.resolution} />
          {showEntry ? (
            <Tray chips={sc.entry} pending={{}} balanced />
          ) : (
            <Tray chips={chips} pending={pending} balanced={balanced} />
          )}
          {effects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {effects.map((e, i) => <span key={i} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: e.endsWith("OVERSTATED") ? "rgba(255,139,158,0.18)" : "rgba(122,210,255,0.18)", border: `1px solid ${e.endsWith("OVERSTATED") ? "#FF8B9E" : "#7AD2FF"}`, color: "#F4EFE6" }}>{e}</span>)}
            </div>
          )}
        </div>
        <div className="w-[380px] shrink-0">
          <StepPanel run={run} step={step} rev={rev} text={lab.text} setText={lab.setText} handlers={labWithHook.handlers} />
        </div>
      </div>
    </div>
  );
}
