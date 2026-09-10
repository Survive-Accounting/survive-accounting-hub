// THE DRAIN — the browser is the worker, because Vercel crons are daily on this plan.
//
// Lee, 2026-09-10: "a generation queue that is stacked at all times... working in the background."
// Any /v3 tab that is open asks the server to run the next queued job — every 20 s, and again on
// focus and on coming back online — and the server's compare-and-set claim means two tabs can
// never both run the same one. Nothing here holds state worth losing; the queue is the table.
import { useEffect, useState } from "react";

import { listCeqJobs, runNextCeqJob, type CeqJobRow } from "@/lib/ceq-queue.functions";

const TICK_MS = 20_000;
/** After the server says "nothing to do", don't ask again sooner than this. */
const IDLE_MS = 20_000;

let lastIdleAt = 0;
let inFlight = false;
const listeners = new Set<() => void>();
function notify(): void { for (const fn of listeners) fn(); }

/** Ask the server to run one job, if there might be one. Safe to call often. */
export async function drainOnce(): Promise<void> {
  if (inFlight) return;
  if (Date.now() - lastIdleAt < IDLE_MS) return;
  inFlight = true;
  try {
    const r = await runNextCeqJob();
    if (!r.ran) lastIdleAt = Date.now();
    else { lastIdleAt = 0; notify(); }
  } catch {
    // A missing table or a lost session says so on the panel that asked; the drain stays quiet.
    lastIdleAt = Date.now();
  } finally { inFlight = false; }
}

/** Something was queued — run now, don't wait for the tick. */
export function kickQueue(): void { lastIdleAt = 0; void drainOnce(); }

/** Mount once per page (V3Shell). Runs the drain and reports how many jobs are live. */
export function useCeqQueueDrain(): { live: number } {
  const [live, setLive] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => { listCeqJobs({ data: { limit: 40 } }).then((rows) => { if (alive) setLive(rows.filter((j) => j.status === "queued" || j.status === "running").length); }).catch(() => { /* no table yet — chip stays at 0 */ }); };
    const tick = () => { void drainOnce().then(refresh); };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    const onWake = () => tick();
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    listeners.add(refresh);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener("focus", onWake); window.removeEventListener("online", onWake); listeners.delete(refresh); };
  }, []);
  return { live };
}

/** Jobs for one deck, refreshed when the drain finishes something. */
export function useCeqJobs(deckId: string | null): { jobs: CeqJobRow[]; error: string | null; reload: () => void } {
  const [jobs, setJobs] = useState<CeqJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!deckId) { setJobs([]); return; }
    let alive = true;
    listCeqJobs({ data: { deckId, limit: 10 } })
      .then((rows) => { if (alive) { setJobs(rows); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    const bump = () => { if (alive) setTick((n) => n + 1); };
    listeners.add(bump);
    return () => { alive = false; listeners.delete(bump); };
  }, [deckId, tick]);
  return { jobs, error, reload: () => setTick((n) => n + 1) };
}
