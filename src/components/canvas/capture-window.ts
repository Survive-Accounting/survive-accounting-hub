// CAPTURE WINDOW (C1) — pixel-perfect OBS capture. The inner canvas must be
// EXACTLY 1920x1080 PHYSICAL pixels regardless of Windows display scaling:
// CSS px * devicePixelRatio = physical px, so the window's inner CSS size is
// 1920/dpr x 1080/dpr. OBS window-capture at Reset Transform is then 1:1 —
// zero stretching, razor-sharp text.
//
// Pure math here; the popout applies it (resizeTo with chrome deltas) and the
// badge reads verifyCaptureSize on every resize/focus.

export const CAPTURE_W = 1920;
export const CAPTURE_H = 1080;

/** The CSS inner size that yields exactly 1920x1080 physical at this dpr.
 *  Common Windows scalings divide cleanly (100%→1920x1080, 125%→1536x864,
 *  150%→1280x720, 200%→960x540); oddballs round and the badge tells the truth. */
export function captureCssSize(dpr: number): { w: number; h: number; exact: boolean } {
  const d = dpr > 0 ? dpr : 1;
  const w = Math.round(CAPTURE_W / d);
  const h = Math.round(CAPTURE_H / d);
  return { w, h, exact: Math.round(w * d) === CAPTURE_W && Math.round(h * d) === CAPTURE_H };
}

/** What OBS actually captures: the inner size in physical pixels. */
export function physicalSize(innerCssW: number, innerCssH: number, dpr: number): { w: number; h: number } {
  const d = dpr > 0 ? dpr : 1;
  return { w: Math.round(innerCssW * d), h: Math.round(innerCssH * d) };
}

export function isCaptureExact(innerCssW: number, innerCssH: number, dpr: number): boolean {
  const p = physicalSize(innerCssW, innerCssH, dpr);
  return p.w === CAPTURE_W && p.h === CAPTURE_H;
}

/** Can a WINDOWED browser even reach 1920x1080 client area here? The window
 *  chrome (title bar + borders) must fit alongside it inside the screen's work
 *  area — on a 1080p monitor it CANNOT, which is why fullscreen is the reliable
 *  path. Returns the shortfall so the badge can say so instead of just failing. */
export function captureFeasibility(win: Window): { possible: boolean; reason?: string } {
  const dpr = win.devicePixelRatio || 1;
  const { w, h } = captureCssSize(dpr);
  const dw = Math.max(0, win.outerWidth - win.innerWidth);
  const dh = Math.max(0, win.outerHeight - win.innerHeight);
  const availW = win.screen?.availWidth ?? 0;
  const availH = win.screen?.availHeight ?? 0;
  if (!availW || !availH) return { possible: true };
  if (w + dw > availW || h + dh > availH) {
    return { possible: false, reason: "this screen can't fit a 1920×1080 client area PLUS window chrome — press F for fullscreen (exact 1:1), or use a larger display" };
  }
  return { possible: true };
}

/** Snap a popout so its INNER canvas hits 1920x1080 physical. ITERATES: the
 *  chrome delta (outer − inner) is unreliable immediately after open and after
 *  a resize, so we measure, correct, and re-measure — one shot routinely lands
 *  short (that was the 1584×778 Lee saw). Returns whether it converged. */
export function snapCaptureSize(win: Window, onDone?: (ok: boolean, reason?: string) => void): void {
  const dpr = win.devicePixelRatio || 1;
  const { w, h } = captureCssSize(dpr);
  let pass = 0;
  const step = () => {
    if (pass++ > 3) { const f = captureFeasibility(win); onDone?.(isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1), f.reason); return; }
    const dw = win.outerWidth - win.innerWidth;
    const dh = win.outerHeight - win.innerHeight;
    try { win.resizeTo(w + dw, h + dh); } catch { onDone?.(false, "the browser refused to resize this window — press F for fullscreen"); return; }
    if (isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1)) { onDone?.(true); return; }
    win.setTimeout(step, 90);
  };
  step();
}
