// EXHIBIT LAB (Exhibit Lab v2) — the authoring/filming ZONE. Filming-side only:
// nothing here renders to students. Left rail: the two exhibits, the probe
// library (SUMMON a probe onto the selected exhibit), and the FILMING QUEUE —
// an ordered list of exhibit+probe pairs you step through with [ and ].
// Centre: the live exhibit running the current item. Top: session config —
// is_test (on by default here; Lee's camera answers are not student data) and
// the attempts the Lab has recorded so far.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { NEON } from "../theme";
import { CycleExhibit } from "./CycleExhibit";
import { RubricExhibit } from "./RubricExhibit";
import { CYCLE_PROBES, CYCLE_STEPS } from "./cycle-model";
import { itemLabel, toRef, type CycleMode, type LabItem } from "./lab-items";
import { useLabKeys } from "./lab-runner";
import { flushProbeAttempts, probeIsTest, probeQueueLength, probeSessionId, setProbeIsTest } from "./probe-attempts";
import { EXHIBITS, PROBES, refKey, type ExhibitId, type ProbeId } from "./probes";
import { RUBRIC_PROBES, SCENARIOS } from "./rubric-model";

const GOLD = "#FCA311", GOOD = "#3BF5A0";
const QKEY = "sa-exhibit-lab-queue";

const loadQueue = (): LabItem[] => { try { const r = localStorage.getItem(QKEY); return r ? (JSON.parse(r) as LabItem[]) : []; } catch { return []; } };
const saveQueue = (q: LabItem[]): void => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* ignore */ } };

const supports = (exhibit: ExhibitId, probe: ProbeId): boolean => (exhibit === "rubric" ? RUBRIC_PROBES : CYCLE_PROBES).includes(probe);

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
  useEffect(() => { saveQueue(queue); }, [queue]);
  useEffect(() => { const t = window.setInterval(() => setQueued(probeQueueLength()), 1500); return () => window.clearInterval(t); }, []);
  useEffect(() => { void flushProbeAttempts(); }, []);

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

  const CHIP = "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide";
  return (
    <div className="flex h-screen flex-col" style={{ background: "#080D18", color: NEON.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* top strip */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2" style={{ borderColor: NEON.borderSoft }}>
        <span className="text-[12px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>Exhibit Lab</span>
        <span className="text-[10px]" style={{ color: NEON.muted }}>filming-side · nothing here ships to students</span>
        <span className="flex-1" />
        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>keys: 1–9 pick · Enter next · S skip · ← → step · ` restart · [ ] queue</span>
        <label className="flex items-center gap-1 text-[9px] font-bold uppercase" style={{ color: isTest ? GOLD : GOOD }} title="probe_attempts.is_test — ON here by default: the Lab is an authoring surface">
          <input type="checkbox" checked={isTest} onChange={(e) => { setIsTest(e.target.checked); setProbeIsTest(e.target.checked); }} /> is_test
        </label>
        <span className="text-[9px] tabular-nums" style={{ color: NEON.muted }} title={`session ${probeSessionId()}`}>{queued} attempt{queued === 1 ? "" : "s"} queued</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left rail */}
        <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r p-3" style={{ borderColor: NEON.borderSoft }}>
          <div>
            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.muted }}>Exhibits</div>
            {EXHIBITS.map((e) => (
              <button key={e.id} className="mb-1 w-full rounded-lg px-2.5 py-2 text-left" style={{ background: exhibit === e.id ? "rgba(252,163,17,0.14)" : "rgba(255,255,255,0.03)", border: `1px solid ${exhibit === e.id ? GOLD : NEON.borderSoft}` }} onClick={() => { setExhibit(e.id); if (!queue.length) setScratch(e.id === "rubric" ? { exhibit: "rubric", probe: "four_questions", seed: { scenario } } : { exhibit: "cycle", mode: "definitions" }); }}>
                <div className="text-[12px] font-black" style={{ color: "#F4EFE6" }}>{e.name}</div>
                <div className="text-[10px]" style={{ color: NEON.muted }}>{e.blurb}</div>
              </button>
            ))}
            <div className="mt-1 rounded-lg px-2 py-1.5 text-[10px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>T-accounts · JE grid · F/S · Formulas — deferred, untouched.</div>
          </div>

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

        {/* the stage */}
        <div className="min-w-0 flex-1 p-4">
          {item.exhibit === "rubric" && item.probe
            ? <RubricExhibit key={`${refKey(toRef(item)!)}:${JSON.stringify(item.seed ?? {})}:${cur}`} probeRef={toRef(item)!} />
            : <CycleExhibit key={`${itemLabel(item)}:${JSON.stringify(item.seed ?? {})}:${cur}`} item={item} />}
        </div>
      </div>
    </div>
  );
}
