// THE COLD OPEN — six variants, one component — and the campus banner.
//
// Lee (2026-09-03): "the goal of this intro is to show students that I work
// with a lot of campuses … much more like the actual bolt we use in branding
// … the bolt in the survive just be static white. The logo bolt is the one
// zooming … a slot machine that goes through all the course codes … the
// scroller is too nauseating, slower and randomized, always start with Ole
// Miss … let me add this banner at any time on future slides … Survive
// wordmark is the main focus here … give me 5 good variations … and a 6th
// with the animated bolt in the wordmark and a different background."
//
// Everything is CSS + SVG on the same BoltBoil the brand uses — no library,
// no build risk. Motion only while `live`; `progress` pins a frame for an
// offline renderer. The mix and geometry are decided in bolt-zoom.ts (tested).
import { useMemo } from "react";

import { BoltBoil, BRAND_BLUE, BRAND_CREAM, BRAND_RED, SurviveWordmark } from "./bolt-boil";
import {
  BANNER_SECONDS, SLOT_SECONDS, ZOOM, campusMix, campusText, driftDegrees, seededShuffle, zoomKeyframes, zoomLayers,
  type ZoomVariant,
} from "./bolt-zoom";

export type BoltZoomMode = "open" | "backdrop" | "knockout";
export const TAGLINE = "Cram what's on your exam.";
export const DOMAIN = "surviveaccounting.com";
const FONT = "'Rubik', system-ui, sans-serif";
const WHITE = "#FFFFFF";

function zoomCss(n: number, psych: number, slotN: number): string { return `
@keyframes sa-zoom { ${zoomKeyframes(n)} }
@keyframes sa-zoom-drift { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(${driftDegrees(psych)}deg); } }
@keyframes sa-zoom-banner { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes sa-zoom-slot { from { transform: translateY(0); } to { transform: translateY(-${(slotN - 1) * 100}%); } }
@keyframes sa-zoom-rain { from { transform: translateY(-20%) rotate(var(--r, 0deg)); } to { transform: translateY(120%) rotate(var(--r, 0deg)); } }
@keyframes sa-zoom-sway { 0%, 100% { margin-left: 0; } 50% { margin-left: var(--sway, 2%); } }
@keyframes sa-zoom-pulse { 0%, 100% { transform: scale(0.97) rotate(-1.5deg); } 50% { transform: scale(1.04) rotate(1.5deg); } }
@keyframes sa-zoom-ring { from { transform: scale(1); opacity: 0.5; } to { transform: scale(2.3); opacity: 0; } }
@keyframes sa-zoom-wall { from { transform: translate(0, 0); } to { transform: translate(-6%, -4%); } }
@keyframes sa-zoom-wall-lit { 0%, 6% { opacity: 1; text-shadow: 0 0 18px rgba(252,163,17,0.9); color: ${BRAND_CREAM}; } 12%, 100% { opacity: 0.22; text-shadow: none; color: ${BRAND_CREAM}; } }
@keyframes sa-zoom-flip { 0% { transform: rotateX(0deg); } 45% { transform: rotateX(-90deg); } 55% { transform: rotateX(90deg); } 100% { transform: rotateX(0deg); } }
@keyframes sa-zoom-aurora { 0%, 100% { transform: translate(-8%, -6%) scale(1); } 50% { transform: translate(8%, 6%) scale(1.15); } }
@keyframes sa-zoom-confetti { from { transform: rotate(0deg) translateX(var(--orbit, 30%)) rotate(0deg); } to { transform: rotate(360deg) translateX(var(--orbit, 30%)) rotate(-360deg); } }
.sa-zoom-layer { animation: sa-zoom ${ZOOM.period}s linear infinite; will-change: transform, opacity; }
.sa-zoom-drift { animation: sa-zoom-drift ${ZOOM.period * 3}s ease-in-out infinite; }
.sa-zoom-banner { animation: sa-zoom-banner ${BANNER_SECONDS}s linear infinite; }
.sa-zoom-slot { animation: sa-zoom-slot ${(slotN - 1) * SLOT_SECONDS}s steps(${Math.max(1, slotN - 1)}, end) infinite; }
.sa-zoom-rain { animation: sa-zoom-rain var(--dur, 14s) linear infinite, sa-zoom-sway 6s ease-in-out infinite; }
.sa-zoom-pulse { animation: sa-zoom-pulse 6s ease-in-out infinite; }
.sa-zoom-ring { animation: sa-zoom-ring 5s ease-out infinite; }
.sa-zoom-wall { animation: sa-zoom-wall 60s linear infinite alternate; }
.sa-zoom-wall-lit { animation: sa-zoom-wall-lit var(--cycle, 40s) linear infinite; }
.sa-zoom-flip { animation: sa-zoom-flip ${SLOT_SECONDS}s ease-in-out infinite; transform-style: preserve-3d; }
.sa-zoom-aurora { animation: sa-zoom-aurora 14s ease-in-out infinite; }
.sa-zoom-confetti { animation: sa-zoom-confetti var(--dur, 30s) linear infinite; }
@keyframes sa-zoom-sweep { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.sa-zoom-sweep { animation: sa-zoom-sweep 9s linear infinite alternate; }
.sa-zoom-still .sa-zoom-sweep { animation-play-state: paused; }
.sa-zoom-still .sa-zoom-layer, .sa-zoom-still .sa-zoom-drift, .sa-zoom-still .sa-zoom-banner, .sa-zoom-still .sa-zoom-slot, .sa-zoom-still .sa-zoom-rain, .sa-zoom-still .sa-zoom-pulse, .sa-zoom-still .sa-zoom-ring, .sa-zoom-still .sa-zoom-wall, .sa-zoom-still .sa-zoom-wall-lit, .sa-zoom-still .sa-zoom-flip, .sa-zoom-still .sa-zoom-aurora, .sa-zoom-still .sa-zoom-confetti { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .sa-zoom-layer, .sa-zoom-drift, .sa-zoom-banner, .sa-zoom-slot, .sa-zoom-rain, .sa-zoom-pulse, .sa-zoom-ring, .sa-zoom-wall, .sa-zoom-wall-lit, .sa-zoom-flip, .sa-zoom-aurora, .sa-zoom-confetti { animation: none; } }
`; }

