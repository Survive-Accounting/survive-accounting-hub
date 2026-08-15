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

/** Snap a popout so its INNER canvas hits 1920x1080 physical: target CSS size
 *  plus the window-chrome delta (outer − inner). Best-effort — some window
 *  managers clamp; the badge verifies the result rather than trusting this. */
export function snapCaptureSize(win: Window): void {
  const dpr = win.devicePixelRatio || 1;
  const { w, h } = captureCssSize(dpr);
  const dw = win.outerWidth - win.innerWidth;
  const dh = win.outerHeight - win.innerHeight;
  try { win.resizeTo(w + dw, h + dh); } catch { /* blocked — the badge shows red */ }
}
