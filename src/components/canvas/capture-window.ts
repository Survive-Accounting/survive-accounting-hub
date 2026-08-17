// CAPTURE WINDOW (C1) — pixel-perfect OBS capture. The inner canvas must be
// EXACTLY 1920x1080 PHYSICAL pixels regardless of Windows display scaling:
// CSS px * devicePixelRatio = physical px, so the window's inner CSS size is
// 1920/dpr x 1080/dpr. OBS window-capture at Reset Transform is then 1:1 —
// zero stretching, razor-sharp text.
//
// Pure math here; the popout applies it (resizeTo with chrome deltas) and the
// badge reads verifyCaptureSize on every resize/focus.

import { captureSize, type Orientation } from "./orientation";

// LANDSCAPE DEFAULTS, kept as named constants because a lot of call sites and
// tests reference them. Vertical goes through captureSize(o) — see orientation.ts.
export const CAPTURE_W = 1920;
export const CAPTURE_H = 1080;

/** The CSS inner size that yields exactly 1920x1080 physical at this dpr.
 *  Common Windows scalings divide cleanly (100%→1920x1080, 125%→1536x864,
 *  150%→1280x720, 200%→960x540); oddballs round and the badge tells the truth. */
export function captureCssSize(dpr: number, o: Orientation = "16:9"): { w: number; h: number; exact: boolean } {
  const d = dpr > 0 ? dpr : 1;
  const t = captureSize(o);
  const w = Math.round(t.w / d);
  const h = Math.round(t.h / d);
  return { w, h, exact: Math.round(w * d) === t.w && Math.round(h * d) === t.h };
}

/** What OBS actually captures: the inner size in physical pixels. */
export function physicalSize(innerCssW: number, innerCssH: number, dpr: number): { w: number; h: number } {
  const d = dpr > 0 ? dpr : 1;
  return { w: Math.round(innerCssW * d), h: Math.round(innerCssH * d) };
}

export function isCaptureExact(innerCssW: number, innerCssH: number, dpr: number, o: Orientation = "16:9"): boolean {
  const p = physicalSize(innerCssW, innerCssH, dpr);
  const t = captureSize(o);
  return p.w === t.w && p.h === t.h;
}

/** Can a WINDOWED browser even reach 1920x1080 client area here? The window
 *  chrome (title bar + borders) must fit alongside it inside the screen's work
 *  area — on a 1080p monitor it CANNOT, which is why fullscreen is the reliable
 *  path. Returns the shortfall so the badge can say so instead of just failing. */
export function captureFeasibility(win: Window, o: Orientation = "16:9"): { possible: boolean; reason?: string } {
  const dpr = win.devicePixelRatio || 1;
  const { w, h } = captureCssSize(dpr, o);
  const dw = Math.max(0, win.outerWidth - win.innerWidth);
  const dh = Math.max(0, win.outerHeight - win.innerHeight);
  const availW = win.screen?.availWidth ?? 0;
  const availH = win.screen?.availHeight ?? 0;
  if (!availW || !availH) return { possible: true };
  if (w + dw > availW || h + dh > availH) {
    const t = captureSize(o);
    return { possible: false, reason: `this screen can't fit a ${t.w}×${t.h} client area PLUS window chrome — press F for fullscreen (exact 1:1), or use a larger display` };
  }
  return { possible: true };
}

/** Snap a popout so its INNER canvas hits 1920x1080 physical. ITERATES: the
 *  chrome delta (outer − inner) is unreliable immediately after open and after
 *  a resize, so we measure, correct, and re-measure — one shot routinely lands
 *  short (that was the 1584×778 Lee saw). Returns whether it converged. */
export function snapCaptureSize(win: Window, onDone?: (ok: boolean, reason?: string) => void, o: Orientation = "16:9"): void {
  const dpr = win.devicePixelRatio || 1;
  const { w, h } = captureCssSize(dpr, o);
  let pass = 0;
  const step = () => {
    if (pass++ > 3) { const f = captureFeasibility(win, o); onDone?.(isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1, o), f.reason); return; }
    const dw = win.outerWidth - win.innerWidth;
    const dh = win.outerHeight - win.innerHeight;
    try { win.resizeTo(w + dw, h + dh); } catch { onDone?.(false, "the browser refused to resize this window — press F for fullscreen"); return; }
    if (isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1, o)) { onDone?.(true); return; }
    win.setTimeout(step, 90);
  };
  step();
}
