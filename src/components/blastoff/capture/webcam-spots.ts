// THE CAMERA'S SPOTS on a 9:16 slide — pure geometry, tested.
//
// Lee (2026-09-05): "3 fixed positions on slides the camera could sit, which
// we program in /arrange or /results … and also a camera off setting. Pick
// the three spots … Maybe one option for free form to place it anywhere.
// Resize it too. But it needs a home spot 70%+ of the time … my gut is
// saying that my camera is bottom left corner, captions … to the right."
//
//   home    a circle, bottom-left, sitting just above the caption band — the
//           default on every card slide. Captions go to its right.
//   corner  a small circle, top-right, under the status bar and above the
//           like/share rail — for a slide where the card needs the floor.
//   hero    a big rounded portrait, top-centre — the talking-head framing
//           (the intro, the bio, a straight-to-camera moment).
//   free    anywhere, any size (dragged on the Review stage or in the take).
//   off     no camera.
//
// Fractions of the phone (w = width, h = height). The Shorts safe zones the
// Review stage shades: status bar top 9%, caption/title/sound bottom 20%,
// like/share rail right 16% from 30% to 80% of the height.
import type { BlastFrame } from "../plan";

export const CAM_SPOTS = ["home", "corner", "hero", "top", "free", "off"] as const;
export type CamSpot = (typeof CAM_SPOTS)[number];
export const CAM_LABEL: Record<CamSpot, string> = { home: "home · bottom-left", corner: "corner · top-right", hero: "hero · big, top", top: "top · a big circle, centred", free: "free · anywhere", off: "off" };

export function isCamSpot(v: unknown): v is CamSpot { return typeof v === "string" && (CAM_SPOTS as readonly string[]).includes(v); }

/** The camera the slide gets when nothing was chosen: the brand slides, the
 *  bolt detour and the ads film clean; the intro carries the campus ticker
 *  across the home spot, so Lee sits in the corner there; every card slide
 *  has him in the home spot (Lee: "it needs a home spot 70%+ of the time"). */
export function defaultCamFor(kind: BlastFrame["kind"]): CamSpot {
  if (kind === "open" || kind === "outro" || kind === "bolt" || kind === "ad") return "off";
  if (kind === "intro") return "corner";
  return "home";
}

export function camSpotOf(frame: Pick<BlastFrame, "kind" | "cam">): CamSpot {
  return isCamSpot(frame.cam) ? frame.cam : defaultCamFor(frame.kind);
}

export interface CamRect { x: number; y: number; w: number; h: number; shape: "circle" | "portrait" }

/** Where the camera sits, in px, for a phone `w` × `h`. `size` is the
 *  diameter / width as a fraction of the phone width (free spot only, and an
 *  override for the fixed spots); `pos` the top-left fraction (free only). */
export function camRect(spot: Exclude<CamSpot, "off">, w: number, h: number, size?: number, pos?: { x: number; y: number }): CamRect {
  const r = (v: number) => Math.round(v);
  switch (spot) {
    case "home": { const d = r(w * (size ?? 0.24)); return { x: r(w * 0.05), y: r(h * 0.8) - d, w: d, h: d, shape: "circle" }; }
    case "corner": { const d = r(w * (size ?? 0.17)); return { x: w - r(w * 0.05) - d, y: r(h * 0.105), w: d, h: d, shape: "circle" }; }
    case "hero": { const cw = r(w * (size ?? 0.62)); const ch = r(cw * 1.2); return { x: r((w - cw) / 2), y: r(h * 0.11), w: cw, h: ch, shape: "portrait" }; }
    // TOP (pass 2): a big circle, centred, under the status bar — above the wordmark on the intro.
    case "top": { const d = r(w * (size ?? 0.34)); return { x: r((w - d) / 2), y: r(h * 0.105), w: d, h: d, shape: "circle" }; }
    case "free": { const d = r(w * (size ?? 0.26)); const p = pos ?? { x: 0.05, y: 0.55 }; return { x: r(p.x * w), y: r(p.y * h), w: d, h: d, shape: "circle" }; }
  }
}

export interface Box { x: number; y: number; w: number; h: number }

export function overlaps(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** THE CAMERA NEVER BLOCKS A CARD (Lee: "it would probably scale down
 *  automatically, huh?"). Shrink the camera in steps, anchored to the edge it
 *  belongs to (home: bottom-left · corner: top-right · hero: top-centre ·
 *  free: its own centre), until it clears the card — down to `min` of its
 *  size. Returns the rect it ends at and whether it cleared. */
export function avoidCard(cam: CamRect, spot: Exclude<CamSpot, "off">, card: Box | null, min = 0.55, pad = 8): { rect: CamRect; scale: number; clear: boolean } {
  if (!card || !overlaps(cam, card, pad)) return { rect: cam, scale: 1, clear: true };
  let k = 1;
  while (k > min) {
    k = Math.round(k * 0.92 * 1000) / 1000;
    const w = Math.round(cam.w * k), h = Math.round(cam.h * k);
    const rect: CamRect = spot === "home" ? { ...cam, x: cam.x, y: cam.y + (cam.h - h), w, h }
      : spot === "corner" ? { ...cam, x: cam.x + (cam.w - w), y: cam.y, w, h }
      : spot === "hero" || spot === "top" ? { ...cam, x: cam.x + Math.round((cam.w - w) / 2), y: cam.y, w, h }
      : { ...cam, x: cam.x + Math.round((cam.w - w) / 2), y: cam.y + Math.round((cam.h - h) / 2), w, h };
    if (!overlaps(rect, card, pad)) return { rect, scale: k, clear: true };
    if (k <= min) return { rect, scale: k, clear: false };
  }
  return { rect: cam, scale: 1, clear: false };
}

/** THE HERO (2026-09-05, polish pass). Ctrl+click on the camera and two things move
 *  together: the camera swims to the top-centre as a big portrait, and the wordmark
 *  leaves its watermark corner to sit under it, centred, large — the branded signature
 *  moment. Both rects are here so the pair is one tested fact: the camera's bottom edge
 *  clears the wordmark's top, and the wordmark's bottom edge (.585h) sits ABOVE the fixed
 *  caption rail (.61h+) so a burned-in caption can never collide with it. The spec asked
 *  for the bottom fifth; that band is the platform's own caption/title chrome, so the
 *  signature lands just above the rail instead. */
export function heroCamRect(w: number, h: number): CamRect {
  const cw = Math.round(w * 0.6), ch = Math.round(cw * 1.2);
  return { x: Math.round((w - cw) / 2), y: Math.round(h * 0.1), w: cw, h: ch, shape: "portrait" };
}
export function wordmarkHero(w: number, h: number): { scale: number; bottom: number } {
  return { scale: 2.3, bottom: Math.round(h * 0.585) };
}
/** The watermark's resting type size on a phone `w` wide (PhoneFrame draws it at 5.2 % of the width). */
export function watermarkSize(w: number): number { return Math.max(12, Math.round(w * 0.052)); }

/** B cycles the spots on the take: home → corner → hero → top → off → home. */
export function nextCamSpot(cur: CamSpot): CamSpot {
  const order: CamSpot[] = ["home", "corner", "hero", "top", "off"];
  const i = order.indexOf(cur === "free" ? "home" : cur);
  return order[(i + 1) % order.length];
}
