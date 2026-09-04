// THE BOLT ZOOM — the cold open, and the backdrop that follows it.
//
// Lee (2026-09-03): "an amazingly attention grabbing intro that draws eyes in
// and is like 3 seconds … the bolt the size of a phone and then the actual
// video is being zoomed in … inverted, pointing bottom left to top right …
// campus + course codes scrolling like a stock ticker, bolt changing colours …
// a bit over the top, but still classy. Survive white wordmark staying FIRM in
// the middle, and 'Cram what's on your exam.'" Then: "push the psych end only
// 10%, brand colours drifting, the whole Power Four … it keeps going until the
// opening summary slide, then cuts out … INVERSE the white so the same
// animation is now going over just the Survive."
//
// THREE MODES, one component:
//   open      — the full cold open: layers, ticker, the wordmark firm, tagline.
//   backdrop  — layers only, quieter, behind the intro card.
//   knockout  — black stage, the white wordmark up top, and the layers
//               multiplied over it so the motion lives INSIDE the letters.
// Pure CSS + SVG (the same BoltBoil as everywhere), no dependencies, motion
// only under .film-mode or when `live` is set; `progress` pins one frame for an
// offline renderer. Everything geometric is decided in bolt-zoom.ts (tested).
import { useMemo } from "react";

import { BoltBoil, BRAND_CREAM, SurviveWordmark } from "./bolt-boil";
import { ZOOM, driftDegrees, powerFourTicker, zoomKeyframes, zoomLayers } from "./bolt-zoom";

export type BoltZoomMode = "open" | "backdrop" | "knockout";

export const TAGLINE = "Cram what's on your exam.";

function zoomCss(n: number, psych: number): string { return `
@keyframes sa-zoom { ${zoomKeyframes(n)} }
@keyframes sa-zoom-drift { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(${driftDegrees(psych)}deg); } }
@keyframes sa-zoom-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.sa-zoom-layer { animation: sa-zoom ${ZOOM.period}s linear infinite; will-change: transform, opacity; }
.sa-zoom-drift { animation: sa-zoom-drift ${ZOOM.period * 3}s ease-in-out infinite; }
.sa-zoom-ticker { animation: sa-zoom-ticker 48s linear infinite; }
.sa-zoom-still .sa-zoom-layer, .sa-zoom-still .sa-zoom-drift, .sa-zoom-still .sa-zoom-ticker { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .sa-zoom-layer, .sa-zoom-drift, .sa-zoom-ticker { animation: none; } }
`; }

export function BoltZoom({ w, h, mode = "open", psych = 0.1, live = true, progress, ticker = true, tagline = TAGLINE, style }: {
  /** The frame this fills, in px. */
  w: number; h: number;
  mode?: BoltZoomMode;
  /** 0 = brand colours at rest, 1 = full trip. Lee: 0.1. */
  psych?: number;
  /** false = frozen (the review stage, an authoring pane). */
  live?: boolean;
  /** 0..1 pins one moment of the loop — an offline renderer's frame. */
  progress?: number;
  ticker?: boolean;
  tagline?: string;
  style?: React.CSSProperties;
}) {
  const layers = useMemo(() => zoomLayers(psych), [psych]);
  const items = useMemo(() => powerFourTicker(), []);
  const boltH = Math.round(h * 0.42);                       // "the size of a phone" at scale 1
  const dim = mode === "backdrop" ? 0.5 : 0.92;
  const pinned = progress !== undefined;
  const delayAt = (l: { delaySec: number }) => pinned ? `${(l.delaySec - progress! * ZOOM.period).toFixed(3)}s` : `${l.delaySec.toFixed(3)}s`;
  const still = !live || pinned;

  const layerStack = (
    <div className="sa-zoom-drift" style={{ position: "absolute", inset: 0, pointerEvents: "none", ...(pinned ? { animationDelay: `${(-progress! * ZOOM.period * 3).toFixed(3)}s` } : {}) }}>
      {layers.map((l) => (
        <div key={l.index} className="sa-zoom-layer" style={{
          position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
          animationDelay: delayAt(l),
          transformOrigin: "center", opacity: 0,
        }}>
          {/* INVERTED: the bolt is mirrored so it points bottom-left → top-right. */}
          <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) scaleX(-1) rotate(${l.tiltDeg}deg)` }}>
            <BoltBoil height={boltH} red={l.colour} blue={l.index % 3 === 1 ? BRAND_CREAM : l.colour} cream="none" opacity={dim} boilFrame={pinned ? Math.floor(progress! * 8 + l.index) : undefined} />
          </div>
        </div>
      ))}
    </div>
  );

  const wordSize = Math.round(h * 0.075);
  const word = (
    <SurviveWordmark size={wordSize} cream="#FFFFFF" boltCream="#FFFFFF" boilFrame={pinned ? Math.floor(progress! * 8) : undefined} />
  );

  return (
    <div className={still ? "sa-zoom-still" : undefined} style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", fontFamily: "'Rubik', system-ui, sans-serif", ...style }}>
      <style>{zoomCss(layers.length, psych)}</style>

      {mode === "knockout" ? (
        // THE KNOCKOUT: white letters on black, then the layers MULTIPLIED over
        // them — colour survives only where the letters are.
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * 0.11), display: "flex", justifyContent: "center", pointerEvents: "none" }}>{word}</div>
          <div style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", pointerEvents: "none" }}>{layerStack}</div>
        </>
      ) : (
        layerStack
      )}

      {mode === "open" && (
        <>
          {/* a soft vignette so the centre reads first */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)" }} />
          {/* THE WORDMARK, FIRM. Nothing moves it. */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-62%)", display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.018), pointerEvents: "none", filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.65))" }}>
            {word}
            <div style={{ color: BRAND_CREAM, fontWeight: 800, fontSize: Math.round(h * 0.026), letterSpacing: "0.02em", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>{tagline}</div>
          </div>
          {ticker && items.length > 0 && (
            // THE TICKER — above the caption band, below the wordmark; the list
            // twice so the scroll wraps without a seam.
            <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * 0.735), height: Math.round(h * 0.036), overflow: "hidden", pointerEvents: "none", borderTop: "1px solid rgba(245,239,230,0.18)", borderBottom: "1px solid rgba(245,239,230,0.18)", background: "rgba(0,0,0,0.35)" }}>
              <div className="sa-zoom-ticker" style={{ display: "flex", whiteSpace: "nowrap", alignItems: "center", height: "100%", width: "max-content", ...(pinned ? { animationDelay: `${(-progress! * 48).toFixed(2)}s` } : {}) }}>
                {[0, 1].map((rep) => items.map((t, i) => (
                  <span key={`${rep}-${i}`} style={{ color: BRAND_CREAM, fontWeight: 800, fontSize: Math.round(h * 0.017), letterSpacing: "0.16em", textTransform: "uppercase", padding: `0 ${Math.round(h * 0.02)}px`, opacity: 0.9 }}>
                    {t}<span style={{ opacity: 0.4, marginLeft: Math.round(h * 0.02) }}>⚡</span>
                  </span>
                )))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
