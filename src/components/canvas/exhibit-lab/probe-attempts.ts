// PROBE ATTEMPTS — the browser side (Exhibit Lab v2, §7). Local-first, never-lose:
// every attempt/skip is appended to a localStorage queue the moment it happens,
// then flushed in batches through the server fn. A failed flush (offline, or the
// table not yet migrated) leaves the queue intact for the next try. NO READ PATH:
// nothing consumes these rows in this pass, by design.
import { logProbeAttempts } from "@/lib/probe.functions";

import type { ProbeRun, Resolution } from "./probe-run";
import { refKey } from "./probes";

export interface ProbeAttemptEvent {
  exhibitId: string;
  probeId: string;
  step: string;
  event: "attempt" | "skip";
  response: string | null;
  correct: boolean | null;
  ms: number | null;
  refKey: string;
  seed: string | null;
}

const QKEY = "sa-probe-attempts-queue";
const SKEY = "sa-probe-session";
const TKEY = "sa-probe-is-test";

/** One session id per browser session (sessionStorage), like practice. */
export function probeSessionId(): string {
  try { let s = sessionStorage.getItem(SKEY); if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(SKEY, s); } return s; } catch { return "anon-" + Math.random().toString(16).slice(2); }
}

/** is_test: ON by default in the Lab (it is a filming/authoring surface — Lee's
 *  own answers are not student data). Persisted so a session choice sticks. */
export const probeIsTest = (): boolean => { try { return localStorage.getItem(TKEY) !== "0"; } catch { return true; } };
export const setProbeIsTest = (v: boolean): void => { try { localStorage.setItem(TKEY, v ? "1" : "0"); } catch { /* ignore */ } };

const loadQ = (): ProbeAttemptEvent[] => { try { const r = localStorage.getItem(QKEY); return r ? (JSON.parse(r) as ProbeAttemptEvent[]) : []; } catch { return []; } };
const saveQ = (q: ProbeAttemptEvent[]): void => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* quota — the run still works */ } };

/** Build the event for the run's CURRENT step's resolution. Pure. */
export function eventFor(run: ProbeRun, stepId: string, res: Resolution): ProbeAttemptEvent {
  return {
    exhibitId: run.ref.exhibit,
    probeId: run.ref.probe,
    step: stepId,
    event: res.kind,
    response: res.kind === "attempt" ? res.response : null,
    correct: res.kind === "attempt" ? res.correct : null,
    ms: res.ms,
    refKey: refKey(run.ref),
    seed: run.ref.seed ? JSON.stringify(run.ref.seed).slice(0, 120) : null,
  };
}

export function recordProbeAttempt(ev: ProbeAttemptEvent): void {
  const q = loadQ();
  q.push(ev);
  saveQ(q);
  void flushProbeAttempts();
}

let flushing = false;
export async function flushProbeAttempts(): Promise<void> {
  if (flushing) return;
  const q = loadQ();
  if (!q.length) return;
  flushing = true;
  let more = false;
  try {
    const r = await logProbeAttempts({ data: { sessionId: probeSessionId(), isTest: probeIsTest(), events: q.slice(0, 200) } });
    if (r.ok) { saveQ(loadQ().slice(r.written)); more = loadQ().length > 0; }
  } catch { /* offline or table missing — the queue waits */ }
  finally { flushing = false; }
  // TAIL DRAIN (08-22): an attempt recorded WHILE a flush was in flight hit the
  // re-entrancy guard and returned early, so it sat in the queue until the next
  // attempt or the next mount — the last answer of a session could lag for
  // hours. Drain again, but ONLY after a success, so a failing server (or an
  // unapplied migration) can never spin.
  if (more) void flushProbeAttempts();
}

export const probeQueueLength = (): number => loadQ().length;
