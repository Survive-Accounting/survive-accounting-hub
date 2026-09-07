// THE POP-OUT — the same /film page opened as its own window, snapped so its
// client area is 1080×1920 PHYSICAL pixels (or, on a landscape monitor, the
// tallest exact 9:16 that fits), which OBS window-captures with no crop and
// no scaling. Lee: "whichever has best screen record quality in OBS".
//
// Not a blank window + portal (canvas/PanelPopout): the page opens ITSELF
// again with ?popout=1 — the film route's validateSearch keeps the flag and
// this hook reads it off the location. Inside that window: snapCaptureSize on
// mount (after the previewer's 200 ms grace, so the chrome delta has settled),
// the status re-read on every resize, and F toggles fullscreen on the document
// — on a 9:16 portrait monitor that is the other route to an exact 1080×1920.
//
// THE COUNTDOWN (2026-09-07) lives here too, because it is the pop-out's alone. Lee: "I would
// prefer with capture window having a 10 second countdown… like we're on slide 0 at that
// point." C (or the chrome button) starts it: the pop-out goes black with the count, big, cream,
// the last three in gold, the wordmark small below; at zero slide 1 is up. Space during the
// count cancels it. A take-time affordance, NOT rehearsal — it never touches the rounds reducer
// (capture/rehearsal-rounds.ts). What the main window does with it (slide 1 undimmed during
// the count, slide 2 dimmed at zero) is prompter-sync.ts's side.
import { useCallback, useEffect, useState } from "react";

import { captureAcceptable, isCaptureExact, physicalSize, snapCaptureSize } from "@/components/canvas/capture-window";
import { isTypingTarget } from "@/components/canvas/film-lock";
import { captureSize } from "@/components/canvas/orientation";

export const POPOUT_PARAM = "popout";
export const POPOUT_NAME = "sa-film-popout";
export const POPOUT_FEATURES = "popup=yes,width=560,height=1000";
export const POPOUT_BLOCKED = "the browser blocked the pop-out — allow pop-ups for this site";
export const POPOUT_OPENED = "popped out — window-capture the new window in OBS";

export interface CapturePopout {
  /** True inside the popped-out window (chrome hidden by default there). */
  isPopout: boolean;
  /** Open the popout from a click (browsers block it otherwise); null when unavailable. */
  open: (() => void) | null;
  /** A one-line status for the chrome ("1080×1920 · exact", or why not). */
  status: string | null;
}

/** ?popout=1 — is this window the pop-out? */
export function isPopoutSearch(search: string): boolean {
  try { return new URLSearchParams(search).get(POPOUT_PARAM) === "1"; } catch { return false; }
}

/** The current page with popout=1 added; everything else on the URL kept. */
export function popoutHref(href: string): string {
  const u = new URL(href);
  u.searchParams.set(POPOUT_PARAM, "1");
  return u.toString();
}

/** The one line the chrome shows: what OBS actually captures, in physical
 *  pixels, and what to do about it when that is not 1080×1920. */
export function captureStatus(innerCssW: number, innerCssH: number, dpr: number, reason?: string): string {
  const p = physicalSize(innerCssW, innerCssH, dpr);
  const t = captureSize("9:16");
  if (isCaptureExact(innerCssW, innerCssH, dpr, "9:16")) return `${p.w}×${p.h} · exact`;
  if (captureAcceptable(innerCssW, innerCssH, dpr, "9:16")) return `${p.w}×${p.h} · tallest 9:16 that fits — set OBS to scale to ${t.w}×${t.h} · F = fullscreen`;
  return `${p.w}×${p.h} · not 9:16 — ${reason ?? "resize the window, or F for fullscreen on a portrait monitor"}`;
}

function toggleFullscreen(doc: Document): void {
  try {
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => { /* ignore */ });
    else void doc.documentElement.requestFullscreen().catch(() => { /* ignore */ });
  } catch { /* an engine without the API — nothing to toggle */ }
}

export function useCapturePopout(): CapturePopout {
  // Lazy and window-guarded: false on the server, decided once on the client
  // (BlastOffCapture seeds its chrome default from it on the first render).
  const [isPopout] = useState<boolean>(() => typeof window !== "undefined" && isPopoutSearch(window.location.search));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isPopout) return;
    const read = (reason?: string) => setStatus(captureStatus(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, reason));
    read();
    // Snap once the window has settled; the snap iterates (measure, correct,
    // re-measure) and reports why when it cannot land. Every resize after —
    // the snap's own, a hand resize, fullscreen — re-reads the truth.
    const timer = window.setTimeout(() => snapCaptureSize(window, (_ok, why) => read(why), "9:16"), 200);
    const onResize = () => read();
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "f" && e.key !== "F") || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (isTypingTarget() || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      e.preventDefault();
      toggleFullscreen(document);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); };
  }, [isPopout]);

  // From the click only — a popup opened from an effect is blocked, and the
  // window name means a second click re-uses (and refocuses) the same window.
  const open = useCallback(() => {
    let w: Window | null = null;
    try { w = window.open(popoutHref(window.location.href), POPOUT_NAME, POPOUT_FEATURES); } catch { w = null; }
    if (!w) { setStatus(POPOUT_BLOCKED); return; }
    try { w.focus(); } catch { /* ignore */ }
    setStatus(POPOUT_OPENED);
  }, []);

  return { isPopout, open: isPopout || typeof window === "undefined" ? null : open, status };
}

// ------------------------------------------------------------------ the countdown

export const COUNTDOWN_SECONDS = 10;
/** "the last 3 in gold" — 3, 2, 1. */
export const COUNTDOWN_GOLD_FROM = 3;

/** Which colour the count reads in: gold for the last three, cream before. */
export const countdownTone = (seconds: number): "gold" | "cream" => (seconds <= COUNTDOWN_GOLD_FROM ? "gold" : "cream");

/** The next second of the count: 10 → 9 → … → 1 → done (null). */
export const countdownStep = (seconds: number): number | null => (seconds > 1 ? seconds - 1 : null);

export interface Countdown {
  /** Seconds left, or null when no count is on. */
  seconds: number | null;
  start: () => void;
  cancel: () => void;
}

/** The 10 s count, one tick a second. `onStart` runs when it begins (the pop-out jumps to slide
 *  0, so the moment the count hides, slide 1 is what is there). Nothing fires at zero: the black
 *  simply lifts. */
export function useCountdown(onStart: () => void): Countdown {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (seconds === null) return;
    const t = window.setTimeout(() => setSeconds(countdownStep(seconds)), 1000);
    return () => window.clearTimeout(t);
  }, [seconds]);
  const start = useCallback(() => { onStart(); setSeconds(COUNTDOWN_SECONDS); }, [onStart]);
  const cancel = useCallback(() => setSeconds(null), []);
  return { seconds, start, cancel };
}
