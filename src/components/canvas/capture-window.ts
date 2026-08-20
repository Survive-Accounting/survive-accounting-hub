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

// ---- VERTICAL, WINDOWED (Lee's recipe, 08-20) -------------------------------
// A 1080×1920 client area cannot exist on a landscape monitor, so windowed
// vertical capture was permanently red and un-snappable. The workable recipe —
// Lee's own — is: size the client to the TALLEST exact-9:16 rect the work area
// allows, draw the frame top-anchored + width-fit so content starts at client
// row 0 (immediately below the browser chrome), then in OBS window-capture crop
// the chrome off the top and scale the result to 1080×1920. Deterministic:
// the crop is always "everything above the client area", nothing else.

/** The largest 9:16 client that fits a work area alongside this window chrome. */
export function maxVerticalCssSize(availW: number, availH: number, dw: number, dh: number): { w: number; h: number } {
  let h = Math.max(160, availH - dh);
  let w = Math.round(h * 9 / 16);
  if (w + dw > availW) { w = Math.max(90, availW - dw); h = Math.round(w * 16 / 9); }
  return { w, h };
}

/** Within one CSS pixel of 9:16 at this width. */
export function isNineSixteen(innerCssW: number, innerCssH: number): boolean {
  return innerCssW > 0 && Math.abs(innerCssH - Math.round(innerCssW * 16 / 9)) <= 1;
}

/** Is this client GOOD for the orientation? Landscape keeps the old truth —
 *  exactly 1920×1080 physical. Vertical is good at exact 1080×1920 physical OR
 *  at exact 9:16 aspect (the windowed crop-and-scale recipe above). */
export function captureAcceptable(innerCssW: number, innerCssH: number, dpr: number, o: Orientation = "16:9"): boolean {
  if (isCaptureExact(innerCssW, innerCssH, dpr, o)) return true;
  return o === "9:16" && isNineSixteen(innerCssW, innerCssH);
}

/** The OBS one-liner for a windowed vertical capture — the top crop is the
 *  window chrome in PHYSICAL pixels (what OBS's crop filter counts in). */
export function verticalObsNote(win: Window): string {
  const dpr = win.devicePixelRatio || 1;
  const cropTop = Math.round(Math.max(0, win.outerHeight - win.innerHeight) * dpr);
  const p = physicalSize(win.innerWidth, win.innerHeight, dpr);
  return `OBS: Window Capture → crop ${cropTop}px off the TOP (the browser chrome), 0 elsewhere → scale to 1080×1920 (source is ${p.w}×${p.h})`;
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
    // Vertical on a landscape screen is the NORMAL case, not a failure: the
    // snap falls back to the tallest 9:16 and the badge carries the OBS recipe.
    if (o === "9:16") return { possible: false, reason: `a ${t.w}×${t.h} client can't fit this screen — snapped to the tallest exact 9:16 instead. ${verticalObsNote(win)}` };
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
  const exact = captureCssSize(dpr, o);
  let pass = 0;
  const step = () => {
    if (pass++ > 3) { const f = captureFeasibility(win, o); onDone?.(captureAcceptable(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1, o), f.reason); return; }
    const dw = win.outerWidth - win.innerWidth;
    const dh = win.outerHeight - win.innerHeight;
    // VERTICAL FALLBACK: when the exact client can't fit this screen (every
    // landscape monitor), target the tallest 9:16 that does — Lee's windowed
    // crop-and-scale recipe. Landscape keeps the exact-only behaviour.
    const availW = win.screen?.availWidth ?? 0;
    const availH = win.screen?.availHeight ?? 0;
    const exactFits = !availW || !availH || (exact.w + dw <= availW && exact.h + dh <= availH);
    const t = o === "9:16" && !exactFits ? maxVerticalCssSize(availW, availH, dw, dh) : exact;
    try { win.resizeTo(t.w + dw, t.h + dh); } catch { onDone?.(false, "the browser refused to resize this window — press F for fullscreen"); return; }
    if (captureAcceptable(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1, o)) { onDone?.(true); return; }
    win.setTimeout(step, 90);
  };
  step();
}
