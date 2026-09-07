// CHAIN LIGHTNING — the outro's red CTA pill and the spotlight that hits it.
//
// Lee (2026-09-07): "The outro slide needs a big red CTA button that's composed nicely
// underneath the surviveaccounting.com … The button can have a hover effect and also a
// really badass spotlight effect, like where I'm hitting it with chain lightning or
// something. The bolt blasts chain lightning into the Button and it gets bigger and has
// like lightning pulsing through it. Make it exciting like oh this is what I want to
// cram with. This is legit, etc."
//
// Two pieces, one stylesheet:
//   · CtaButton — the pill. Breathes a soft red glow at rest (~3 s), lifts + brightens +
//     sheens once on hover, and when LIT grows 1.12 with an overshoot, flashes white-hot,
//     settles red-hot, and keeps a bright streak sweeping through it every 900 ms.
//   · ChainLightning — the SVG overlay: 2–4 jagged trunks from the wordmark's bolt into
//     the pill, cream-white cores in a sky-blue (super: gold) halo, drawn on in 140 ms and
//     flickering out over ~700 ms in 120 ms steps, each with forks; then small sparks
//     stand off the rim on their own clocks, and one thin tether keeps sparking. Geometry
//     in chain-lightning.ts (tested); this file only draws.
//
// CSS + SVG only — no library, no build risk (the rule since the globe broke the Vercel
// build). `still` freezes every animation at its lit end state: the Review preview shows
// the spotlight statically; a progress-pinned frame renders the same pixels every time.
// Un-lighting eases back over ~400 ms: the pill's transform/box-shadow transition, and
// the overlay stays mounted for the fade before it unmounts. Function declarations
// only — this is on the canvas render path (tdz-graph.test.ts).
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";

import { BRAND_CREAM } from "./bolt-boil";
import { ARC_BLUE, ARC_CORE, ARC_GOLD, CTA_RED, CTA_RED_DEEP, CTA_RED_LIT, chainBolts, edgeTicks, polyline, type Rect } from "./chain-lightning";

const DISPLAY_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";

