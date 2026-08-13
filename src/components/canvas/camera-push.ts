// CINEMATIC CAMERA PUSH (pure) — camera-only motion for filming. Two moves:
//   • AMBIENT: a slow Ken-Burns push toward the frame center on frame entry.
//   • SPOTLIGHT: a dolly toward the emphasized target when Spotlight starts/moves.
// Both are viewport-only (never touch nodes / layout) and reset to the frame-fill
// shot on exit. This module is the pure math — the route runs the easing + the
// prefers-reduced-motion / film-only gating.
//
// Legibility cap (Lee): on a CARD frame the spotlight push may not zoom so far
// that the target card leaves the shot (its text would clip / drop below the
// 1080p-legible threshold). Scenery frames (headings/text/image only) may push
// further. Zooming IN only makes text bigger, so the binding constraint is
// "keep the whole target card inside the frame with margin".

export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { x: number; y: number; zoom: number }

export const PUSH = {
  /** spotlight zoom multiplier over the frame-fill zoom */
  regular: 1.25,
  super: 1.5,
  /** ambient Ken-Burns end zoom (slow drift toward the frame center) */
  ambient: 1.12,
  /** the target card must occupy ≤ this fraction of the shot (keeps it on-screen) */
  cardFitMargin: 0.86,
  /** scenery frames may push this many × the frame-fill zoom */
  sceneryMax: 2.0,
  /** React Flow zoom clamp used across the canvas */
  minZoom: 0.08,
  maxZoom: 2.5,
} as const;

const clampZoom = (z: number) => Math.max(PUSH.minZoom, Math.min(PUSH.maxZoom, z));

/** Frame-fill viewport (the "home" shot) — mirrors enterFrame's exact fit. */
export function fillViewport(frame: Rect, cw: number, ch: number): Viewport {
  const zoom = clampZoom(Math.min(cw / frame.w, ch / frame.h));
  return { x: cw / 2 - (frame.x + frame.w / 2) * zoom, y: ch / 2 - (frame.y + frame.h / 2) * zoom, zoom };
}

/** Viewport centered on `target` at a given zoom. */
export function centerViewport(target: Rect, zoom: number, cw: number, ch: number): Viewport {
  const z = clampZoom(zoom);
  return { x: cw / 2 - (target.x + target.w / 2) * z, y: ch / 2 - (target.y + target.h / 2) * z, zoom: z };
}

/** The pushed shot: dolly toward `target`, capped so it stays legible/on-screen.
 *  Never zooms OUT past the frame-fill shot. `intensity` scales the base push. */
export function spotlightPushViewport(opts: {
  frame: Rect;
  target: Rect;
  cw: number;
  ch: number;
  tier: "regular" | "super";
  isScenery: boolean;
  intensity?: number; // 1 = default; scales the push multiplier
}): Viewport {
  const { frame, target, cw, ch, tier, isScenery } = opts;
  const intensity = opts.intensity ?? 1;
  const home = fillViewport(frame, cw, ch);
  const want = home.zoom * (1 + ((tier === "super" ? PUSH.super : PUSH.regular) - 1) * intensity);
  // fit cap — the whole target must stay inside the shot with margin
  const fitZoom = Math.min(cw / target.w, ch / target.h) * PUSH.cardFitMargin;
  const cap = isScenery ? home.zoom * PUSH.sceneryMax : Math.max(home.zoom, fitZoom);
  const zoom = Math.max(home.zoom, Math.min(want, cap));
  return centerViewport(target, zoom, cw, ch);
}

/** The ambient Ken-Burns end shot — a modest zoom into the frame center. */
export function ambientViewport(frame: Rect, cw: number, ch: number, intensity = 1): Viewport {
  const home = fillViewport(frame, cw, ch);
  const mul = 1 + (PUSH.ambient - 1) * intensity;
  return centerViewport(frame, home.zoom * mul, cw, ch);
}
