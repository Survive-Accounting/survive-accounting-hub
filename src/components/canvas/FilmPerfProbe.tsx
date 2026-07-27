// FILM PERF PROBE (dev instrument) — an OPT-IN long-task logger for profiling frame-
// to-frame transitions with a video-loop background active. OFF by default: it renders
// null and installs nothing, so it adds ZERO overhead during a real take (it is, in
// effect, stripped from film mode unless you deliberately turn it on). Works on any
// build INCLUDING the Vercel preview (it is a runtime flag, not import.meta.env.DEV, so
// it survives the production build you actually film on).
//
// USE: in the browser console →  localStorage.setItem("sa-film-perf","1")  then reload.
// Advance frames a dozen times in film mode with a loop playing and read the console:
// every long task (>50ms — a dropped-frame candidate) logs its duration plus a rolling
// count/avg/max. Compare the count before vs after an optimization. Stop with
// localStorage.removeItem("sa-film-perf").
import { useEffect } from "react";

export function FilmPerfProbe() {
  useEffect(() => {
    let on = false;
    try { on = !!localStorage.getItem("sa-film-perf"); } catch { /* ignore */ }
    if (!on || typeof PerformanceObserver === "undefined") return;
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      console.warn("[film-perf] the Long Tasks API isn't available in this browser — no data.");
      return;
    }
    let count = 0, total = 0, max = 0;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        count++; total += e.duration; max = Math.max(max, e.duration);
        console.log(`[film-perf] long task ${Math.round(e.duration)}ms  ·  n=${count} avg=${Math.round(total / count)}ms max=${Math.round(max)}ms`);
      }
    });
    try { obs.observe({ entryTypes: ["longtask"] }); } catch { return; }
    console.log("[film-perf] ON — advance frames; long tasks (>50ms) log here. localStorage.removeItem('sa-film-perf') to stop.");
    return () => obs.disconnect();
  }, []);
  return null;
}
