// SCREENSHOT SELECTOR (Lee, 2026-09-03): "so students can screenshot exactly
// what they're looking at with a selector tool."
//
// HOW IT WORKS, and why it works this way:
//   1. `captureScreen()` asks the browser for one frame via getDisplayMedia and
//      stops the track immediately. One still, no recording.
//   2. That still is painted into a full-screen overlay, scaled to fit.
//   3. Lee drags a box ON THE STILL. The crop is therefore computed against the
//      image the eye actually saw — so it is correct whether he shared this tab,
//      the whole window, or a second monitor.
//
// The naive version (drag over the LIVE page, then crop the capture by viewport
// coordinates) silently produces the wrong region the moment the shared surface
// is not exactly the viewport. That is the sort of "works on my machine" bug
// that is invisible until the screenshot is useless.
//
// The pure geometry lives here and is tested; the DOM work is in IdeasDock.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Shot { dataUrl: string; width: number; height: number }

/** getDisplayMedia is Chromium/Firefox/Safari-modern. When it is missing, the
 *  modal says so and offers paste — it never pretends to have captured. */
export function isCaptureSupported(): boolean {
  return typeof navigator !== "undefined"
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === "function";
}

/** Two drag corners → a positive-area rect. Dragging up-and-left is the normal
 *  way to select the top of a page, so it must work. */
export function normalizeDrag(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
  };
}

/** A selection smaller than this is a click, not a drag — cropping it would
 *  hand back a 3-pixel image and call it a screenshot. */
export const MIN_SELECTION_PX = 12;
export const isUsableSelection = (r: Rect): boolean => r.w >= MIN_SELECTION_PX && r.h >= MIN_SELECTION_PX;

/** How a `natural`-sized image sits inside a `box` under object-fit: contain —
 *  the same letterboxing the browser does, computed so the crop can undo it. */
export function containedRect(natural: { w: number; h: number }, box: { w: number; h: number }): Rect {
  if (natural.w <= 0 || natural.h <= 0 || box.w <= 0 || box.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const w = natural.w * scale, h = natural.h * scale;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

/** Screen coordinates of the drag → pixel coordinates in the captured still.
 *  Clamped to the image, so a drag that runs off the letterbox edge crops to the
 *  edge instead of producing a rect the canvas will refuse. */
export function mapSelection(sel: Rect, displayed: Rect, natural: { w: number; h: number }): Rect {
  if (displayed.w <= 0 || displayed.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const sx = natural.w / displayed.w, sy = natural.h / displayed.h;
  const x0 = Math.max(0, Math.min(natural.w, (sel.x - displayed.x) * sx));
  const y0 = Math.max(0, Math.min(natural.h, (sel.y - displayed.y) * sy));
  const x1 = Math.max(0, Math.min(natural.w, (sel.x + sel.w - displayed.x) * sx));
  const y1 = Math.max(0, Math.min(natural.h, (sel.y + sel.h - displayed.y) * sy));
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** Grab ONE frame of whatever the person shares, then stop the track. Rejects
 *  loudly — a denied share must not look like an empty screenshot. */
export async function captureScreen(): Promise<Shot> {
  if (!isCaptureSupported()) throw new Error("This browser cannot capture the screen (getDisplayMedia is missing).");
  const stream = await navigator.mediaDevices.getDisplayMedia({
    // preferCurrentTab is Chromium-only and ignored elsewhere; it makes the
    // common case (this page) one click instead of three.
    video: { frameRate: 1 }, audio: false, preferCurrentTab: true,
  } as MediaStreamConstraints);
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    // One paint, so the first frame is real rather than a black placeholder.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error("The screen share produced no frame.");
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.drawImage(video, 0, 0, w, h);
    video.pause();
    video.srcObject = null;
    return { dataUrl: c.toDataURL("image/png"), width: w, height: h };
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}

/** Crop the still to the chosen region and hand back a File the existing
 *  attachment upload takes as-is. */
export async function cropToFile(shot: Shot, region: Rect, name = "screenshot.png"): Promise<File> {
  if (region.w < 1 || region.h < 1) throw new Error("That selection was empty — drag a box over the part you want.");
  const img = new Image();
  img.src = shot.dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = region.w; c.height = region.h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not turn the selection into an image.");
  return new File([blob], name, { type: "image/png" });
}

/** Images out of a paste event — the fallback when screen capture is blocked
 *  (Windows Shift+Win+S, then Ctrl+V into the modal). */
export function imagesFromClipboard(items: DataTransferItemList | null | undefined): File[] {
  if (!items) return [];
  const out: File[] = [];
  for (const it of Array.from(items)) {
    if (it.kind !== "file" || !it.type.startsWith("image/")) continue;
    const f = it.getAsFile();
    if (f) out.push(new File([f], f.name || `pasted-${Date.now()}.png`, { type: f.type || "image/png" }));
  }
  return out;
}