/** THE CAMPUS BANNER — the slow, randomised Power Four strip. Reusable on any
 *  slide (Lee: "a useful repeatable thing, if I ever want to do an
 *  advertisement about expansion"). Height ≈ 3.6% of the frame. */
export function CampusBanner({ w, h, seed = 7, live = true, top }: { w: number; h: number; seed?: number; live?: boolean; top?: number }) {
  const items = useMemo(() => campusMix(undefined, seed), [seed]);
  const fs = Math.round(h * 0.0165);
  return (
    <div className={live ? undefined : "sa-zoom-still"} style={{ position: "absolute", left: 0, width: w, top: top ?? Math.round(h * 0.745), height: Math.round(h * 0.036), overflow: "hidden", pointerEvents: "none", borderTop: "1px solid rgba(245,239,230,0.16)", borderBottom: "1px solid rgba(245,239,230,0.16)", background: "rgba(0,0,0,0.38)", fontFamily: FONT }}>
      <div className="sa-zoom-banner" style={{ display: "flex", whiteSpace: "nowrap", alignItems: "center", height: "100%", width: "max-content" }}>
        {[0, 1].map((rep) => items.map((c, i) => (
          <span key={`${rep}-${i}`} style={{ color: BRAND_CREAM, fontWeight: 800, fontSize: fs, letterSpacing: "0.16em", textTransform: "uppercase", padding: `0 ${Math.round(h * 0.018)}px`, opacity: 0.88 }}>
            {campusText(c)}<span style={{ opacity: 0.35, marginLeft: Math.round(h * 0.018) }}>⚡</span>
          </span>
        )))}
      </div>
    </div>
  );
}

