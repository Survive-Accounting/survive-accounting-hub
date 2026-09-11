// THE SURVIBES FRAME — the logo flips on. Drawn through PhoneFrame like every other slide.
//
// Prompt 4 of the Editor session brief (2026-09-11), matched to end-of-topic-frames.html:
// opens on the normal SurviveWordmark, large and centred; at ~0.7 s a white-blue flash, a big
// split red/blue bolt strikes in from above, the "ve" flips on its X axis and returns as "bes",
// the background lights red-left / blue-right with faint scanlines; then the wordmark glides to
// the top and the camera (the big rounded box on the left — the `left` spot) and a LARGE captions box (the rail's own
// survibes branch — layout.captionRailRect) take the frame. Props via the spacebar: a step pops
// a card over the top area (first: Luca Pacioli) while the wordmark shrinks to the corner and
// the camera to a small circle under the card (BlastOffCapture's step camera, SURVIBES_PROP_CAM).
//
// THE TAIL IS DOM TEXT — SurviveWordmark takes a `tail` node now, so "ve" is a span this frame
// owns and can rotate. The big wordmark and the corner wordmark are two marks that cross-fade
// (a transform to the corner would need the measured width; two marks need nothing).
//
// THE CLOCK runs on the film surface only (`live`), from the moment the slide arrives, on the
// mockup's milliseconds (survibes.ts). Everywhere else — the Editor stage, the thumbnails, the
// next-slide preview — and under prefers-reduced-motion it is the settled look, the camera
// alone. Captions are not drawn here: the burn puts them in the box later; the Review stage's
// dashed reservation shows the box.
//
// THE CAMERA ARRIVES WITH THE SETTLE. It is PhoneFrame's, not this frame's, so BlastOffCapture
// holds it off for the first SURVIBES_T.camIn ms (the settle plus the 700 ms glide) — otherwise
// the big box sits over the wordmark while it flips and while it glides up.
import { useContext, useEffect, useState } from "react";

