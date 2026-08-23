// EXHIBIT LAB (Exhibit Lab v2) — the authoring/filming ZONE. Filming-side only:
// nothing here renders to students. Left rail: the two exhibits, the cycle's
// native modes, and the FILMING QUEUE — an ordered list of exhibit+probe pairs
// you step through with [ and ]. Centre: the live exhibit.
//
// RUBRIC v2 (§1): the PROBE LIBRARY is no longer a permanent rail fixture. For
// the Rubric it is handed to the exhibit and rendered inside its collapsible
// drawer — one probe surface, never two — so the default Rubric view opens
// with no probe machinery visible. The Cycle keeps it in the rail (its modes
// are its own UI, and it has no drawer).
//
// PRESENT MODE (P): every pixel of Lab chrome disappears and the stage fills
// the window at a locked aspect, so OBS captures the exhibit and nothing else.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { NEON } from "../theme";
import { CycleExhibit } from "./CycleExhibit";
import { JournalEntryExhibit } from "./JournalEntryExhibit";
import { StatementsExhibit } from "./StatementsExhibit";
import { TAccountExhibit } from "./TAccountExhibit";
import { RubricExhibit } from "./RubricExhibit";
import { CYCLE_PROBES, CYCLE_STEPS } from "./cycle-model";
import { itemLabel, toRef, type CycleMode, type LabItem } from "./lab-items";
import { useLabKeys } from "./lab-runner";
import { flushProbeAttempts, probeIsTest, probeQueueLength, probeSessionId, setProbeIsTest } from "./probe-attempts";
import { EXHIBITS, PROBES, refKey, type ExhibitId, type ProbeId } from "./probes";
import { RUBRIC_PROBES, SCENARIOS } from "./rubric-model";

const GOLD = "#FCA311", GOOD = "#3BF5A0";
const QKEY = "sa-exhibit-lab-queue";
const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";

/** PRESENT MODE hides every Lab affordance. Exhibits mark their own authoring
 *  chrome with data-lab-chrome and inherit this for free. */
const PRESENT_CSS = `.sa-present [data-lab-chrome]{display:none !important}`;

const loadQueue = (): LabItem[] => { try { const r = localStorage.getItem(QKEY); return r ? (JSON.parse(r) as LabItem[]) : []; } catch { return []; } };
const saveQueue = (q: LabItem[]): void => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* ignore */ } };

const supports = (exhibit: ExhibitId, probe: ProbeId): boolean =>
  exhibit === "rubric" ? RUBRIC_PROBES.includes(probe)
  : exhibit === "cycle" ? CYCLE_PROBES.includes(probe)
  : false; // JE / T-accounts / statements run no probes yet (shape is ready)

/** THE PROBE SURFACE — the scenario/mode seed plus the library. Rendered in the
 *  Rubric's drawer, or the Cycle's rail: ONE definition, two homes. */
