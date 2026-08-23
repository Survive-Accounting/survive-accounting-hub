// THE RUBRIC EXHIBIT (Rubric v2) — the FILMING WRAPPER around RubricBoard.
//
// THE RUBRIC IS THE SCREEN. This file owns only what filming needs — the
// reveal step, the zoom, the statements toggle, and the keys that drive them —
// and keeps every probe out of the frame: the Probe Library, the ask-first
// step panel and the chip tray all live in a collapsible drawer that is CLOSED
// by default (§1). Nothing is deleted; the teaching questions are one click
// away, and Lee runs them verbally on camera.
//
// KEYS (this surface, only while the drawer is CLOSED so the probe keys can
// never fight them):
//   Tab / Shift+Tab  next / previous reveal step
//   `                reset to BLANK (and zoom out) — how a take starts
//   Esc              zoom out
//   1–5              zoom into A · L · E · Revs · Exps
//   6                statements layer on/off
// Space is never used: it belongs to the film controller everywhere else.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NEON } from "../theme";
import { RubricBoard } from "./RubricBoard";
import { StepPanel, StepToggles, useProbeRun } from "./lab-runner";
import { appendSteps, type RunStepDef } from "./probe-run";
import type { ExhibitProbeRef } from "./probes";
import { ACCOUNTS, checkExpect, checkFourQuestions, entryBalanced, flipSteps, fourQuestionRound, journalLines, scenarioById, timingSteps, whatIfSteps, type AcctType, type Chip, type Scenario } from "./rubric-model";
import { ELEMENT_FULL, ELEMENT_ORDER, REVEAL_LABELS, REVEAL_LAST, nextReveal, prevReveal } from "./rubric-view";

const GOLD = "#FCA311", GOOD = "#3BF5A0";

/** The chip tray — the probe's journal entry, now inside the drawer (it is
 *  probe machinery, and the board stays clean). */
function Tray({ chips, pending, balanced }: { chips: Chip[]; pending: Partial<Chip>; balanced: boolean }) {
  if (balanced) {
    const lines = journalLines(chips);
    return (
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.94)", border: `2px solid ${GOOD}` }}>
        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#5b6b8a" }}>Journal entry — it balances</div>
        <table className="w-full text-[13px]" style={{ color: "#0B1322", fontVariantNumeric: "tabular-nums" }}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5 font-bold" style={{ paddingLeft: l.indent ? 24 : 0 }}>{l.account}</td>
                <td className="w-16 text-right">{l.dr != null ? l.dr.toLocaleString() : ""}</td>
                <td className="w-16 text-right">{l.cr != null ? l.cr.toLocaleString() : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.35)", border: `1px dashed ${NEON.borderSoft}` }}>
      <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>entry</span>
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(252,163,17,0.16)", border: `1px solid ${GOLD}`, color: "#F4EFE6" }}>
          <span className="rounded px-1 text-[9px] font-black" style={{ background: c.dr ? GOOD : "#B79CFF", color: "#0B1322" }}>{c.dr ? "Dr" : "Cr"}</span>{c.account}
        </span>
      ))}
      {pending.account && (
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ border: `1px dashed ${GOLD}`, color: NEON.muted }}>
          <span className="rounded px-1 text-[9px] font-black" style={{ border: `1px solid ${NEON.borderSoft}` }}>?</span>{pending.account}
        </span>
      )}
      {!chips.length && !pending.account && <span className="text-[10px] italic" style={{ color: NEON.muted }}>chips land here as you answer</span>}
    </div>
  );
}

