// THE PULSE (2026-09-11) — what /learn reports so the daily chapter and campus emails can say
// who is using this. Lee: "Daily email summary of video views, watch time, practice questions,
// page visits, average session length, emails added… for any chapter that produced activity."
//
// What it sends (see lib/learn-events.functions.ts):
//   page_visit   once per mount
//   video_start  each time a video starts (by part key)
//   watch_time   the seconds actually played, flushed every 15s and on leave (ANY play counts —
//                Lee, 2026-09-11: "I think any play")
//   page_time    the seconds the tab was visible, flushed every 30s and on leave
// Both times are measured — Lee: "track both time on page and time watching".
//
// Nothing here blocks the page: events queue in memory and post in small batches; a failed post
// is dropped. Demo pages send nothing. The session id lives for the tab; the anon id is the
// device id the rest of the site already uses.
import { useCallback, useEffect, useRef } from "react";

import { deviceAnonId } from "@/lib/device-id";
import { currentContactRef } from "@/lib/contact-ref";
import { recordLearnEvents, type LearnEvent } from "@/lib/learn-events.functions";

const SESSION_KEY = "sa-learn-session";
const WATCH_FLUSH_MS = 15_000;
const PAGE_TICK_MS = 30_000;

function sessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) { s = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem(SESSION_KEY, s); }
    return s;
  } catch { return "nosession"; }
}

export function useLearnPulse(ctx: { campusId: string | null; campusSlug: string | null; chapterSlug: string | null; enabled: boolean }) {
  const base = useRef(ctx);
  base.current = ctx;
  const queue = useRef<LearnEvent[]>([]);
  const watchSec = useRef(0);
  const lastPos = useRef<{ key: string; pos: number } | null>(null);

  const stamp = useCallback((e: Partial<LearnEvent> & { kind: LearnEvent["kind"] }): LearnEvent => ({
    campusId: base.current.campusId, campusSlug: base.current.campusSlug, chapterSlug: base.current.chapterSlug,
    anonId: deviceAnonId(), sessionId: sessionId(), ref: currentContactRef(), ...e,
  }), []);

  const flush = useCallback(() => {
    if (!base.current.enabled) { queue.current = []; watchSec.current = 0; return; }
    if (watchSec.current >= 1) { queue.current.push(stamp({ kind: "watch_time", seconds: Math.round(watchSec.current) })); watchSec.current = 0; }
    if (!queue.current.length) return;
    const events = queue.current.splice(0, 50);
    void recordLearnEvents({ data: { events } }).catch(() => { /* dropped on purpose */ });
  }, [stamp]);

  // The visit, the page-time ticks, the watch-time flushes, and a last flush on leave.
  useEffect(() => {
    if (!base.current.enabled) return;
    queue.current.push(stamp({ kind: "page_visit" }));
    flush();
    let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    const tickPage = () => {
      if (visibleSince == null) return;
      const s = Math.round((Date.now() - visibleSince) / 1000);
      visibleSince = Date.now();
      if (s >= 1) queue.current.push(stamp({ kind: "page_time", seconds: Math.min(s, 3600) }));
    };
    const pageTimer = window.setInterval(() => { tickPage(); flush(); }, PAGE_TICK_MS);
    const watchTimer = window.setInterval(flush, WATCH_FLUSH_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") { tickPage(); visibleSince = null; flush(); }
      else visibleSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      window.clearInterval(pageTimer); window.clearInterval(watchTimer);
      document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onVis);
      tickPage(); flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A video started (by part key). */
  const videoStart = useCallback((partKey: string, setId: string) => {
    if (!base.current.enabled) return;
    queue.current.push(stamp({ kind: "video_start", partKey, setId }));
    lastPos.current = null;
  }, [stamp]);

  /** The player's position ticks: the forward delta is watch time (a seek or a loop is not). */
  const position = useCallback((partKey: string, positionSec: number) => {
    const last = lastPos.current;
    if (last && last.key === partKey) {
      const d = positionSec - last.pos;
      if (d > 0 && d <= 2.5) watchSec.current += d;
    }
    lastPos.current = { key: partKey, pos: positionSec };
  }, []);

  return { videoStart, position };
}
