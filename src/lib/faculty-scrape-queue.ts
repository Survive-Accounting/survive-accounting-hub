// Tracks in-flight faculty scrapes by campus id so that Lee can fire-and-forget
// a scrape from the ApproveCampusModal in Speed Mode, jump to the next campus,
// and still see a toast when the scrape resolves.
//
// Hardened against stuck jobs:
//   - Every tracked promise is raced against a hard timeout (default 3 min)
//     so a hung Firecrawl/AI call eventually fails with a clean message
//     instead of pinning the campus as "Scraping…" forever.
//   - `clearCampusScrape(id)` exposes a manual reset for the UI.
//   - Listeners get a heartbeat tick every second so "stuck for Xs" UI can
//     render a Reset affordance without re-subscribing per render.
import { useEffect, useState } from "react";

type Listener = () => void;

type Entry = {
  promise: Promise<unknown>;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const inflight = new Map<string, Entry>();
const listeners = new Set<Listener>();
const DEFAULT_TIMEOUT_MS = 3 * 60_000;

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

// Heartbeat so "stuck for Ns" UI updates without each consumer running its own
// interval. Only ticks while at least one job is in flight.
let heartbeat: ReturnType<typeof setInterval> | null = null;
function ensureHeartbeat() {
  if (heartbeat || inflight.size === 0) return;
  heartbeat = setInterval(() => {
    if (inflight.size === 0) {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      return;
    }
    emit();
  }, 1000);
}

export function isScrapingCampus(id: string): boolean {
  return inflight.has(id);
}

export function clearCampusScrape(id: string): void {
  const entry = inflight.get(id);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  inflight.delete(id);
  emit();
}

export function trackCampusScrape(
  id: string,
  promise: Promise<unknown>,
  opts: { timeoutMs?: number; onTimeout?: () => void } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    // Watchdog: free the slot so the UI doesn't stay locked. The underlying
    // server-fn promise may still resolve later (no-op), but we stop pretending
    // we're waiting on it.
    if (inflight.has(id)) {
      inflight.delete(id);
      emit();
      try { opts.onTimeout?.(); } catch { /* ignore */ }
    }
  }, timeoutMs);

  const entry: Entry = { promise, startedAt: Date.now(), timer };
  inflight.set(id, entry);
  ensureHeartbeat();
  emit();

  const cleanup = () => {
    const cur = inflight.get(id);
    // Only clear if this is still our entry (watchdog may have cleared it).
    if (cur === entry) {
      if (cur.timer) clearTimeout(cur.timer);
      inflight.delete(id);
      emit();
    }
  };
  promise.then(cleanup, cleanup);
  return promise;
}

export function useIsScrapingCampus(id: string | null | undefined): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l: Listener = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return id ? inflight.has(id) : false;
}

export function useScrapingCampusInfo(id: string | null | undefined): {
  scraping: boolean;
  elapsedMs: number;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const l: Listener = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!id) return { scraping: false, elapsedMs: 0 };
  const entry = inflight.get(id);
  if (!entry) return { scraping: false, elapsedMs: 0 };
  return { scraping: true, elapsedMs: Date.now() - entry.startedAt };
}