export function RubricExhibit({ probeRef, labControls }: {
  probeRef: ExhibitProbeRef;
  /** The Lab's probe controls (scenario picker + probe library), rendered INSIDE
   *  this exhibit's drawer so there is exactly one probe surface, not two. */
  labControls?: React.ReactNode;
}) {
  const sc: Scenario = useMemo(() => scenarioById(String(probeRef.seed?.scenario ?? "supplies-cash")), [probeRef.seed?.scenario]);

  // ---- the exhibit's own state: this is what films -----------------------
  const [drawer, setDrawer] = useState(false);
  /** null = FREE MODE (navigable, everything on); 1–7 = the authored build. */
  const [reveal, setReveal] = useState<number | null>(null);
  const [zoom, setZoom] = useState<AcctType | null>(null);
  const [statements, setStatements] = useState(false);

  const drawerRef = useRef(drawer); drawerRef.current = drawer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      // Tab is ours in BOTH states — no probe step uses it.
      if (e.key === "Tab") { e.preventDefault(); setReveal((r) => (e.shiftKey ? prevReveal(r ?? REVEAL_LAST) : nextReveal(r ?? 1))); return; }
      if (e.key === "Escape") { e.preventDefault(); setZoom(null); return; }
      // The rest only while the probe drawer is CLOSED: with it open the Lab's
      // run keys (1–9 · S · ← → · `) own the keyboard, and two owners is a bug.
      if (drawerRef.current) return;
      if (e.key === "`") { e.preventDefault(); setReveal(1); setZoom(null); return; }
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); setZoom(ELEMENT_ORDER[Number(e.key) - 1]); return; }
      if (e.key === "6") { e.preventDefault(); setStatements((s) => !s); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- the probe run: unchanged machinery, now behind the drawer ----------
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
      if (q === "type" && r.correct && r.chip?.type) steps = steps.map((s) => (s.id === `r${round}.account` ? { ...s, options: ACCOUNTS[r.chip!.type!] } : s));
      let n = { ...cur, steps };
      if (q === "account" && r.correct) {
        const signStep = steps.find((s) => s.id === `r${round}.sign`);
        if (signStep && !signStep.enabled) {
          const exp = sc.entry.find((e) => e.account === response);
          if (exp) nextPending = { ...nextPending, dr: exp.dr };
        }
      }
      if (q === "else" && r.correct && response.startsWith("Yes")) n = appendSteps(n, fourQuestionRound(round + 1));
      return n;
    });
    if ((q === "sign" && r.correct) || (q === "account" && r.correct && nextPending.dr != null)) {
      const done: Chip = { account: nextPending.account!, type: nextPending.type!, dr: nextPending.dr!, amount: sc.entry.find((e) => e.account === nextPending.account)?.amount };
      setChips((c) => [...c, done]);
      setPending({});
      return;
    }
    setPending(nextPending);
  }, [sc, setRun, probeRef.probe]);

  const labWithHook = useMemo(() => ({ ...lab, handlers: { ...lab.handlers, answer: (resp: string, correct: boolean | null) => { lab.handlers.answer(resp, correct); const st = step; if (st) onAnswered(st, resp); }, pickOption: (n: number) => { const opt = step?.options?.[n - 1]; if (step && opt != null && !step.resolution) { lab.handlers.answer(opt, check(step, opt)); onAnswered(step, opt); } } } }), [lab, step, onAnswered, check]);

  const balanced = entryBalanced(chips) && !pending.account;
  const showScenarioEntry = probeRef.probe !== "four_questions";
  const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      {/* ── THE BOARD — full bleed. Everything below is chrome that never
             appears in a captured frame (the Lab's PRESENT mode hides it). ── */}
      <RubricBoard reveal={reveal} zoom={zoom} statements={statements} onZoom={setZoom} />

      {/* AUTHORING HUD — bottom-left, Lab-only. Present mode drops it. */}
      <div className="pointer-events-auto absolute bottom-2 left-2 flex items-center gap-1.5" data-lab-chrome>
        <button className={CHIP} style={{ color: reveal == null ? NEON.muted : "#0B1322", background: reveal == null ? "transparent" : GOLD, border: `1px solid ${NEON.borderSoft}` }}
          onClick={() => setReveal((r) => (r == null ? 1 : null))}
          title="BUILD MODE — the authored reveal (Tab / Shift+Tab step it, ` resets to blank). Off = the free, navigable rubric.">
          {reveal == null ? "free" : `build ${reveal}/${REVEAL_LAST}`}
        </button>
        {reveal != null && <span className="text-[9px]" style={{ color: NEON.muted }}>{REVEAL_LABELS[reveal - 1]}</span>}
        <button className={CHIP} style={{ color: statements ? "#0B1322" : NEON.muted, background: statements ? GOOD : "transparent", border: `1px solid ${NEON.borderSoft}` }}
          onClick={() => setStatements((s) => !s)} title="Statements layer (key 6) — BALANCE SHEET · R/E bridge · INCOME STATEMENT">statements</button>
        {zoom && <button className={CHIP} style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setZoom(null)} title="Esc">← {ELEMENT_FULL[zoom]}</button>}
        <span className="text-[9px]" style={{ color: NEON.muted }}>Tab reveal · ` blank · 1–5 zoom · 6 statements</span>
      </div>

      {/* ── THE PROBE DRAWER (§1) — closed by default; the rubric is the screen.
             All probe data is here, not deleted: library, ask-first steps, tray. ── */}
      <button
        data-lab-chrome
        onClick={() => setDrawer((d) => !d)}
        title={drawer ? "Hide the probes — the rubric is the screen" : "Probes — the teaching questions (kept, out of frame)"}
        style={{
          position: "absolute", top: 12, right: drawer ? 372 : 0, zIndex: 3,
          writingMode: "vertical-rl", padding: "10px 5px", borderRadius: "8px 0 0 8px",
          background: drawer ? GOLD : "rgba(0,0,0,0.5)", color: drawer ? "#0B1322" : NEON.muted,
          border: `1px solid ${NEON.borderSoft}`,
          fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase",
          transition: "right 220ms cubic-bezier(0.4,0,0.2,1), background 160ms ease",
        }}
      >probes</button>
      <div
        data-lab-chrome
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 372, zIndex: 2,
          transform: drawer ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
          background: "rgba(8,13,24,0.97)", borderLeft: `1px solid ${NEON.borderSoft}`,
          display: "flex", flexDirection: "column", gap: 10, padding: 12, overflowY: "auto",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>Probes</span>
          <span className="text-[9px]" style={{ color: NEON.muted }}>kept · never on the board</span>
          <span className="flex-1" />
          <StepToggles run={run} onToggle={lab.toggle} />
        </div>
        <div className="text-[11px] font-bold" style={{ color: "#F4EFE6" }}>{sc.text}</div>
        {/* Only mounted while OPEN: StepPanel registers the Lab's run keys, so a
            closed drawer hands 1–9 · S · ` back to the rubric automatically. */}
        {drawer && (
          <>
            <StepPanel run={run} step={step} rev={rev} text={lab.text} setText={lab.setText} handlers={labWithHook.handlers} />
            <Tray chips={showScenarioEntry ? sc.entry : chips} pending={showScenarioEntry ? {} : pending} balanced={showScenarioEntry || balanced} />
            {effects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {effects.map((e, i) => <span key={i} className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: e.endsWith("OVERSTATED") ? "rgba(255,139,158,0.18)" : "rgba(122,210,255,0.18)", border: `1px solid ${e.endsWith("OVERSTATED") ? "#FF8B9E" : "#7AD2FF"}`, color: "#F4EFE6" }}>{e}</span>)}
              </div>
            )}
            {labControls}
          </>
        )}
      </div>
    </div>
  );
}
