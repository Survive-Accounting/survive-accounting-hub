// THE RUBRIC EXHIBIT (v3) — the FILMING WRAPPER around RubricBoard.
//
// THE RUBRIC IS THE SCREEN. This file owns only what filming needs — the
// switches (what the board is teaching), the reveal step, the zoom, the
// per-element opens and movements, and the keys that drive them — and keeps
// every probe out of the frame: the Probe Library, the ask-first step panel
// and the chip tray live in a drawer that is CLOSED by default (§1). Nothing
// is deleted; the teaching questions are one click away, and Lee runs them
// verbally on camera.
//
// KEYS (only while the drawer is CLOSED, so the probe keys can never fight
// them; Tab and Esc are ours in both states):
//   Tab / Shift+Tab   next / previous reveal step
//   `                 reset to BLANK — how a take starts
//   Esc               close the open columns / zoom out
//   1–5               open A · L · E · Revs · Exps in place (def + accounts)
//   Shift+1–5         zoom that element to fill the frame
//   6 7 8 9 0         statements · signs · defs · accounts · arrows
//   N · T             normal-balance highlight · T-accounts
//   M                 cycle the teaching mode
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NEON } from "../theme";
import { RubricBoard } from "./RubricBoard";
import { StepPanel, StepToggles, useProbeRun } from "./lab-runner";
import { appendSteps, type RunStepDef } from "./probe-run";
import type { ExhibitProbeRef } from "./probes";
import { ACCOUNTS, checkExpect, checkFourQuestions, entryBalanced, flipSteps, fourQuestionRound, journalLines, scenarioById, timingSteps, whatIfSteps, type AcctType, type Chip, type Scenario } from "./rubric-model";
import {
  ALL_OFF, ELEMENT_FULL, ELEMENT_ORDER, MODES, MODE_IDS, REVEAL_LABELS, REVEAL_LAST,
  matchMode, modeById, nextMovement, nextReveal, prevReveal,
  type Movement, type RubricMode, type RubricToggles,
} from "./rubric-view";

const GOLD = "#FCA311", GOOD = "#3BF5A0";

/** The switch a key flips. Order matches the 6·7·8·9·0 row. */
const KEY_TOGGLES: { code: string; key: keyof RubricToggles; label: string }[] = [
  { code: "Digit6", key: "statements", label: "statements" },
  { code: "Digit7", key: "signs", label: "(+/−)" },
  { code: "Digit8", key: "defs", label: "defs" },
  { code: "Digit9", key: "accounts", label: "accounts" },
  { code: "Digit0", key: "arrows", label: "↑↓" },
  { code: "KeyN", key: "normal", label: "normal bal." },
  { code: "KeyT", key: "tAccounts", label: "T-accounts" },
];

