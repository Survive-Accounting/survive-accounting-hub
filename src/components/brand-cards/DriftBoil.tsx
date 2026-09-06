// THE DRIFT — a smooth, continuous alternative to the Boil, for illustrations only. The Boil is
// a discrete flipbook — a hard opacity cut between stacked states, chosen deliberately elsewhere
// so an OFFLINE render can pin one exact state (raster-boil.ts's own reasoning) — and that same
// hard cut is what reads as flicker at a glance. Drift is the opposite shape on purpose: ONE
// image, ONE continuous CSS animation, interpolated by the browser, never a state swap. Pinning
// it for an offline render is just as simple in this shape: the animation has no discrete states
// to choose between, so a pinned render is the plain image at rest — that rest pose already
// looks correct as a still frame, with no seam to hide.
//
// v2 (2026-09-06, Lee, relaying feedback from elsewhere): "there's like a drift animation on the
// illustration that is a bit distracting... it's swinging side to side... starting and stopping.
// We want more of a looped one... like they're breathing/floating, not traveling." v1 moved on
// BOTH axes plus a scale pulse plus a blur pulse — four things changing gave it a direction and
// a destination, which is exactly what kept catching the eye. v2 is ONE axis, straight up and
// down, nothing else: a pure vertical hover, no rotation, no side-to-side, no scale, no blur.
// Every illustration still gets its own seed so a page with two of them doesn't breathe in
// lockstep — now spent entirely on varying the LOOP LENGTH (4.2–5.2s) rather than a direction,
// since a shared duration across every picture on screen was the other thing making the motion
// read as one mechanical system instead of several separate, alive things.
import type { CSSProperties } from "react";

const CSS = `
@keyframes sa-drift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(var(--driftLift, -5px)); } }
.sa-drift-img { animation: sa-drift var(--driftSecs, 4.5s) ease-in-out infinite; will-change: transform; }
.sa-drift-still .sa-drift-img { animation: none; transform: none; }
@media (prefers-reduced-motion: reduce) { .sa-drift-img { animation: none !important; transform: none; } }`;

export interface DriftOptions {
  /** 0 = still, 1 = the house amount (the default, 5px of vertical travel), 2 = twice as far. */
  intensity?: number;
  /** A seed so illustrations on the same slide don't hover in lockstep — spent on the loop's
   *  length (4.2–5.2s), not a direction: there is only one direction now, straight up and down. */
  seed?: number;
}

const DRIFT_DEFAULTS = { intensity: 1, seed: 3 } as const;

function prng(seed: number): number {
  const a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  const t = Math.imul(a ^ (a >>> 15), 1 | a);
  return (((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0) / 4294967296;
}

/** `pinned` = an offline/static render — Drift has no discrete state to choose, so this is just
 *  the plain image at rest, which is already a correct-looking still. */
export function DriftBoil({ src, width, height, alt = "", live = true, pinned = false, options, style }: {
  src: string; width: number; height: number; alt?: string;
  live?: boolean;
  /** True for an offline/static render — no animation class, no CSS var jitter either. */
  pinned?: boolean;
  options?: DriftOptions;
  style?: CSSProperties;
}) {
  const k = Math.max(0, options?.intensity ?? DRIFT_DEFAULTS.intensity);
  const seed = options?.seed ?? DRIFT_DEFAULTS.seed;
  // 4.2–5.2s, picked by seed — slow enough to read as breathing, not travel; different enough
  // between siblings that the page never feels mechanically synchronized.
  const secs = (4.2 + prng(seed) * 1.0).toFixed(2);
  const lift = (-5 * k).toFixed(2);
  return (
    <span data-sa-illustration="" className={live && !pinned ? undefined : "sa-drift-still"}
      style={{ position: "relative", display: "block", width, height, overflow: "visible",
        ["--driftSecs" as string]: `${secs}s`, ["--driftLift" as string]: `${lift}px`, ...style }}>
      <style>{CSS}</style>
      <img src={src} alt={alt} className="sa-drift-img" decoding="sync" loading="eager" draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
    </span>
  );
}
