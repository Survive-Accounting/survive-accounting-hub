// LIVE PREVIEW — which video card is playing its muted preview right now.
//
// King's testing notes (2026-09-14): "It would be better to have the videos auto-play when the cursor
// hovers over them." Hover preview existed but waited 350 ms, then fetched hls.js, then the stream —
// long enough that nobody noticed it. So: hls.js is warmed once the page is idle, a hover starts
// at once, and on a phone (no hover) the card sitting in the middle of the screen plays as you
// scroll, the Reels feel. One card at a time either way — this is the one-slot store they share.

type Listener = (key: string | null) => void;
let active: string | null = null;
const listeners = new Set<Listener>();

export function currentPreview(): string | null { return active; }
export function claimPreview(key: string): void { if (active !== key) { active = key; listeners.forEach((l) => l(active)); } }
export function releasePreview(key: string): void { if (active === key) { active = null; listeners.forEach((l) => l(active)); } }
export function onPreview(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** How the page previews: a mouse hovers; a touch screen previews the centred card; reduced motion
 *  previews nothing. Read on the client only. */
export function previewMode(): "hover" | "scroll" | "off" {
  if (typeof window === "undefined" || !window.matchMedia) return "off";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  return window.matchMedia("(hover: hover)").matches ? "hover" : "scroll";
}

let warmed = false;
/** Fetch the hls.js chunk ahead of the first preview, when the page is idle. */
export function warmPreviewPlayer(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const go = () => { void import("hls.js").catch(() => { warmed = false; }); };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(go, { timeout: 2500 }); else window.setTimeout(go, 1200);
}
