// ONE OF EACH (Lee, 2026-09-16: "I am blown up with so many tabs when I use this workflow. Can we make sure it
// only has one stitch room open at a time? and one /film open at a time?").
//
// Every film page and every Stitch Room announces itself on a channel when it mounts. An older copy that
// hears a newer one YIELDS: a window a script opened closes itself; a tab Lee opened by hand cannot be
// closed by script, so it goes inert instead (the caller draws a cover and stops its heartbeats) with one
// button to take over again. Newest wins, because the newest is the one he just asked for.
import { useCallback, useEffect, useState } from "react";

export type SingletonKind = "film" | "stitch-room";

const CHANNEL = "sa-singleton";
const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** True while this copy has yielded to a newer one. `reclaim` makes this copy the newest again. */
export function useSingleton(kind: SingletonKind, enabled = true): { yielded: boolean; reclaim: () => void } {
  const [id] = useState(newId);
  const [yielded, setYielded] = useState(false);
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<{ kind?: SingletonKind; id?: string; type?: string }>) => {
      const m = e.data;
      if (!m || m.kind !== kind || m.id === id || m.type !== "hello") return;
      // A newer copy exists. Close if a script opened this window; otherwise go inert.
      try { if (window.opener || window.history.length <= 1) { window.close(); } } catch { /* the browser decides */ }
      setYielded(true);
    };
    ch.postMessage({ type: "hello", kind, id });
    return () => ch.close();
  }, [enabled, kind, id, gen]);
  const reclaim = useCallback(() => { setYielded(false); setGen((g) => g + 1); }, []);
  return { yielded, reclaim };
}
