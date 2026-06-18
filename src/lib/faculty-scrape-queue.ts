// Tracks in-flight faculty scrapes by campus id so that Lee can fire-and-forget
// a scrape from the ApproveCampusModal in Speed Mode, jump to the next campus,
// and still see a toast when the scrape resolves.
import { useEffect, useState } from "react";

type Listener = () => void;

const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function isScrapingCampus(id: string): boolean {
  return inflight.has(id);
}

export function trackCampusScrape(id: string, promise: Promise<unknown>): Promise<unknown> {
  inflight.set(id, promise);
  emit();
  const cleanup = () => {
    inflight.delete(id);
    emit();
  };
  promise.then(cleanup, cleanup);
  return promise;
}

export function useIsScrapingCampus(id: string | null | undefined): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l: Listener = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return id ? inflight.has(id) : false;
}
