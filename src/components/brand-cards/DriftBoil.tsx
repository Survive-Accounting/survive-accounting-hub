// THE DRIFT — a smooth, continuous alternative to the Boil, for illustrations only (2026-09-06,
// Lee: "the boiling animations are horrible for the illustrations... more flowy... suspended in
// space, in like a cloudy (subtle) or even foggy (subtle!) dream space... a light touch, not
// meant to be super noticeable"). The Boil is a discrete flipbook — a hard opacity cut between
// stacked states, chosen deliberately elsewhere so an OFFLINE render can pin one exact state
// (raster-boil.ts's own reasoning) — and that same hard cut is what reads as flicker at a
// glance. Drift is the opposite shape on purpose: ONE image, ONE continuous CSS animation
// (transform + opacity + a hair of blur), interpolated by the browser, never a state swap.
// Pinning it for an offline render is just as simple in this shape: the animation has no
// discrete states to choose between, so a pinned render is the plain image at rest — that rest
// pose already looks correct as a still frame, with no seam to hide.
import type { CSSProperties } from "react";

const CSS = `
@keyframes sa-drift { 0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.97; filter: blur(0px); } 50% { transform: translate(var(--driftX, 5px), var(--driftY, -7px)) scale(1.012); opacity: 1; filter: blur(0.4px); } }
.sa-drift-img { animation: sa-drift var(--driftSecs, 7s) ease-in-out infinite; will-change: transform, opacity, filter; }
.sa-drift-still .sa-drift-img { animation: none; transform: none; opacity: 1; filter: none; }
@media (prefers-reduced-motion: reduce) { .sa-drift-img { animation: none !important; transform: none; filter: none; } }`;

export interface DriftOptions {
  /** 0 = still, 1 = the house amount (the default), 2 = twice as far. The "dial." */
  intensity?: number;
  /** One loop's length in seconds — slower reads calmer, matching a scanning glance rather than
   *  drawing the eye on its own. */
  seconds?: number;
  /** A seed so two illustrations on one slide don't drift in lockstep. */
  seed?: number;
}

const DRIFT_DEFAULTS = { intensity: 1, seconds: 7, seed: 3 } as const;

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
  const secs = options?.seconds ?? DRIFT_DEFAULTS.seconds;
  const seed = options?.seed ?? DRIFT_DEFAULTS.seed;
  // Direction varies by seed so siblings don't move identically; magnitude scales with intensity.
  const angle = prng(seed) * Math.PI * 2;
  const driftX = (Math.cos(angle) * 5 * k).toFixed(2);
  const driftY = (Math.sin(angle) * 5 * k).toFixed(2);
  return (
    <span data-sa-illustration="" className={live && !pinned ? undefined : "sa-drift-still"}
      style={{ position: "relative", display: "block", width, height, overflow: "visible",
        ["--driftSecs" as string]: `${secs}s`, ["--driftX" as string]: `${driftX}px`, ["--driftY" as string]: `${driftY}px`, ...style }}>
      <style>{CSS}</style>
      <img src={src} alt={alt} className="sa-drift-img" decoding="sync" loading="eager" draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
    </span>
  );
}
