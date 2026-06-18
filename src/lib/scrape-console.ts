// Tiny pub/sub for streaming "live code" log lines into the Faculty
// triage panel's empty-state terminal while a scrape is in flight.
//
// AutoScrapeButton (and anything else in the scrape pipeline) pushes lines
// keyed by campusId; the EmptyState subscribes via `useScrapeConsole` and
// renders them in a hi-tech terminal block above the spinner.
import { useEffect, useState } from "react";

export type ScrapeLogLine = {
  id: number;
  ts: number;
  kind: "cmd" | "ok" | "warn" | "error" | "info" | "code" | "net";
  text: string;
};

const buffers = new Map<string, ScrapeLogLine[]>();
const listeners = new Map<string, Set<() => void>>();
let counter = 0;
const MAX = 200;

function emit(campusId: string) {
  listeners.get(campusId)?.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function pushScrapeLog(
  campusId: string,
  kind: ScrapeLogLine["kind"],
  text: string,
): void {
  const buf = buffers.get(campusId) ?? [];
  buf.push({ id: ++counter, ts: Date.now(), kind, text });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  buffers.set(campusId, buf);
  emit(campusId);
}

export function clearScrapeLog(campusId: string): void {
  buffers.set(campusId, []);
  emit(campusId);
}

export function useScrapeConsole(campusId: string | null | undefined): ScrapeLogLine[] {
  const [, force] = useState(0);
  useEffect(() => {
    if (!campusId) return;
    const set = listeners.get(campusId) ?? new Set<() => void>();
    const l = () => force((n) => n + 1);
    set.add(l);
    listeners.set(campusId, set);
    return () => {
      set.delete(l);
      if (set.size === 0) listeners.delete(campusId);
    };
  }, [campusId]);
  return (campusId && buffers.get(campusId)) || [];
}
