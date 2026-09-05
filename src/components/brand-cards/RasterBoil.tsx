// A bitmap that boils. Stacked copies of one <img>, each holding a state's transform, swapped
// by the same discrete opacity animation the bolt uses. `boilFrame` pins one state for the
// offline renderer (same contract as BoltBoil); `live=false` pauses; reduced motion shows the
// rest pose. Function declarations only (brand-cards is on the canvas render path).
import type { CSSProperties } from "react";

import { BOIL_SECONDS, rasterBoilStates, rasterBoilTransform, type RasterBoilOptions } from "./raster-boil";

const CSS = `
@keyframes sa-rboil { 0% { opacity: 1; } 24.99% { opacity: 1; } 25% { opacity: 0; } 100% { opacity: 0; } }
.sa-rboil-f { animation: sa-rboil var(--rboil, 0.5s) linear infinite; opacity: 0; }
.sa-rboil-still .sa-rboil-f { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .sa-rboil-f { animation: none !important; opacity: 0; }
  .sa-rboil-f:first-child { opacity: 1; }
}`;

export function RasterBoil({ src, width, height, alt = "", boilFrame, boilSeconds, live = true, options, style }: {
  src: string; width: number; height: number; alt?: string;
  /** A number pins ONE state (offline, deterministic); undefined = the CSS flipbook. */
  boilFrame?: number;
  boilSeconds?: number;
  live?: boolean;
  options?: RasterBoilOptions;
  style?: CSSProperties;
}) {
  const states = rasterBoilStates(options);
  const n = states.length;
  const pinned = boilFrame !== undefined ? ((Math.floor(boilFrame) % n) + n) % n : null;
  const secs = boilSeconds ?? BOIL_SECONDS.boil;
  const img = (i: number, cls?: string, delay?: string) => (
    <img key={i} src={src} alt={i === 0 ? alt : ""} aria-hidden={i !== 0} className={cls} decoding="sync" loading="eager" draggable={false}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", transform: rasterBoilTransform(states[i]), transformOrigin: "50% 50%",
        ...(delay ? { animationDelay: delay } : {}) }} />
  );
  return (
    <span className={live ? undefined : "sa-rboil-still"} data-sa-illustration="" style={{ position: "relative", display: "block", width, height, ["--rboil" as string]: `${secs}s`, ...style }}>
      <style>{CSS}</style>
      {pinned === null
        ? states.map((_, i) => img(i, "sa-rboil-f", `${(-(secs / n) * i).toFixed(3)}s`))
        : img(pinned)}
    </span>
  );
}