import { BRAND_CREAM, BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";

import { watermarkSpot } from "./capture/webcam-spots";
import { FrameStepContext } from "./frame-step";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";
import { SURVIBES_T, lookAt, propAt, type SurvibesLook } from "./survibes";

const GOLD = "#FCA311";
const CARD = "#152241";
const CARD_EDGE = "#8A6A2A";
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const SURVIBES_CSS = `
@keyframes sa-sv-strike { 0% { opacity: 0; transform: translateY(-60px) scale(1.3); } 35% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes sa-sv-breathe { 0%, 100% { filter: drop-shadow(-5px 0 10px rgba(239,75,63,0.55)) drop-shadow(5px 0 12px rgba(46,134,222,0.6)); } 50% { filter: drop-shadow(-8px 0 22px rgba(239,75,63,0.9)) drop-shadow(8px 0 26px rgba(46,134,222,1)); } }
@keyframes sa-sv-flicker { 0%, 90%, 100% { opacity: 1; } 91% { opacity: 0.45; } 92% { opacity: 1; } 93.5% { opacity: 0.6; } 94.5% { opacity: 1; } }
@keyframes sa-sv-flash { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sa-sv-prop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
.sa-sv-strike { animation: sa-sv-strike 500ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }
.sa-sv-settled { animation: sa-sv-breathe 3200ms ease-in-out infinite, sa-sv-flicker 6000ms steps(1) infinite; }
.sa-sv-flash { animation: sa-sv-flash 500ms ease-out; }
.sa-sv-prop { animation: sa-sv-prop 450ms ${EASE} both; }
@media (prefers-reduced-motion: reduce) { .sa-sv-strike, .sa-sv-settled, .sa-sv-flash, .sa-sv-prop { animation: none; opacity: 1; transform: none; } }`;

function reducedMotion(): boolean {
  try { return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Milliseconds since mount, ticking until `until`; frozen at `until` when `still`. */
function useClock(until: number, still: boolean): number {
  const [ms, setMs] = useState(still ? until : 0);
  useEffect(() => {
    if (still) { setMs(until); return; }
    const t0 = Date.now();
    setMs(0);
    const id = window.setInterval(() => {
      const t = Date.now() - t0;
      setMs(t);
      if (t >= until) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [until, still]);
  return ms;
}

export function SurvibesFrame({ w, live = false }: { w: number; live?: boolean }) {
  const h = Math.round(w * 16 / 9);
  const k = w / 306;
  const film = useContext(FrameStepContext);
  const still = !live || reducedMotion();
  const ms = useClock(SURVIBES_T.settled, still);
  const look: SurvibesLook = lookAt(ms, still);
  // The prop: the film's step; at rest none (the settled look, the camera alone).
  const step = live && film ? film.step : undefined;
  const prop = propAt(step);
  const propUp = !!prop && look.settled;
  const wm = watermarkSpot(w);
  const bigSize = 34 * k;
  const move = `${SURVIBES_T.glide}ms ${EASE}`;
  return (
    <div data-sa-survibes="" style={{ position: "relative", width: w, height: h, background: "#000", overflow: "hidden", fontFamily: BRAND_FONT, color: BRAND_CREAM }}>
      <style>{SURVIBES_CSS}</style>
      {/* THE ROOM: red-left / blue-right, faint scanlines — lit from `lit`. */}
      <div style={{ position: "absolute", inset: 0, opacity: look.lit ? 1 : 0, transition: "opacity 900ms",
        background: "radial-gradient(55% 38% at 18% 36%, rgba(239,75,63,0.24), transparent 70%), radial-gradient(55% 42% at 86% 40%, rgba(46,134,222,0.30), transparent 70%), repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 4px)" }} />
      {/* THE BIG BOLT: strikes in from above, then breathes at the right; small, bottom-left, under a prop. */}
      <div className={look.strike ? "sa-sv-strike" : look.settled ? "sa-sv-settled" : undefined}
        style={{ position: "absolute", opacity: look.strike || look.settled ? 1 : 0,
          left: propUp ? Math.round(w * 0.34) : Math.round(w * 0.59), top: propUp ? Math.round(h * 0.47) : Math.round(h * 0.29),
          transition: `left ${move}, top ${move}, opacity 500ms` }}>
        <BoltBoil height={propUp ? Math.round(w * 0.18) : Math.round(w * 0.36)} boilSeconds={1.2} style={{ transition: `height ${move}, width ${move}` }} />
      </div>
      {/* THE BIG WORDMARK: centred and large before the flip, up top after; fades out for a prop. */}
      <div style={{ position: "absolute", left: 0, right: Math.round(w * 0.11), display: "flex", justifyContent: "center", pointerEvents: "none",
        top: look.settled ? Math.round(h * 0.12) : Math.round(h * 0.415), transform: look.settled ? "scale(1)" : "scale(1.25)", transformOrigin: "50% 0",
        opacity: propUp ? 0 : 1, transition: `top ${move}, transform ${move}, opacity 450ms`, perspective: 300 }}>
        <SurviveWordmark size={bigSize} boilSeconds={1.2}
          tail={<span style={{ display: "inline-block", transformOrigin: "50% 60%", transform: look.flipping ? "rotateX(90deg)" : "none", transition: "transform 160ms ease-in" }}>{look.tail}</span>} />
      </div>
      {/* THE CORNER WORDMARK: the small "survibes" mark, in for a prop — where the watermark lives. */}
      <div style={{ position: "absolute", left: wm.left, top: wm.top, opacity: propUp ? 1 : 0, transition: "opacity 450ms", pointerEvents: "none" }}>
        <SurviveWordmark size={wm.size} boilSeconds={1.2} tail="bes" />
      </div>
      {/* THE PROP CARD over the top area, popped in by the step. */}
      {propUp && prop && (
        <div key={prop.id + (step ?? "rest")} className={live ? "sa-sv-prop" : undefined}
          style={{ position: "absolute", left: Math.round(w * 0.05), top: Math.round(h * 0.12), width: Math.round(w * 0.79), boxSizing: "border-box", background: CARD, border: `${Math.max(1, 1.5 * k)}px solid ${CARD_EDGE}`, borderRadius: 12 * k, padding: `${10 * k}px ${12 * k}px ${11 * k}px` }}>
          <span style={{ display: "inline-block", fontWeight: 800, fontSize: 9.5 * k, lineHeight: 1, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, border: `1px solid rgba(252,163,17,0.45)`, background: "rgba(252,163,17,0.08)", borderRadius: 5 * k, padding: `${5 * k}px ${7 * k}px` }}>{prop.chip}</span>
          <div style={{ margin: `${7 * k}px 0 ${1 * k}px`, fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 19 * k, lineHeight: 1.1 }}>{prop.title}</div>
          <div style={{ fontSize: 10.5 * k, color: "#C9D1E3", whiteSpace: "nowrap" }}>{prop.who}</div>
          <ul style={{ margin: `${7 * k}px 0 0`, padding: 0, listStyle: "none", display: "grid", gap: 4 * k }}>
            {prop.timeline.map((t, i) => (
              <li key={t.when} style={{ display: "grid", gridTemplateColumns: `${54 * k}px 1fr`, gap: 5 * k, alignItems: "baseline", fontSize: 10.5 * k, lineHeight: 1.3, color: "#DBE1EE", whiteSpace: "nowrap" }}>
                <b style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 12 * k, color: i === prop.timeline.length - 1 ? BRAND_CREAM : GOLD }}>{t.when}</b>
                <span>{t.what}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* THE FLASH, on the strike. */}
      {look.flash && <div className="sa-sv-flash" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40, background: "radial-gradient(circle at 60% 45%, rgba(255,255,255,0.95), rgba(91,176,255,0.55) 38%, transparent 75%)" }} />}
    </div>
  );
}