function ProbeControls({ exhibit, scenario, setScenario, cycleStepSeed, setCycleStepSeed, summon, summonMode }: {
  exhibit: ExhibitId;
  scenario: string; setScenario: (s: string) => void;
  cycleStepSeed: string; setCycleStepSeed: (s: string) => void;
  summon: (probe: ProbeId, enqueue: boolean) => void;
  summonMode: (mode: CycleMode, enqueue: boolean) => void;
}) {
  return (
    <>
      {exhibit === "rubric" ? (
        <div>
          <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Scenario</div>
          <select className="w-full rounded px-2 py-1 text-[11px]" style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${NEON.borderSoft}`, color: "#F4EFE6" }} value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
          </select>
        </div>
      ) : (
        <div>
          <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Cycle modes</div>
          <div className="flex flex-wrap gap-1">
            {(["definitions", "selftest", "build"] as const).map((m) => (
              <span key={m} className="flex items-center gap-0.5">
                <button className={CHIP} style={{ color: "#F4EFE6", border: `1px solid ${NEON.borderSoft}` }} onClick={() => summonMode(m, false)} title="Run now">{m === "selftest" ? "self-test" : m}</button>
                <button className={CHIP} style={{ color: GOOD, border: `1px solid rgba(59,245,160,0.4)` }} onClick={() => summonMode(m, true)} title="Add to the filming queue"><Plus className="inline h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Probe from step</div>
          <select className="w-full rounded px-2 py-1 text-[11px]" style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${NEON.borderSoft}`, color: "#F4EFE6" }} value={cycleStepSeed} onChange={(e) => setCycleStepSeed(e.target.value)}>
            <option value="">walk every step</option>
            {CYCLE_STEPS.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}
          </select>
        </div>
      )}

      <div>
        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Probe library · summon onto {exhibit}</div>
        {PROBES.map((p) => {
          const ok = supports(exhibit, p.id);
          return (
            <div key={p.id} className="mb-1 flex items-center gap-1 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${NEON.borderSoft}`, opacity: ok ? 1 : 0.45 }} title={`${p.ask}\n\nid: ${p.id}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-black" style={{ color: "#F4EFE6" }}>{p.name}</div>
                <div className="truncate text-[9px]" style={{ color: NEON.muted }}>{p.student}</div>
              </div>
              <button disabled={!ok} className={CHIP + " disabled:opacity-40"} style={{ color: "#0B1322", background: GOLD }} onClick={() => summon(p.id, false)} title={ok ? "Summon — run this probe on the exhibit now" : `${exhibit} doesn't run this probe yet (no-op)`}>run</button>
              <button disabled={!ok} className={CHIP + " disabled:opacity-40"} style={{ color: GOOD, border: `1px solid rgba(59,245,160,0.4)` }} onClick={() => summon(p.id, true)} title="Add to the filming queue"><Plus className="inline h-2.5 w-2.5" /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ExhibitLab() {
  const [exhibit, setExhibit] = useState<ExhibitId>("rubric");
  const [scenario, setScenario] = useState<string>(SCENARIOS[0].id);
  const [cycleStepSeed, setCycleStepSeed] = useState<string>("");
  const [queue, setQueue] = useState<LabItem[]>(() => loadQueue());
  const [cur, setCur] = useState(0);
  // The item being run: the queue's current entry, else a default for the
  // selected exhibit so the stage is never empty.
  const [scratch, setScratch] = useState<LabItem>({ exhibit: "rubric", probe: "four_questions", seed: { scenario: SCENARIOS[0].id } });
  const [isTest, setIsTest] = useState<boolean>(() => probeIsTest());
  const [queued, setQueued] = useState(() => probeQueueLength());
  // PRESENT: chrome off, stage full-bleed at a locked aspect (the frame OBS gets).
  const [present, setPresent] = useState(false);
  const [aspect, setAspect] = useState<"fill" | "16:9" | "9:16">("fill");
  useEffect(() => { saveQueue(queue); }, [queue]);
  useEffect(() => { const t = window.setInterval(() => setQueued(probeQueueLength()), 1500); return () => window.clearInterval(t); }, []);
  useEffect(() => { void flushProbeAttempts(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "p" || e.key === "P") { e.preventDefault(); setPresent((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const item: LabItem = queue.length ? queue[Math.min(cur, queue.length - 1)] : scratch;
  const queueNav = useMemo(() => ({
    prev: () => setCur((c) => Math.max(0, c - 1)),
    next: () => setCur((c) => Math.min(Math.max(0, queue.length - 1), c + 1)),
  }), [queue.length]);
  useLabKeys(queueNav);

  const seedFor = useCallback((ex: ExhibitId): LabItem["seed"] => (ex === "rubric" ? { scenario } : cycleStepSeed ? { step: cycleStepSeed } : {}), [scenario, cycleStepSeed]);
  /** SUMMON — pick exhibit, pick probe: the exhibit enters that probe's steps. */
  const summon = (probe: ProbeId, enqueue: boolean) => {
    const it: LabItem = { exhibit, probe, seed: seedFor(exhibit) };
    if (enqueue) { setQueue((q) => [...q, it]); setCur(queue.length); }
    else { setScratch(it); if (queue.length) { setQueue([]); setCur(0); } }
  };
  const summonMode = (mode: CycleMode, enqueue: boolean) => {
    const it: LabItem = { exhibit: "cycle", mode, seed: { shuffle: Math.floor(Math.random() * 1000) } };
    if (enqueue) { setQueue((q) => [...q, it]); setCur(queue.length); }
    else { setScratch(it); if (queue.length) { setQueue([]); setCur(0); } }
  };

  const probeControls = (
    <ProbeControls exhibit={exhibit} scenario={scenario} setScenario={setScenario} cycleStepSeed={cycleStepSeed} setCycleStepSeed={setCycleStepSeed} summon={summon} summonMode={summonMode} />
  );
  const aspectStyle: React.CSSProperties =
    aspect === "16:9" ? { aspectRatio: "16 / 9", width: "min(100%, calc(100vh * 16 / 9))", maxHeight: "100%" }
    : aspect === "9:16" ? { aspectRatio: "9 / 16", height: "100%", maxWidth: "100%" }
    : { width: "100%", height: "100%" };

  const stageKey = `${itemLabel(item)}:${JSON.stringify(item.seed ?? {})}:${cur}`;
  const stage =
    item.exhibit === "je" ? <JournalEntryExhibit key={stageKey} seed={item.seed} />
    : item.exhibit === "taccount" ? <TAccountExhibit key={stageKey} seed={item.seed} />
    : item.exhibit === "statements" ? <StatementsExhibit key={stageKey} seed={item.seed} />
    : item.exhibit === "rubric" && item.probe
      ? <RubricExhibit key={`${refKey(toRef(item)!)}:${JSON.stringify(item.seed ?? {})}:${cur}`} probeRef={toRef(item)!} labControls={probeControls} />
      : <CycleExhibit key={stageKey} item={item} />;

  return (
    <div className={`flex h-screen flex-col${present ? " sa-present" : ""}`} style={{ background: "#080D18", color: NEON.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{PRESENT_CSS}</style>
      {!present && (
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2" style={{ borderColor: NEON.borderSoft }}>
          <span className="text-[12px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>Exhibit Lab</span>
          <span className="text-[10px]" style={{ color: NEON.muted }}>filming-side · nothing here ships to students</span>
          <span className="flex-1" />
          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>rubric: Tab reveal · ` blank · 1–5 zoom · 6 statements · P present</span>
          <div className="flex items-center gap-0.5">
            {(["fill", "16:9", "9:16"] as const).map((a) => (
              <button key={a} className={CHIP} style={{ color: aspect === a ? "#0B1322" : NEON.muted, background: aspect === a ? GOLD : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setAspect(a)} title={`Lock the stage to ${a} — what OBS captures`}>{a}</button>
            ))}
            <button className={CHIP} style={{ color: "#0B1322", background: GOOD, marginLeft: 4 }} onClick={() => setPresent(true)} title="PRESENT (P) — hide every Lab affordance for a clean OBS capture">present</button>
          </div>
          <label className="flex items-center gap-1 text-[9px] font-bold uppercase" style={{ color: isTest ? GOLD : GOOD }} title="probe_attempts.is_test — ON here by default: the Lab is an authoring surface">
            <input type="checkbox" checked={isTest} onChange={(e) => { setIsTest(e.target.checked); setProbeIsTest(e.target.checked); }} /> is_test
          </label>
          <span className="text-[9px] tabular-nums" style={{ color: NEON.muted }} title={`session ${probeSessionId()}`}>{queued} attempt{queued === 1 ? "" : "s"} queued</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!present && (
          <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r p-3" style={{ borderColor: NEON.borderSoft }}>
            <div>
              <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Exhibits</div>
              {EXHIBITS.map((e) => (
                <button key={e.id} className="mb-1 w-full rounded-lg px-2.5 py-2 text-left" style={{ background: exhibit === e.id ? "rgba(252,163,17,0.14)" : "rgba(255,255,255,0.03)", border: `1px solid ${exhibit === e.id ? GOLD : NEON.borderSoft}` }} onClick={() => { setExhibit(e.id); if (!queue.length) setScratch(e.id === "rubric" ? { exhibit: "rubric", probe: "four_questions", seed: { scenario } } : e.id === "cycle" ? { exhibit: "cycle", mode: "definitions" } : { exhibit: e.id, seed: { scenario } }); }}>
                  <div className="text-[12px] font-black" style={{ color: "#F4EFE6" }}>{e.name}</div>
                  <div className="text-[10px]" style={{ color: NEON.muted }}>{e.blurb}</div>
                </button>
              ))}
              <div className="mt-1 rounded-lg px-2 py-1.5 text-[10px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>T-accounts · JE grid · F/S · Formulas — deferred, untouched.</div>
            </div>

            {/* THE RUBRIC IS THE SCREEN (§1): its probe surface lives in the
                exhibit's drawer, so the rail carries only a pointer to it. */}
            {exhibit === "rubric"
              ? <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>Probes + scenario live in the exhibit&apos;s <b style={{ color: GOLD }}>PROBES</b> drawer (right edge) — closed by default.</div>
              : exhibit === "cycle" ? probeControls
              : <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>Ledger exhibit — Tab reveals, ` blanks, A shows everything. No probes wired yet.</div>}

            <div>
              <div className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Filming queue · {queue.length}
                <span className="flex-1" />
                <button className="grid h-4 w-4 place-items-center rounded disabled:opacity-30" disabled={!queue.length} onClick={queueNav.prev} title="[ — previous"><ChevronLeft className="h-3 w-3" /></button>
                <button className="grid h-4 w-4 place-items-center rounded disabled:opacity-30" disabled={!queue.length} onClick={queueNav.next} title="] — next"><ChevronRight className="h-3 w-3" /></button>
              </div>
              {!queue.length && <div className="text-[10px] italic" style={{ color: NEON.muted }}>Empty — the stage runs the last summon. Add items with + to step through a sequence with [ and ].</div>}
              {queue.map((it, i) => {
                const ref = toRef(it);
                return (
                  <div key={i} className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: i === cur ? "rgba(59,245,160,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${i === cur ? GOOD : NEON.borderSoft}`, cursor: "pointer" }} onClick={() => setCur(i)} title={ref ? `ref: ${refKey(ref)}${ref.seed ? " " + JSON.stringify(ref.seed) : ""}` : "native mode (no probe ref)"}>
                    <span className="w-4 text-[9px] font-black tabular-nums" style={{ color: NEON.muted }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold" style={{ color: "#F4EFE6" }}>{itemLabel(it)}</span>
                    {ref && <span className="text-[8px]" style={{ color: NEON.muted }}>{refKey(ref)}</span>}
                    <button className="grid h-4 w-4 place-items-center rounded" style={{ color: "#FF8B9E" }} onClick={(e) => { e.stopPropagation(); setQueue((q) => q.filter((_, k) => k !== i)); setCur((c) => Math.max(0, Math.min(c, queue.length - 2))); }}><X className="h-3 w-3" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* THE STAGE — ONE element position, always. Entering PRESENT restyles
            this container; it must never swap the stage into a different parent,
            because that remounts the exhibit and silently wipes the state Lee
            just set up (reveal step, zoom, statements). Found the hard way:
            toggling present mid-take reset the board to free mode. */}
        <div
          className="relative min-w-0 flex-1"
          style={present
            ? { display: "grid", placeItems: "center", background: "#080D18" }
            : { display: "grid", placeItems: "center", padding: 16 }}
        >
          <div style={aspect === "fill" ? { width: "100%", height: "100%" } : { ...aspectStyle, ...(present ? {} : { outline: `1px dashed ${NEON.borderSoft}` }) }}>{stage}</div>
          {/* the only way back — invisible until the mouse finds it, so it can
              never appear in a take (OBS capture-cursor stays off). */}
          {present && (
            <button
              onClick={() => setPresent(false)}
              title="Leave present mode (P)"
              className="absolute left-2 top-2 rounded px-2 py-1 text-[9px] font-black uppercase opacity-0 transition-opacity hover:opacity-70"
              style={{ color: NEON.text, background: "rgba(0,0,0,0.6)", border: `1px solid ${NEON.borderSoft}` }}
            >exit present · P</button>
          )}
        </div>
      </div>
    </div>
  );
}
