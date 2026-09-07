// THE PRODUCTION RUN WIDGET — the checklist pill. Mounted once, globally (next to ShippedDock,
// IdeasDock — __root.tsx), admin-gated the same way: nothing runs, not even the bank fetch,
// until unlocked. The export name is the 2026-09-05 timer's, so __root.tsx didn't change; the
// body is new.
//
// Lee, 2026-09-07: "'start timer - review' etc should be much more simple. In background...
// like if I come to /talkthrough, when I first hit start recording, that starts the timer.
// When I stop recording, background timer stops. For others, like step2, it can open a popup
// modal that's like ready to start?, and same with step 3 film, step 4 post. I'd like to skip
// sometimes, although I plan to do it often. … it's all in the background, right? … I think
// we need to make this have a checkbox step by step approach. … let me pause this timer, but
// make that require confirmation. I'm only going to pause if I literally have to stop."
//
// HOW EACH STEP STARTS AND STOPS (the whole story, so nothing here is a surprise):
//   · Brainstorm — AUTOMATIC, no modal. On the set's Brainstorm page the widget watches the
//     Talkthrough store (subscribeTT). The first transcript segment landing for the open
//     session = recording started: a run starts for this set (startedAt = the session's own
//     start) and "Talk it through" starts running. The session gaining endedAt (End Session →
//     Review) = stopped: "Talk it through" is checked. "Skim" and "Stamp" are Lee's to tick.
//     (Booth.tsx keeps the mic state to itself, so the recorder's own click isn't observable
//     without touching it — the first sentence is the honest proxy, a few seconds late.)
//   · Editor, Rehearse & Film — a centred "Ready to start …?" modal on landing, when this
//     set's run has the step pending: Start (the first task starts running) / Skip this step /
//     Not now. No run on this set at all → the modal offers "Start a run here".
//   · Cross-post — /v3/post is cross-set, so the modal there asks WHICH set: every run whose
//     Cross-post is still pending. One active run with Cross-post running → just the pill.
//   · Every step ends the same way: "✓ Done with this step" in the pill, then an optional
//     comment ("What sucked, what would've been better?") → finishStep. That also logs the
//     step's seconds to production_time_log (logProductionTime), so the bottleneck report
//     and set-stage's "filmed?" keep working. Finishing the last step ends the run and the
//     pill offers "→ Iterate" (Step 5 — "Improve Process" until Lee renamed it, 2026-09-07).
//   · Rehearsal rounds check themselves off: BlastOffCapture's rounds reducer announces a
//     finished round (window "sa:production"), round 1 → "Rehearse round 1", round 2 → "round 2".
//
// STATE. The active run lives in localStorage (sa-production-run) and is upserted to
// production_runs on every change, best-effort — a failed save shows in the pill, never blocks.
// Elapsed time is derived from timestamps on a 1 s tick (production-run.ts), never a counter,
// so a reload or a sleeping laptop loses nothing.
//
// NEVER IN THE TAKE. The 9:16 pop-out window (?popout=1, components/blastoff/capture/popout.ts)
// is what OBS captures; the widget draws nothing there. The main window keeps the pill (the
// film step has tasks to tick — setup, rounds, the take).
//
// THE RETRO BY VOICE (2026-09-07, docs/USE-YOUR-WORDS-AUDIT.md #6, #19). Lee: "'Use your words'
// is the fundamental value… Wherever we can click, talk, get suggestions." The finish sheet has
// a mic: he talks the retro, the model (retro-brief.ts) follows along on the rehearsal review's
// throttle and proposes the one-line note + bottleneck tags, shown for confirmation before
// "Finish". The tags land on the step (StepRun.tags) and in production_time_log's note as
// "[tag] note", so the consultant reads tags, not prose. The pause reason has a mic and NO
// model — a spoken reason is already the artifact.
import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { getAdminWho, isAdminUnlocked } from "@/components/AdminGate";
import { startTT, subscribeTT, ttState } from "@/components/canvas/talkthrough-sync";
import { findSet, findTopic, slugOf, useBank } from "@/components/v3/use-bank";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { logProductionTime } from "@/lib/production-time.functions";
import {
  currentStep, DEFAULT_TASK_LISTS, fmtElapsed, isPaused, LOG_STEP, newRun, nextPendingStep, normalizeRun, pillLabel, recordingSignal,
  reduceRun, RUN_STEP_LABEL, RUN_STEPS, runningTask, runStepFromPath, runTotalSeconds, stepSeconds, taskSeconds,
  type ProductionRun, type RunAction, type RunStepId, type StepRun, type TaskLists,
} from "@/lib/production-run";
import { getActiveRun, getProductionTaskLists, listProductionRuns, upsertProductionRun } from "@/lib/production-run.functions";
import { buildRetroMessages, parseRetro, retroLogNote, type Retro } from "@/lib/retro-brief";
import { runMicro, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { useDictation } from "@/lib/use-dictation";

/** The rehearsal review's live-brief cadence (RehearsalReview.tsx LIVE_BRIEF_EVERY_MS) — a
 *  throttle, not a debounce, so continuous speech still briefs every 2.5 s. */
const LIVE_BRIEF_EVERY_MS = 2500;

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#0B0F1E", MINT = "#3BF5A0", ORANGE = "#FF9F43", ROSE = "#FF8B7E";
const FONT = "'Rubik', system-ui, sans-serif";
const Z = 2147482900;
export const RUN_KEY = "sa-production-run";

export function ProductionTimer() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, []);
  if (!unlocked) return null;
  return <ProductionRunInner />;
}