/** The pill's rest glow, breathing. --halo-rgb is the arc colour (sky, or gold on the super). */
const CTA_CSS = `
@keyframes sa-cta-breathe {
  0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 0 22px 4px rgba(230,59,45,0.42), 0 0 64px 14px rgba(230,59,45,0.20); }
  50%      { box-shadow: 0 0 0 1px rgba(255,255,255,0.16), 0 0 34px 8px rgba(230,59,45,0.62), 0 0 96px 26px rgba(230,59,45,0.30); }
}
@keyframes sa-cta-sheen { from { transform: translateX(-110%); opacity: 1; } to { transform: translateX(110%); opacity: 1; } }
@keyframes sa-cta-impact {
  0%   { transform: scale(1); }
  55%  { transform: scale(1.17); }
  100% { transform: scale(1.12); }
}
@keyframes sa-cta-hot {
  0%   { box-shadow: 0 0 0 1px rgba(255,255,255,0.16), 0 0 34px 8px rgba(230,59,45,0.62), 0 0 96px 26px rgba(230,59,45,0.30); filter: brightness(1); }
  12%  { box-shadow: 0 0 0 5px rgba(255,255,255,0.95), 0 0 56px 22px rgba(255,255,255,0.90), 0 0 160px 60px rgba(var(--halo-rgb), 0.70); filter: brightness(1.9) saturate(0.6); }
  40%  { box-shadow: 0 0 0 3px rgba(255,255,255,0.55), 0 0 44px 14px rgba(255,200,190,0.80), 0 0 150px 50px rgba(var(--halo-rgb), 0.45); filter: brightness(1.35) saturate(0.9); }
  100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.35), 0 0 40px 10px rgba(230,59,45,0.85), 0 0 120px 34px rgba(230,59,45,0.45), 0 0 220px 70px rgba(var(--halo-rgb), 0.28); filter: brightness(1.12); }
}
@keyframes sa-cta-streak { from { transform: translateX(-110%); opacity: 1; } to { transform: translateX(110%); opacity: 1; } }
@keyframes sa-cta-label-hot { 0% { color: ${BRAND_CREAM}; text-shadow: none; } 12% { color: #FFFFFF; text-shadow: 0 0 18px rgba(255,255,255,0.95); } 100% { color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.45); } }
.sa-cta { position: relative; isolation: isolate; overflow: hidden; border: 0; cursor: pointer; user-select: none; -webkit-user-select: none; pointer-events: auto;
  --halo-rgb: 125,211,252;
  background: linear-gradient(180deg, ${CTA_RED_LIT} 0%, ${CTA_RED} 52%, ${CTA_RED_DEEP} 100%);
  transform: translateY(0) scale(1); transform-origin: 50% 50%;
  animation: sa-cta-breathe 3s ease-in-out infinite;
  transition: transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 400ms ease, filter 400ms ease; will-change: transform; }
.sa-cta::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; mix-blend-mode: screen;
  background: linear-gradient(105deg, transparent 0%, transparent 36%, rgba(255,255,255,0.22) 44%, rgba(255,255,255,0.78) 50%, rgba(255,255,255,0.22) 56%, transparent 64%, transparent 100%);
  transform: translateX(-110%); transition: opacity 400ms ease; }
.sa-cta-super { --halo-rgb: 252,163,17; }
/* LIT: the impact (a 200 ms beat after the strike leaves the bolt — the draw-on takes 140), white-hot → red-hot, the streak forever. */
.sa-cta-lit { transform: scale(1.12); animation: sa-cta-impact 620ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both, sa-cta-hot 1100ms ease-out 200ms both; }
.sa-cta-lit::after { opacity: 1; animation: sa-cta-streak 900ms linear infinite; animation-delay: 700ms; }
.sa-cta-lit .sa-cta-label { animation: sa-cta-label-hot 1100ms ease-out 200ms both; }
/* STILL (the Review preview, a pinned frame): no breathing, no impact, no streak — the lit END
   state held. Ordered after the lit rules and under the hover rules' specificity on purpose:
   hover (below) still lifts and sheens in the Review preview, which Lee asked for. */
.sa-cta-still { animation: none; box-shadow: 0 0 0 1px rgba(255,255,255,0.13), 0 0 28px 6px rgba(230,59,45,0.52), 0 0 80px 20px rgba(230,59,45,0.25); }
.sa-cta-still::after { animation: none; }
.sa-cta-still .sa-cta-label { animation: none; }
.sa-cta-still.sa-cta-lit { animation: none; box-shadow: 0 0 0 2px rgba(255,255,255,0.35), 0 0 40px 10px rgba(230,59,45,0.85), 0 0 120px 34px rgba(230,59,45,0.45), 0 0 220px 70px rgba(var(--halo-rgb), 0.28); filter: brightness(1.12); }
.sa-cta-still.sa-cta-lit .sa-cta-label { animation: none; color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.45); }
.sa-cta-still.sa-cta-lit::after { animation: none; opacity: 0; }
/* HOVER (Editor preview + the main film window): a 3 px lift, the glow up a notch, one sheen.
   Never while lit — the spotlight owns the pill then. */
.sa-cta:not(.sa-cta-lit):hover { transform: translateY(-3px) scale(1); box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 0 40px 10px rgba(230,59,45,0.75), 0 0 110px 30px rgba(230,59,45,0.36); animation: none; filter: brightness(1.08); }
.sa-cta:not(.sa-cta-lit):hover::after { animation: sa-cta-sheen 500ms ease-out 1 both; }
@media (prefers-reduced-motion: reduce) {
  .sa-cta, .sa-cta::after, .sa-cta .sa-cta-label { animation: none !important; }
  .sa-cta { box-shadow: 0 0 0 1px rgba(255,255,255,0.13), 0 0 28px 6px rgba(230,59,45,0.52), 0 0 80px 20px rgba(230,59,45,0.25); }
  .sa-cta:not(.sa-cta-lit):hover { transform: translateY(-3px) scale(1); }
  .sa-cta-lit { box-shadow: 0 0 0 2px rgba(255,255,255,0.35), 0 0 40px 10px rgba(230,59,45,0.85), 0 0 120px 34px rgba(230,59,45,0.45), 0 0 220px 70px rgba(var(--halo-rgb), 0.28); }
  .sa-cta-lit::after { opacity: 0; }
}
`;