/** The chip tray — the probe's journal entry, inside the drawer (it is probe
 *  machinery, and the board stays clean). */
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
  /** The Lab's probe controls (scenario picker + library), rendered INSIDE this
   *  exhibit's drawer so there is exactly one probe surface, not two. */
  labControls?: React.ReactNode;
}) {
  const sc: Scenario = useMemo(() => scenarioById(String(probeRef.seed?.scenario ?? "supplies-cash")), [probeRef.seed?.scenario]);

  // ---- the exhibit's own state: this is what films -----------------------
  const [drawer, setDrawer] = useState(false);
  const [gear, setGear] = useState(false);
  /** null = FREE MODE (navigable, everything its switches allow); 1–7 = build. */
  const [reveal, setReveal] = useState<number | null>(null);
  const [zoom, setZoom] = useState<AcctType | null>(null);
  /** The switches. Default: the clean equation — the pair above, one-word defs. */
  const [toggles, setToggles] = useState<RubricToggles>({ ...ALL_OFF, signs: true, defs: true });
  const [open, setOpen] = useState<ReadonlySet<AcctType>>(new Set());
  const [movements, setMovements] = useState<Partial<Record<AcctType, Movement>>>({});

  const flip = useCallback((k: keyof RubricToggles) => setToggles((t) => ({ ...t, [k]: !t[k] })), []);
  const setMode = useCallback((m: RubricMode) => { setToggles(modeById(m)); setOpen(new Set()); }, []);
  const mode = matchMode(toggles);

  const drawerRef = useRef(drawer); drawerRef.current = drawer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      // Tab / Esc are ours in BOTH states — no probe step uses them.
      if (e.key === "Tab") { e.preventDefault(); setReveal((r) => (e.shiftKey ? prevReveal(r ?? REVEAL_LAST) : nextReveal(r ?? 1))); return; }
      if (e.key === "Escape") { e.preventDefault(); setZoom(null); setOpen(new Set()); return; }
      // The rest only while the probe drawer is CLOSED: with it open the Lab's
      // run keys (1–9 · S · ← → · `) own the keyboard, and two owners is a bug.
      if (drawerRef.current) return;
      if (e.key === "`") { e.preventDefault(); setReveal(1); setZoom(null); setOpen(new Set()); setMovements({}); return; }
      // Digits by CODE, so Shift+1 is still "the first element", not "!".
      const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].indexOf(e.code);
      if (idx >= 0) {
        e.preventDefault();
        const t = ELEMENT_ORDER[idx];
        if (e.shiftKey) setZoom((z) => (z === t ? null : t));
        else setOpen((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
        return;
      }
      const kt = KEY_TOGGLES.find((k) => k.code === e.code);
      if (kt) { e.preventDefault(); flip(kt.key); return; }
      if (e.code === "KeyM") { e.preventDefault(); setMode(MODE_IDS[(Math.max(0, MODE_IDS.indexOf(mode ?? "types")) + 1) % MODE_IDS.length]); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, setMode, mode]);

  const toggleOpen = useCallback((t: AcctType) => setOpen((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; }), []);
  const cycleMovement = useCallback((t: AcctType) => setMovements((m) => ({ ...m, [t]: nextMovement(m[t] ?? null) })), []);

  // ---- the probe run: unchanged machinery, behind the drawer --------------
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
      <RubricBoard
        reveal={reveal} zoom={zoom} toggles={toggles} open={open} movements={movements}
        onZoom={setZoom} onToggleOpen={toggleOpen} onCycleMovement={cycleMovement}
      />

      {/* GEAR — the switches. Authoring chrome: set the shot up here, then P. */}
      <button
        data-lab-chrome
        onClick={() => setGear((g) => !g)}
        title="Teaching modes + switches — what this board is teaching"
        className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-[13px]"
        style={{ zIndex: 4, background: gear ? GOLD : "rgba(0,0,0,0.55)", color: gear ? "#0B1322" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
      >⚙</button>
      {gear && (
        <div data-lab-chrome className="absolute left-2 top-11 w-[248px] rounded-xl p-2.5" style={{ zIndex: 4, background: "rgba(8,13,24,0.97)", border: `1px solid ${NEON.borderSoft}` }}>
          <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Teaching mode <span style={{ color: GOLD }}>{mode ?? "custom"}</span></div>
          <div className="mb-2 flex flex-wrap gap-1">
            {MODES.map((m) => (
              <button key={m.id} className={CHIP} title={m.blurb}
                style={{ color: mode === m.id ? "#0B1322" : "#F4EFE6", background: mode === m.id ? GOLD : "transparent", border: `1px solid ${NEON.borderSoft}` }}
                onClick={() => setMode(m.id)}>{m.name}</button>
            ))}
          </div>
          <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Show</div>
          {KEY_TOGGLES.map((k) => (
            <label key={k.key} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px]" style={{ color: toggles[k.key] ? "#F4EFE6" : NEON.muted }}>
              <input type="checkbox" checked={toggles[k.key]} onChange={() => flip(k.key)} />
              <span className="flex-1">{k.label}</span>
              <span className="text-[8px]" style={{ color: NEON.muted }}>{k.code.replace("Digit", "").replace("Key", "")}</span>
            </label>
          ))}
          <div className="mt-1.5 border-t pt-1.5 text-[9px] leading-relaxed" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
            Click a letter to open just that one · click above it to step ↑ ↓ ↑↓ · Shift+1–5 zooms.
          </div>
        </div>
      )}

      {/* AUTHORING HUD — bottom-left, Lab-only. Present mode drops it. */}
      <div className="pointer-events-auto absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5" data-lab-chrome>
        <button className={CHIP} style={{ color: reveal == null ? NEON.muted : "#0B1322", background: reveal == null ? "transparent" : GOLD, border: `1px solid ${NEON.borderSoft}` }}
          onClick={() => setReveal((r) => (r == null ? 1 : null))}
          title="BUILD MODE — the authored reveal (Tab / Shift+Tab step it, ` resets to blank). Off = the free, navigable rubric.">
          {reveal == null ? "free" : `build ${reveal}/${REVEAL_LAST}`}
        </button>
        {reveal != null && <span className="text-[9px]" style={{ color: NEON.muted }}>{REVEAL_LABELS[reveal - 1]}</span>}
        {zoom && <button className={CHIP} style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setZoom(null)} title="Esc">← {ELEMENT_FULL[zoom]}</button>}
        <span className="text-[9px]" style={{ color: NEON.muted }}>Tab reveal · ` blank · 1–5 open · ⇧1–5 zoom · 6–0 NT switches · M mode</span>
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