const loadLocal = (): ProductionRun | null => {
  try { const raw = localStorage.getItem(RUN_KEY); return raw ? normalizeRun(JSON.parse(raw)) : null; } catch { return null; }
};
const saveLocal = (run: ProductionRun | null): void => {
  try { if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run)); else localStorage.removeItem(RUN_KEY); } catch { /* a browser that refuses storage just forgets */ }
};

type Here = { topic: BoothTopic; set: BoothSetInfo };
type Modal = { kind: "ready"; step: RunStepId } | { kind: "start-here"; step: RunStepId } | { kind: "pick-post" };

function ProductionRunInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const path = useMemo(() => runStepFromPath(pathname), [pathname]);
  const { topics } = useBank();

  const [run, setRun] = useState<ProductionRun | null>(null);
  const runRef = useRef<ProductionRun | null>(null);
  const [restored, setRestored] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [lists, setLists] = useState<TaskLists>(DEFAULT_TASK_LISTS);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // The set this page is on, once the bank has loaded (slug → canonical id).
  const here = useMemo<Here | null>(() => {
    if (path?.kind !== "set" || !topics) return null;
    const topic = findTopic(topics, path.topicSlug);
    const set = topic ? findSet(topic, path.setSlug) : undefined;
    return topic && set ? { topic, set } : null;
  }, [path, topics]);
  const hereRef = useRef<Here | null>(null);
  hereRef.current = here;

  /** Every change: state, localStorage, the server — in that order, none waiting on the next. */
  const commit = useCallback((next: ProductionRun | null) => {
    runRef.current = next;
    setRun(next);
    saveLocal(next);
    if (!next) return;
    upsertProductionRun({ data: next })
      .then((r) => setSaveErr(r.ok ? null : (r.error ?? "Couldn't save the run.")))
      .catch((e) => setSaveErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const dispatch = useCallback((action: RunAction): ProductionRun | null => {
    const cur = runRef.current;
    if (!cur) return null;
    const next = reduceRun(cur, action, new Date());
    if (next !== cur) commit(next);
    return next;
  }, [commit]);

  // RESTORE: localStorage first (instant), else the newest running run on the server. A done
  // run kept locally (for its "→ Improve Process" link) is dropped after a day.
  useEffect(() => {
    const local = loadLocal();
    const stale = local && local.status !== "running" && Date.now() - new Date(local.endedAt ?? local.startedAt).getTime() > 86_400_000;
    if (local && !stale) { runRef.current = local; setRun(local); setRestored(true); }
    else {
      if (stale) saveLocal(null);
      getActiveRun().then((r) => { if (r.run && !runRef.current) { runRef.current = r.run; setRun(r.run); saveLocal(r.run); } })
        .catch(() => { /* no server copy — the next Brainstorm or modal starts one */ })
        .finally(() => setRestored(true));
    }
    getProductionTaskLists().then((r) => setLists(r.lists)).catch(() => { /* code defaults */ });
  }, []);

  // THE TICK — 1 s, only while something is running; time itself comes from timestamps.
  const ticking = !!run && run.status === "running";
  useEffect(() => {
    if (!ticking) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const who = () => getAdminWho();
  const startRunHere = useCallback((h: Here, startedAt?: string): ProductionRun => {
    const fresh = newRun({
      setId: h.set.id, setName: h.set.name, topicSlug: slugOf(h.topic.name), topicName: h.topic.name, setSlug: slugOf(h.set.name),
      createdBy: who(), lists, now: new Date(), startedAt,
    });
    commit(fresh);
    return fresh;
  }, [commit, lists]);

  // AUTO ON BRAINSTORM — the recorder's signal, read off the Talkthrough store.
  const onTalkPage = path?.kind === "set" && path.step === "talkthrough";
  const hereSetId = here?.set.id ?? null;
  useEffect(() => {
    if (!onTalkPage || !hereSetId) return;
    startTT();
    let prev = recordingSignal(ttState().doc, hereSetId);
    return subscribeTT((s) => {
      const sig = recordingSignal(s.doc, hereSetId);
      const before = prev;
      prev = sig;
      if (!sig) return;
      const h = hereRef.current;
      if (!h || h.set.id !== hereSetId) return;
      const cur = runRef.current;
      const mine = cur && cur.status === "running" && cur.setId === hereSetId ? cur : null;
      // Recording STARTED: the first segment of this session (or a new session's first).
      if (sig.recording && !sig.ended && (!before || before.sessionId !== sig.sessionId || !before.recording)) {
        if (mine) {
          if (mine.steps.talkthrough.tasks.some((t) => t.key === "talk" && t.status === "pending")) dispatch({ type: "startTask", step: "talkthrough", key: "talk" });
        } else {
          startRunHere(h, sig.startedAt);
          dispatch({ type: "startTask", step: "talkthrough", key: "talk" });
        }
      }
      // Recording STOPPED: the session ended (End Session → Review).
      if (sig.ended && before && before.sessionId === sig.sessionId && !before.ended && mine) {
        if (mine.steps.talkthrough.tasks.some((t) => t.key === "talk" && t.status === "running")) dispatch({ type: "completeTask", step: "talkthrough", key: "talk" });
      }
    });
  }, [onTalkPage, hereSetId, dispatch, startRunHere]);

  // REHEARSAL ROUNDS — BlastOffCapture's reducer announces a finished round.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ event?: string; round?: { round: number; seconds: number } }>).detail;
      if (d?.event !== "rehearsal-round-finished" || !d.round) return;
      const cur = runRef.current, h = hereRef.current;
      if (!cur || cur.status !== "running" || !h || cur.setId !== h.set.id) return;
      const key = d.round.round === 1 ? "r1" : d.round.round === 2 ? "r2" : null;
      if (!key) return;
      const task = cur.steps.film.tasks.find((t) => t.key === key);
      if (task && (task.status === "pending" || task.status === "running")) dispatch({ type: "completeTask", step: "film", key, seconds: d.round.seconds });
    };
    window.addEventListener("sa:production", on);
    return () => window.removeEventListener("sa:production", on);
  }, [dispatch]);

  /** finishStep + the production_time_log row (the old report's shape) — best-effort. The
   *  retro's tags ride the step (one commit, beside the reducer's own result) and prefix the
   *  log note as "[tag] note" (retro-brief.ts retroLogNote). */
  const finishStep = useCallback((step: RunStepId, note: string, tags: string[] = []) => {
    const cur = runRef.current;
    if (!cur) return;
    let next = reduceRun(cur, { type: "finishStep", step, note: note || null }, new Date());
    if (next === cur) return;
    if (tags.length) next = { ...next, steps: { ...next.steps, [step]: { ...next.steps[step], tags } } };
    commit(next);
    const s = next.steps[step];
    if (!s.startedAt || !s.endedAt) return;
    logProductionTime({ data: {
      setId: next.setId, setName: next.setName || null, topicSlug: next.topicSlug || null, topicName: next.topicName || null,
      step: LOG_STEP[step], seconds: stepSeconds(s, new Date(s.endedAt)), startedAt: s.startedAt, endedAt: s.endedAt, who: who(),
      note: retroLogNote(s.note, tags)?.slice(0, 500) ?? null,
    } }).then((r) => { if (!r.ok) setSaveErr(r.error ?? "Couldn't write the time log."); }).catch(() => { /* the run itself is saved; the log row is the legacy report's */ });
  }, [commit]);

  // Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);

  // NEVER IN THE POP-OUT (the take).
  const popout = search?.popout === 1 || search?.popout === "1" || (typeof window !== "undefined" && /[?&]popout=1(?:&|$)/.test(window.location.search));
  if (popout) return null;

  // THE READY MODALS.
  const modalStep: RunStepId | null = path?.kind === "set" && (path.step === "results" || path.step === "film") ? path.step : path?.kind === "post" ? "post" : null;
  const mine = run && run.status === "running" && here && run.setId === here.set.id ? run : null;
  const modal = ((): Modal | null => {
    if (!restored || !modalStep) return null;
    if (modalStep === "post") {
      // Keyed to the run, so "Not now" on one set's Cross-post doesn't hide the next set's.
      if (dismissed === `post/${run?.id ?? "none"}`) return null;
      if (run && run.status === "running" && run.steps.post.status === "pending") return { kind: "ready", step: "post" };
      if (!run || run.status !== "running" || run.steps.post.status !== "running") return { kind: "pick-post" };
      return null;
    }
    if (!here || dismissed === `${here.set.id}/${modalStep}`) return null;
    if (mine) return mine.steps[modalStep].status === "pending" ? { kind: "ready", step: modalStep } : null;
    return { kind: "start-here", step: modalStep };
  })();
  const dismissModal = () => setDismissed(modalStep === "post" ? `post/${runRef.current?.id ?? "none"}` : here ? `${here.set.id}/${modalStep}` : null);

  return (
    <>
      {modal && (
        <ReadyModal
          modal={modal} here={here} run={run} otherRun={run && run.status === "running" && here && run.setId !== here.set.id ? run : null}
          onStart={(step) => {
            if (modal.kind === "start-here" && here) startRunHere(here);
            dispatch({ type: "startStep", step });
            dismissModal();
          }}
          onSkip={(step) => {
            if (modal.kind === "start-here" && here) startRunHere(here);
            dispatch({ type: "skipStep", step });
            dismissModal();
          }}
          onPick={(picked) => { commit(picked); dispatch({ type: "startStep", step: "post" }); dismissModal(); }}
          onClose={dismissModal}
        />
      )}
      {run && (
        <Pill
          run={run} now={now} open={open} setOpen={setOpen} saveErr={saveErr} dispatch={dispatch} finishStep={finishStep}
          clear={() => { setOpen(false); commit(null); }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ the pill + popover

function Pill({ run, now, open, setOpen, saveErr, dispatch, finishStep, clear }: {
  run: ProductionRun; now: Date; open: boolean; setOpen: (v: boolean) => void; saveErr: string | null;
  dispatch: (a: RunAction) => ProductionRun | null; finishStep: (step: RunStepId, note: string, tags?: string[]) => void; clear: () => void;
}) {
  const step = currentStep(run);
  const stepRun = step ? run.steps[step] : null;
  const paused = !!stepRun && isPaused(stepRun);
  const done = run.status !== "running";
  const dot = done ? GOLD : paused ? ORANGE : MINT;
  const [confirmPause, setConfirmPause] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  useEffect(() => { if (!open) { setConfirmPause(false); setFinishing(false); setConfirmAbandon(false); } }, [open]);

  const improveTo = `/v3/${run.topicSlug}/${run.setSlug}/blast-off/improve`;
  const next = nextPendingStep(run);

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: Z, fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {open && (
        <div role="dialog" aria-label="Production run" style={{ width: 340, maxHeight: "70vh", overflowY: "auto", background: INK, border: `1px solid ${dot}66`, borderRadius: 14, padding: 12, boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", color: CREAM }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED }}>{step ? RUN_STEP_LABEL[step] : done ? "Run done" : "Between steps"}</span>
            <span style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{run.setName}</span>
            <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtElapsed(runTotalSeconds(run, now))}</span>
          </div>

          {done && (
            <div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 10 }}>
                {run.status === "done" ? "That's the set, start to finish. See where the minutes went and what to change next time." : "Run abandoned."}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Link to={improveTo} onClick={() => setOpen(false)} style={{ ...btn(GOLD), textDecoration: "none", textAlign: "center" }}>→ Iterate</Link>
                <button type="button" onClick={clear} style={btn()}>Clear</button>
              </div>
            </div>
          )}

          {!done && step && stepRun && (
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {stepRun.tasks.map((t) => {
                  const secs = taskSeconds(t, stepRun, now);
                  const running = t.status === "running";
                  const decided = t.status === "done" || t.status === "skipped";
                  return (
                    <li key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 8, background: running ? "rgba(59,245,160,0.08)" : "transparent" }}>
                      <input type="checkbox" checked={t.status === "done"} disabled={decided}
                        title={running ? "Done — starts the next one" : t.status === "pending" ? "Start this task now" : t.status}
                        onChange={() => dispatch(running ? { type: "completeTask", step, key: t.key } : { type: "startTask", step, key: t.key })}
                        style={{ width: 15, height: 15, accentColor: MINT, cursor: decided ? "default" : "pointer", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: decided ? MUTED : CREAM, textDecoration: t.status === "skipped" ? "line-through" : "none", lineHeight: 1.3 }}>{t.label}</span>
                      {(secs > 0 || running) && <span style={{ fontSize: 11.5, color: running ? MINT : MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtElapsed(secs)}</span>}
                      {!decided && (
                        <button type="button" onClick={() => dispatch({ type: "skipTask", step, key: t.key })} title="Skip this task"
                          style={{ font: "inherit", fontSize: 10.5, color: MUTED, background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }}>skip</button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {paused && (
                <div style={{ marginTop: 8, fontSize: 12, color: ORANGE, lineHeight: 1.4 }}>
                  Paused{stepRun.pauses[stepRun.pauses.length - 1]?.reason ? ` — ${stepRun.pauses[stepRun.pauses.length - 1].reason}` : ""}. The clock is stopped; this pause is on the record.
                </div>
              )}

              {confirmPause ? (
                <PauseSheet
                  onCancel={() => setConfirmPause(false)}
                  onPause={(reason) => { dispatch({ type: "pause", step, reason }); setConfirmPause(false); }}
                />
              ) : finishing ? (
                <RetroSheet
                  step={step} stepRun={stepRun} now={now} setId={run.setId}
                  onBack={() => setFinishing(false)}
                  onFinish={(note, tags) => { finishStep(step, note, tags); setFinishing(false); }}
                />
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {paused
                    ? <button type="button" onClick={() => dispatch({ type: "resume", step })} style={btn(MINT)}>▶ Resume</button>
                    : <button type="button" onClick={() => setConfirmPause(true)} disabled={!runningTask(stepRun)} title={runningTask(stepRun) ? "Requires a reason" : "Nothing is running"} style={btn()}>⏸ Pause</button>}
                  <button type="button" onClick={() => dispatch({ type: "skipStep", step })} style={btn(MUTED)}>Skip this step</button>
                  <button type="button" onClick={() => setFinishing(true)} style={{ ...btn(MINT), flexBasis: "100%" }}>✓ Done with this step</button>
                </div>
              )}
            </>
          )}

          {!done && !step && (
            <div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                {next ? <>Next: <b style={{ color: CREAM }}>{RUN_STEP_LABEL[next]}</b> — it starts when you land on that step and say go, or here.</> : "Every step is decided."}
              </div>
              {next && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => dispatch({ type: "startStep", step: next })} style={btn(MINT)}>Start {RUN_STEP_LABEL[next]}</button>
                  <button type="button" onClick={() => dispatch({ type: "skipStep", step: next })} style={btn(MUTED)}>Skip it</button>
                </div>
              )}
            </div>
          )}

          {!done && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10.5, color: MUTED }}>{RUN_STEPS_DONE(run)} of 4 steps decided</span>
              <span style={{ marginLeft: "auto" }} />
              {confirmAbandon ? (
                <>
                  <button type="button" onClick={() => setConfirmAbandon(false)} style={{ ...btn(), flex: "none", padding: "3px 8px", fontSize: 10.5 }}>Keep</button>
                  <button type="button" onClick={() => { dispatch({ type: "abandon" }); setConfirmAbandon(false); }} style={{ ...btn(ROSE), flex: "none", padding: "3px 8px", fontSize: 10.5 }}>Abandon run</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmAbandon(true)} style={{ font: "inherit", fontSize: 10.5, color: MUTED, background: "transparent", border: "none", cursor: "pointer" }}>abandon…</button>
              )}
            </div>
          )}
          {saveErr && <div style={{ marginTop: 8, fontSize: 10.5, color: ORANGE, lineHeight: 1.4 }}>Not saved: {saveErr}</div>}
        </div>
      )}

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? "Close" : "The checklist for this step"}
        style={{ display: "flex", alignItems: "center", gap: 7, font: "inherit", fontSize: 12, fontWeight: 700, padding: "6px 11px", borderRadius: 999, border: `1px solid ${saveErr ? ORANGE : dot}66`, background: INK, color: CREAM, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.4)", fontFamily: FONT, maxWidth: 360 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: dot, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>⏱ {pillLabel(run, now)}</span>
        {done && run.status === "done" && <span style={{ color: GOLD, fontSize: 11 }}>→ Iterate</span>}
      </button>
    </div>
  );
}

function RUN_STEPS_DONE(run: ProductionRun): number {
  return RUN_STEPS.filter((s) => run.steps[s].status === "done" || run.steps[s].status === "skipped").length;
}

// ------------------------------------------------------------------ the pause sheet

/** The pause reason, spoken (#19). Mic only, no model: "a spoken reason is already the
 *  artifact." Words land in the field as he says them; typing still works. */
function PauseSheet({ onCancel, onPause }: { onCancel: () => void; onPause: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [interim, setInterim] = useState("");
  const mic = useDictation((final, live) => { setInterim(live); if (final.trim()) setReason((r) => `${r} ${final}`.trim()); });
  const shown = reason + (interim ? (reason ? " " : "") + interim : "");
  const pause = () => { mic.stop(); onPause(reason.trim()); };
  return (
    <div style={{ marginTop: 10, border: `1px solid ${ORANGE}66`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 6 }}>Pausing counts against you — only if you really have to stop. Why?</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input autoFocus value={shown} onChange={(e) => { setInterim(""); setReason(e.target.value); }} placeholder="one line — what pulled you away"
          onKeyDown={(e) => { if (e.key === "Enter") pause(); }}
          style={field()} />
        <MicButton mic={mic} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" onClick={() => { mic.stop(); onCancel(); }} style={btn()}>Cancel</button>
        <button type="button" onClick={pause} style={btn(ORANGE)}>Pause</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the retro sheet

/** "What sucked, what would've been better?" — talked (#6). Speech lands in the box AND drives
 *  the brief on the throttle; the model's one-line note + bottleneck tags sit under it for
 *  confirmation (edit the line, × a tag). Typed words brief on "Sum it up". Finish with no
 *  brief at all still works — the raw words are the note, as before. */
function RetroSheet({ step, stepRun, now, setId, onBack, onFinish }: {
  step: RunStepId; stepRun: StepRun; now: Date; setId: string;
  onBack: () => void; onFinish: (note: string, tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  /** Speech only — what the throttle keys on, so typing never fires a call per keystroke. */
  const [take, setTake] = useState("");
  const [retro, setRetro] = useState<Retro | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mic = useDictation((final, live) => {
    setInterim(live);
    if (final.trim()) { setText((t) => `${t} ${final}`.trim()); setTake((t) => `${t} ${final}`.trim()); }
  });

  const brief = useCallback(async (spoken: string) => {
    if (!spoken.trim()) return;
    setBusy(true); setErr(null);
    try {
      const m = buildRetroMessages({
        step: RUN_STEP_LABEL[step],
        taskMinutes: stepRun.tasks.map((t) => ({ label: t.label, minutes: taskSeconds(t, stepRun, now) / 60, status: t.status })),
        pauses: stepRun.pauses.map((p) => ({
          taskLabel: stepRun.tasks.find((t) => t.key === p.taskKey)?.label ?? null, reason: p.reason,
          seconds: p.endedAt ? Math.max(0, Math.round((new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime()) / 1000)) : 0,
        })),
        spoken,
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 300 } });
      void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label: "retro", who: getAdminWho() } });
      const parsed = parseRetro(r.text, spoken);
      if (!parsed) throw new Error("The retro didn't come back clean — say it once more, or just finish with your words.");
      setRetro(parsed);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
    // stepRun/now are read at call time on purpose — the sheet is open for seconds, not minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, setId]);

  // The rehearsal review's throttle: first new speech briefs at once, then at most once per
  // LIVE_BRIEF_EVERY_MS, and the tail always lands.
  const lastAt = useRef(0);
  const briefed = useRef("");
  useEffect(() => {
    if (!take || take === briefed.current) return;
    const wait = Math.max(0, lastAt.current + LIVE_BRIEF_EVERY_MS - Date.now());
    const id = window.setTimeout(() => { lastAt.current = Date.now(); briefed.current = take; void brief(take); }, wait);
    return () => window.clearTimeout(id);
  }, [take, brief]);

  const shown = text + (interim ? (text ? " " : "") + interim : "");
  const finish = () => { mic.stop(); onFinish((retro?.note ?? text).trim(), retro?.tags ?? []); };

  return (
    <div style={{ marginTop: 10, border: `1px solid ${GOLD}66`, borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>What sucked, what would've been better? (optional)</span>
        <MicButton mic={mic} />
      </div>
      <textarea autoFocus value={shown} onChange={(e) => { setInterim(""); setText(e.target.value); }} rows={3} style={{ ...field(), resize: "vertical" }}
        placeholder={mic.supported ? "talk, or type" : ""} />
      {!mic.on && text.trim() && (!retro || text !== briefed.current) && (
        <button type="button" disabled={busy} onClick={() => { briefed.current = text; void brief(text); }} style={{ ...btn(GOLD), flex: "none", marginTop: 6, padding: "4px 9px", fontSize: 11 }}>
          {busy ? "Summing up…" : "Sum it up"}
        </button>
      )}
      {(retro || busy) && (
        <div style={{ marginTop: 8, borderTop: `1px dashed ${EDGE}`, paddingTop: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>
            The note{busy ? " · thinking…" : ""}
          </div>
          {retro && (
            <>
              <input value={retro.note} onChange={(e) => setRetro({ ...retro, note: e.target.value })} style={field()} />
              {retro.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {retro.tags.map((t) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 7px", borderRadius: 999, border: `1px solid ${ORANGE}66`, color: ORANGE }}>
                      {t}
                      <button type="button" onClick={() => setRetro({ ...retro, tags: retro.tags.filter((x) => x !== t) })} title="Drop this tag"
                        style={{ font: "inherit", background: "transparent", border: "none", color: MUTED, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>The tags are what the consultant reads — drop one that isn't a real bottleneck.</div>
            </>
          )}
        </div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 11, color: ORANGE }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" onClick={() => { mic.stop(); onBack(); }} style={btn()}>Back</button>
        <button type="button" onClick={finish} style={btn(MINT)}>✓ Finish {RUN_STEP_LABEL[step]}</button>
      </div>
    </div>
  );
}

/** One mic, the same everywhere in the pill. Hidden where the browser can't dictate. */
function MicButton({ mic }: { mic: ReturnType<typeof useDictation> }) {
  if (!mic.supported) return null;
  return (
    <button type="button" onClick={() => (mic.on ? mic.stop() : mic.start())} title={mic.on ? "Stop listening" : "Talk — the words land here as you speak (Chrome)"}
      style={{ ...btn(mic.on ? ORANGE : CREAM), flex: "none", padding: "4px 9px", fontSize: 11, borderColor: mic.on ? `${ORANGE}88` : EDGE, whiteSpace: "nowrap" }}>
      {mic.on ? "■ listening…" : "🎙 Talk"}
    </button>
  );
}

// ------------------------------------------------------------------ the ready modals

function ReadyModal({ modal, here, run, otherRun, onStart, onSkip, onPick, onClose }: {
  modal: Modal;
  here: Here | null; run: ProductionRun | null; otherRun: ProductionRun | null;
  onStart: (step: RunStepId) => void; onSkip: (step: RunStepId) => void; onPick: (run: ProductionRun) => void; onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<ProductionRun[] | null>(null);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string>("");
  useEffect(() => {
    if (modal.kind !== "pick-post") return;
    listProductionRuns({ data: {} })
      .then((r) => {
        const c = r.runs.filter((x) => x.status === "running" && x.steps.post.status === "pending");
        setCandidates(c); setPickedId(c[0]?.id ?? ""); if (r.error) setPickErr(r.error);
      })
      .catch((e) => { setCandidates([]); setPickErr(e instanceof Error ? e.message : String(e)); });
  }, [modal.kind]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  const label = modal.kind === "pick-post" ? "Cross-post" : RUN_STEP_LABEL[modal.step];
  const setName = modal.kind === "ready" && run ? run.setName : here?.set.name ?? "";
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: Z + 1, background: "rgba(3,6,14,0.55)" }} />
      <div role="dialog" aria-modal aria-label={`Ready to start ${label}?`}
        style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: Z + 2, width: 380, maxWidth: "calc(100vw - 32px)", background: INK, border: `1px solid ${GOLD}66`, borderRadius: 16, padding: 20, boxShadow: "0 24px 60px -16px rgba(0,0,0,0.9)", color: CREAM, fontFamily: FONT }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>Production run</div>
        <div style={{ fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: "-0.01em", marginBottom: 6 }}>
          {modal.kind === "pick-post" ? "Ready to start Cross-post?" : `Ready to start ${label}?`}
        </div>

        {modal.kind === "ready" && <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>{setName} — the clock starts on the first task.</div>}
        {modal.kind === "start-here" && (
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>
            No run is open on <b style={{ color: CREAM }}>{setName}</b>. Start one here — Brainstorm goes down as skipped, so this run won't count toward Time to beat.
            {otherRun && <> The run on <b style={{ color: CREAM }}>{otherRun.setName}</b> stays open on the server; its Cross-post is pickable from /v3/post.</>}
          </div>
        )}
        {modal.kind === "pick-post" && (
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>
            Cross-post is cross-set — which set is this for?
            {candidates === null && <div style={{ marginTop: 8 }}>Looking for runs…</div>}
            {candidates && candidates.length === 0 && <div style={{ marginTop: 8 }}>No run is waiting for Cross-post. Sets get here after Rehearse &amp; Film.</div>}
            {candidates && candidates.length > 0 && (
              <select value={pickedId} onChange={(e) => setPickedId(e.target.value)} style={{ ...field(), marginTop: 8 }}>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.setName || c.setId}{c.topicName ? ` — ${c.topicName}` : ""} · {c.startedAt.slice(0, 10)}</option>)}
              </select>
            )}
            {pickErr && <div style={{ marginTop: 6, color: ORANGE, fontSize: 11.5 }}>{pickErr}</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {modal.kind === "pick-post" ? (
            <button type="button" disabled={!pickedId} onClick={() => { const c = candidates?.find((x) => x.id === pickedId); if (c) onPick(c); }} style={btn(MINT)}>Start</button>
          ) : (
            <>
              <button type="button" autoFocus onClick={() => onStart(modal.step)} style={btn(MINT)}>{modal.kind === "start-here" ? "Start a run here" : "Start"}</button>
              <button type="button" onClick={() => onSkip(modal.step)} style={btn(MUTED)}>Skip this step</button>
            </>
          )}
          <button type="button" onClick={onClose} style={{ ...btn(), flex: "none" }}>Not now</button>
        </div>
      </div>
    </>
  );
}

function btn(color = CREAM): CSSProperties {
  return { flex: 1, font: "inherit", fontFamily: FONT, fontSize: 12, fontWeight: 700, padding: "7px 10px", borderRadius: 9, border: `1px solid ${EDGE}`, background: "transparent", color, cursor: "pointer" };
}
function field(): CSSProperties {
  return { width: "100%", boxSizing: "border-box", font: "inherit", fontFamily: FONT, fontSize: 12.5, padding: "7px 9px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "rgba(244,239,230,0.05)", color: CREAM, outline: "none" };
}