/** THE SLOT — one course code at a time rolling under the tagline. */
function CourseSlot({ h, items, live }: { h: number; items: { text: string }[]; live: boolean }) {
  const lh = Math.round(h * 0.03);
  return (
    <div style={{ height: lh, overflow: "hidden", fontFamily: FONT, fontWeight: 800, fontSize: Math.round(h * 0.02), letterSpacing: "0.18em", textTransform: "uppercase", color: BRAND_CREAM, opacity: 0.92 }}>
      <div className={live ? "sa-zoom-slot" : undefined}>
        {items.map((it, i) => <div key={i} style={{ height: lh, lineHeight: `${lh}px`, whiteSpace: "nowrap" }}>{it.text}</div>)}
      </div>
    </div>
  );
}

export function BoltZoom({ w, h, mode = "open", variant = "zoom", psych = 0.1, live = true, progress, banner = true, tagline = TAGLINE, domain = DOMAIN, seed = 7, style }: {
  /** The frame this fills, in px. */
  w: number; h: number;
  mode?: BoltZoomMode;
  variant?: ZoomVariant;
  /** 0 = brand colours at rest, 1 = full trip. Lee: 0.1. */
  psych?: number;
  /** false = frozen (the review stage, an authoring pane). */
  live?: boolean;
  /** 0..1 pins one moment of the loop — an offline renderer's frame. */
  progress?: number;
  /** The slow campus strip along the lower third (open mode). */
  banner?: boolean;
  tagline?: string;
  domain?: string;
  seed?: number;
  style?: React.CSSProperties;
}) {
  const layers = useMemo(() => zoomLayers(psych), [psych]);
  const mix = useMemo(() => campusMix(undefined, seed), [seed]);
  // The slot rolls through a couple of dozen, Ole Miss first, then loops.
  const slotItems = useMemo(() => [...mix.slice(0, 26), mix[0]].map((c) => ({ text: campusText(c) })), [mix]);
  const pinned = progress !== undefined;
  const still = !live || pinned;
  const boltH = Math.round(h * 0.42);
  const boil = 1.2;   // calmer than the brand's 0.5 s — the wordmark is the focus
  const dim = mode === "backdrop" ? 0.45 : 0.9;
  const delayAt = (sec: number) => (pinned ? `${(sec - progress! * ZOOM.period).toFixed(3)}s` : `${sec.toFixed(3)}s`);
  const seeded = useMemo(() => seededShuffle(Array.from({ length: 16 }, (_, i) => i), seed + 5), [seed]);

  // ---- backgrounds, one per variant ---------------------------------------
  const zoomStack = (
    <div className="sa-zoom-drift" style={{ position: "absolute", inset: 0, pointerEvents: "none", ...(pinned ? { animationDelay: `${(-progress! * ZOOM.period * 3).toFixed(3)}s` } : {}) }}>
      {layers.map((l) => (
        <div key={l.index} className="sa-zoom-layer" style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, animationDelay: delayAt(l.delaySec), transformOrigin: "center", opacity: 0 }}>
          {/* THE REAL BOLT — brand red, blue seam, cream keyline, its own way round. */}
          <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) rotate(${l.tiltDeg}deg)` }}>
            <BoltBoil height={boltH} opacity={dim} boilSeconds={boil} boilFrame={pinned ? Math.floor(progress! * 8 + l.index) : undefined} />
          </div>
        </div>
      ))}
    </div>
  );

  const rain = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {seeded.slice(0, 14).map((k, i) => {
        const size = Math.round(h * (0.05 + (k % 5) * 0.022));
        const x = 4 + ((k * 37) % 92);
        const dur = 11 + (k % 7) * 2.2;
        return (
          <div key={i} className="sa-zoom-rain" style={{ position: "absolute", left: `${x}%`, top: 0, ["--dur" as string]: `${dur}s`, ["--r" as string]: `${(k % 2 ? 1 : -1) * (6 + (k % 3) * 5)}deg`, ["--sway" as string]: `${(k % 3) - 1}%`, animationDelay: `${-((k * 1.7) % dur)}s, ${-(k % 6)}s`, opacity: 0.35 + (k % 4) * 0.13 }}>
            <BoltBoil height={size} boilSeconds={boil} boilFrame={pinned ? k : undefined} />
          </div>
        );
      })}
    </div>
  );

  const pulse = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center" }}>
      {[0, 1, 2].map((k) => (
        <div key={k} className="sa-zoom-ring" style={{ position: "absolute", animationDelay: `${-k * (5 / 3)}s`, opacity: 0 }}>
          <BoltBoil height={Math.round(h * 0.5)} red="transparent" blue="transparent" cream={k % 2 ? BRAND_BLUE : BRAND_RED} boilFrame={k} opacity={0.6} />
        </div>
      ))}
      <div className="sa-zoom-pulse" style={{ position: "absolute", opacity: 0.55 }}>
        <BoltBoil height={Math.round(h * 0.56)} boilSeconds={boil} boilFrame={pinned ? Math.floor(progress! * 8) : undefined} />
      </div>
    </div>
  );

  const wall = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div className="sa-zoom-wall" style={{ position: "absolute", left: "-6%", top: "-4%", width: "118%", display: "flex", flexWrap: "wrap", gap: `${Math.round(h * 0.012)}px ${Math.round(w * 0.03)}px`, fontFamily: FONT, fontWeight: 800, fontSize: Math.round(h * 0.019), letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1 }}>
        {mix.map((c, i) => (
          <span key={i} className="sa-zoom-wall-lit" style={{ ["--cycle" as string]: `${Math.max(12, mix.length * 0.55)}s`, animationDelay: `${-(mix.length - i) * 0.55}s`, opacity: 0.22, color: BRAND_CREAM, whiteSpace: "nowrap" }}>{campusText(c)}</span>
        ))}
      </div>
      <div style={{ position: "absolute", left: "5%", top: "3.5%" }}><BoltBoil height={Math.round(h * 0.06)} boilSeconds={boil} boilFrame={pinned ? 1 : undefined} /></div>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(0,0,0,0.15) 20%, rgba(0,0,0,0.75) 100%)" }} />
    </div>
  );

  const board = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", background: "radial-gradient(ellipse at 30% 20%, rgba(21,101,192,0.25), transparent 55%), radial-gradient(ellipse at 75% 80%, rgba(198,40,40,0.22), transparent 55%)" }}>
      {seeded.slice(0, 6).map((k, i) => (
        <div key={i} className="sa-zoom-rain" style={{ position: "absolute", left: `${8 + ((k * 53) % 84)}%`, top: 0, ["--dur" as string]: `${22 + (k % 5) * 4}s`, ["--r" as string]: `${(k % 2 ? 1 : -1) * 10}deg`, animationDelay: `${-((k * 3.1) % 22)}s, 0s`, opacity: 0.35 }}>
          <BoltBoil height={Math.round(h * 0.11)} red="transparent" blue="transparent" cream={k % 2 ? BRAND_RED : BRAND_BLUE} boilFrame={k} />
        </div>
      ))}
    </div>
  );

  const aurora = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div className="sa-zoom-aurora" style={{ position: "absolute", left: "-20%", top: "-10%", width: "90%", height: "60%", borderRadius: "50%", background: `radial-gradient(circle, ${BRAND_RED}66, transparent 65%)`, filter: "blur(40px)" }} />
      <div className="sa-zoom-aurora" style={{ position: "absolute", right: "-25%", bottom: "-5%", width: "95%", height: "60%", borderRadius: "50%", background: `radial-gradient(circle, ${BRAND_BLUE}66, transparent 65%)`, filter: "blur(44px)", animationDelay: "-7s" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
        {seeded.slice(0, 8).map((k, i) => (
          <div key={i} className="sa-zoom-confetti" style={{ position: "absolute", left: 0, top: 0, ["--orbit" as string]: `${Math.round(h * (0.22 + (k % 4) * 0.06))}px`, ["--dur" as string]: `${26 + (k % 5) * 6}s`, animationDelay: `${-(k * 4.3) % 26}s`, opacity: 0.55 }}>
            <BoltBoil height={Math.round(h * 0.035)} boilSeconds={boil} boilFrame={pinned ? k : undefined} />
          </div>
        ))}
      </div>
    </div>
  );

  const background = variant === "rain" ? rain : variant === "pulse" ? pulse : variant === "wall" ? wall : variant === "board" ? board : variant === "aurora" ? aurora : zoomStack;
  const liveBolt = variant === "aurora";

  // ---- the wordmark, firm --------------------------------------------------
  const wordSize = Math.round(h * 0.078);
  const word = liveBolt
    ? <SurviveWordmark size={wordSize} cream={WHITE} boilFrame={pinned ? Math.floor(progress! * 8) : undefined} />
    : <SurviveWordmark size={wordSize} cream={WHITE} red={WHITE} blue={WHITE} boltCream={WHITE} boilFrame={0} />;

  return (
    <div className={still ? "sa-zoom-still" : undefined} style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", fontFamily: FONT, ...style }}>
      <style>{zoomCss(layers.length, psych, slotItems.length)}</style>

      {mode === "knockout" ? (
        // THE SUMMARY SLIDE (Lee: "the concept still feels great. YOU come up
        // with a good animation to put in those letters … use each of your 6
        // as a reference point"): black stage, white letters up top, and
        // MULTIPLIED over them a dense brand-colour sweep — red, cream, blue
        // rolling through the letters — with the chosen variant's own motion
        // faintly inside it. Black stays black; only the letters carry colour.
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * 0.11), display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <SurviveWordmark size={wordSize} cream={WHITE} red={WHITE} blue={WHITE} boltCream={WHITE} boilFrame={0} />
          </div>
          <div style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", pointerEvents: "none" }}>
            <div className="sa-zoom-sweep" style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, ${BRAND_RED} 0%, ${BRAND_CREAM} 22%, ${BRAND_BLUE} 45%, ${BRAND_RED} 68%, ${BRAND_CREAM} 90%, ${BRAND_BLUE} 100%)`, backgroundSize: "300% 300%" }} />
            <div style={{ position: "absolute", inset: 0, opacity: 0.75 }}>{background}</div>
          </div>
        </>
      ) : background}

      {mode === "open" && (
        <>
          {/* the readability plate: a soft dark pool behind the centre, and a
              vignette so the wordmark is the first thing the eye lands on */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 32%, rgba(0,0,0,0) 55%), radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-58%)", display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.014), pointerEvents: "none", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.9)) drop-shadow(0 12px 40px rgba(0,0,0,0.7))" }}>
            {word}
            <div style={{ color: WHITE, fontWeight: 800, fontSize: Math.round(h * 0.027), letterSpacing: "0.01em", textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>{tagline}</div>
            <div style={{ color: BRAND_CREAM, opacity: 0.6, fontWeight: 700, fontSize: Math.round(h * 0.016), letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>{domain}</div>
            {variant !== "wall" && (
              <div style={{ marginTop: Math.round(h * 0.02) }}>
                {variant === "board"
                  ? <div className="sa-zoom-flip" style={{ fontFamily: FONT, fontWeight: 800, fontSize: Math.round(h * 0.024), letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND_CREAM, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(245,239,230,0.2)", borderRadius: 6, padding: `${Math.round(h * 0.006)}px ${Math.round(h * 0.02)}px` }}><CourseSlot h={h} items={slotItems} live={!still} /></div>
                  : <CourseSlot h={h} items={slotItems} live={!still} />}
              </div>
            )}
          </div>
          {banner && <CampusBanner w={w} h={h} seed={seed} live={!still} />}
        </>
      )}
    </div>
  );
}