/** The overlay's motion: draw-on, the 120 ms flicker, the rim sparks, the tether. */
const CL_CSS = `
@keyframes sa-cl-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes sa-cl-flicker {
  0%, 14%  { opacity: 1; }
  15%, 29% { opacity: 0.38; }
  30%, 44% { opacity: 1; }
  45%, 59% { opacity: 0.22; }
  60%, 74% { opacity: 0.88; }
  75%, 89% { opacity: 0.35; }
  90%, 100% { opacity: 0; }
}
@keyframes sa-cl-tick {
  0%       { opacity: 0; }
  10%, 21% { opacity: 0.95; }
  22%, 54% { opacity: 0; }
  55%, 62% { opacity: 0.6; }
  63%, 100% { opacity: 0; }
}
@keyframes sa-cl-tether {
  0%, 5%   { opacity: 0; }
  6%, 12%  { opacity: 0.34; }
  13%, 19% { opacity: 0.08; }
  20%, 26% { opacity: 0.28; }
  27%, 100% { opacity: 0; }
}
@keyframes sa-cl-fade-out { to { opacity: 0; } }
.sa-cl { pointer-events: none; }
.sa-cl-strike { opacity: 0; animation: sa-cl-flicker 700ms linear both; animation-delay: var(--d, 0ms); }
.sa-cl-bolt { stroke-linecap: round; stroke-linejoin: round; fill: none; stroke-dasharray: 1; stroke-dashoffset: 1; animation: sa-cl-draw 140ms linear both; animation-delay: var(--d, 0ms); }
.sa-cl-tick { opacity: 0; stroke-linecap: round; stroke-linejoin: round; fill: none; animation: sa-cl-tick var(--p, 900ms) linear infinite; animation-delay: var(--d, 0ms); }
.sa-cl-tether { opacity: 0; stroke-linecap: round; stroke-linejoin: round; fill: none; animation: sa-cl-tether 1300ms linear infinite; animation-delay: 760ms; }
.sa-cl-out { animation: sa-cl-fade-out 400ms ease both; }
/* STILL: the strike frozen mid-flash, the sparks all on, the tether off. */
.sa-cl-still .sa-cl-strike, .sa-cl-still .sa-cl-bolt, .sa-cl-still .sa-cl-tick, .sa-cl-still .sa-cl-tether { animation: none !important; }
.sa-cl-still .sa-cl-strike { opacity: 0.9; }
.sa-cl-still .sa-cl-bolt { stroke-dashoffset: 0; }
.sa-cl-still .sa-cl-tick { opacity: 0.7; }
.sa-cl-still .sa-cl-tether { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .sa-cl .sa-cl-strike, .sa-cl .sa-cl-bolt, .sa-cl .sa-cl-tick, .sa-cl .sa-cl-tether { animation: none !important; }
  .sa-cl .sa-cl-strike { opacity: 0.9; } .sa-cl .sa-cl-bolt { stroke-dashoffset: 0; } .sa-cl .sa-cl-tick { opacity: 0.7; } .sa-cl .sa-cl-tether { opacity: 0; }
}
`;

/** THE PILL. `lit`/`flamed` come from the outro (which gets them from the film's
 *  PreviewSpotContext); `still` freezes it at its end state; `onDown` is the spotlight
 *  gesture (ctrl+click / ctrl+shift+click on /film) — pointer-down capture, the same hook a
 *  detour line uses, so the click never has to reach a `<button>`. */
export function CtaButton({ label, font, h, padX, minW, lit = false, flamed = false, still = false, onDown, ref, style }: {
  label: ReactNode;
  /** the label's size, the pill's height, its side padding and minimum width — stage px (ctaLayout) */
  font: number; h: number; padX: number; minW: number;
  lit?: boolean; flamed?: boolean; still?: boolean;
  onDown?: (e: ReactPointerEvent) => void;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  const cls = ["sa-cta", lit ? "sa-cta-lit" : "", flamed ? "sa-cta-super" : "", still ? "sa-cta-still" : ""].filter(Boolean).join(" ");
  return (
    <div ref={ref} role="button" tabIndex={-1} className={cls} data-sa-cta="" onPointerDownCapture={onDown}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: h, minWidth: minW, padding: `0 ${padX}px`, borderRadius: h / 2, ...style }}>
      <style>{CTA_CSS}</style>
      <span className="sa-cta-label" style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: font, lineHeight: 1, letterSpacing: "0.035em", color: BRAND_CREAM, whiteSpace: "nowrap", transform: "translateY(0.06em)" }}>
        {label}
      </span>
    </div>
  );
}

/** THE STRIKE. Draws nothing until `active`; on un-lighting it fades over 400 ms before
 *  unmounting. `from` is the wordmark bolt's box, `to` the pill's, both in stage px
 *  relative to the stage the overlay fills (`w`×`h`). The super throws five trunks with
 *  four forks each in a gold halo; a regular spotlight three trunks, three forks, sky. */
export function ChainLightning({ active, flamed = false, still = false, from, to, w, h, seed = 7 }: {
  active: boolean; flamed?: boolean; still?: boolean;
  from: Rect | null; to: Rect | null;
  w: number; h: number;
  seed?: number;
}) {
  const [shown, setShown] = useState(active);
  useEffect(() => {
    if (active) { setShown(true); return; }
    if (still) { setShown(false); return; }
    const t = window.setTimeout(() => setShown(false), 400);
    return () => window.clearTimeout(t);
  }, [active, still]);
  const halo = flamed ? ARC_GOLD : ARC_BLUE;
  const geometry = useMemo(() => {
    if (!from || !to) return null;
    return {
      bolts: chainBolts(from, to, seed + (flamed ? 1000 : 0), flamed ? { bolts: 5, branches: 4, jag: 0.19 } : { bolts: 3, branches: 3 }),
      ticks: edgeTicks(to, seed, flamed ? 12 : 8),
    };
  }, [from, to, seed, flamed]);
  if (!shown || !geometry) return null;
  const { bolts, ticks } = geometry;
  const cls = ["sa-cl", still ? "sa-cl-still" : "", !active ? "sa-cl-out" : ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden
      style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "visible", pointerEvents: "none", zIndex: 4 }}>
      <style>{CL_CSS}</style>
      <defs>
        <filter id="sa-cl-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id="sa-cl-blur-sm" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" /></filter>
      </defs>
      {bolts.map((b, i) => {
        const trunk = polyline(b.path);
        const lines = [trunk, ...b.branches.map(polyline)];
        return (
          <g key={i} className="sa-cl-strike" style={{ ["--d" as string]: `${b.delayMs}ms` }}>
            {/* three strokes per line: a wide blurred halo, a tight halo, the cream-white core —
                the blur applied ONCE per group, not per line, so the super's fifty-odd
                polylines cost a handful of filters on the film window */}
            <g filter="url(#sa-cl-blur)">
              {lines.map((pts, j) => (
                <polyline key={`h${j}`} className="sa-cl-bolt" points={pts} pathLength={1} stroke={halo} strokeWidth={(j === 0 ? b.width : b.width * 0.6) * 5} strokeOpacity={0.55} />
              ))}
            </g>
            <g filter="url(#sa-cl-blur-sm)">
              {lines.map((pts, j) => (
                <polyline key={`m${j}`} className="sa-cl-bolt" points={pts} pathLength={1} stroke={halo} strokeWidth={(j === 0 ? b.width : b.width * 0.6) * 2.2} strokeOpacity={0.85} />
              ))}
            </g>
            {lines.map((pts, j) => (
              <polyline key={`c${j}`} className="sa-cl-bolt" points={pts} pathLength={1} stroke={ARC_CORE} strokeWidth={j === 0 ? b.width : b.width * 0.55} />
            ))}
          </g>
        );
      })}
      {/* THE TETHER — after the volley, the first trunk keeps sparking faintly, so the link
          from the bolt to the pill stays alive on camera for as long as it is lit. */}
      <polyline className="sa-cl-tether" points={polyline(bolts[0].path)} stroke={halo} strokeWidth={bolts[0].width * 1.6} filter="url(#sa-cl-blur-sm)" />
      <polyline className="sa-cl-tether" points={polyline(bolts[0].path)} stroke={ARC_CORE} strokeWidth={bolts[0].width * 0.45} />
      {/* THE RIM SPARKS — from the impact on (the volley's ~300 ms head start), each on its own clock. */}
      <g filter="url(#sa-cl-blur-sm)">
        {ticks.map((t, i) => (
          <polyline key={i} className="sa-cl-tick" points={polyline(t.pts)} stroke={halo} strokeWidth={5} strokeOpacity={0.6} style={{ ["--d" as string]: `${300 + t.delayMs}ms`, ["--p" as string]: `${t.periodMs}ms` }} />
        ))}
      </g>
      {ticks.map((t, i) => (
        <polyline key={i} className="sa-cl-tick" points={polyline(t.pts)} stroke={ARC_CORE} strokeWidth={2} style={{ ["--d" as string]: `${300 + t.delayMs}ms`, ["--p" as string]: `${t.periodMs}ms` }} />
      ))}
    </svg>
  );
}
