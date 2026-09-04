// THE BRAND SLIDES — the cold open, the intro, the summary knockout, the bolt
// detour — and the campus banner. One component, one wordmark placement, so the
// wordmark never moves between slide one and slide two.
//
// Lee (2026-09-04): "Remove the backdrop bolts animated. It'll look better just
// pure black background and the animated bolt back on the I of survive.
// Scrolling ticker could stay … a bit bigger … Remove surviveaccounting.com on
// the intro, put the campuses ticker there … The glow effect you have in
// 'found on your exam' is spectacular, use that in the intro on the black
// background, HOWEVER bring the main animated bolt logo back into the SurvIve
// … Make the Survive stay in line between slides 1 and 2 … the glow can be a
// bit more focused on powder blue and subtle, only for Found on your exam,
// which needs Survive / Accounting and the accounting can share the glow."
//
// The six animated backgrounds from the second pass are NOT gone: they are the
// BOLT DETOUR (mode "bolt" — "just black backdrop and the bolt zoom animation,
// nothing else … a blank canvas to put things on") and they live on /branding
// (mode "gallery") to come back to.
//
// Everything is CSS + SVG on the same BoltBoil the brand uses — no library,
// no build risk. Motion only while `live`; `progress` pins a frame for an
// offline renderer. The mix and geometry are decided in bolt-zoom.ts (tested).
import { useEffect, useMemo, useRef } from "react";

import { Editable } from "./Editable";

import { BoltBoil, BRAND_BLUE, BRAND_CREAM, BRAND_RED, SurviveWordmark } from "./bolt-boil";
import {
  BANNER_SECONDS, ZOOM, campusMix, campusText, driftDegrees, seededShuffle, zoomKeyframes, zoomLayers,
  type ZoomVariant,
} from "./bolt-zoom";

/** open = slide 1 · intro = slide 2 · summary = the "found on your exam" knockout
 *  wordmark over the card · backdrop = a plain black stage (a frame's override)
 *  · bolt = the bolt detour (black + one of the six animations, nothing else)
 *  · gallery = the second-pass look, kept on /branding. "knockout" is the old
 *  name for summary and still resolves. */
export type BoltZoomMode = "open" | "intro" | "summary" | "knockout" | "backdrop" | "bolt" | "gallery";
export const TAGLINE = "Cram what's on your exam.";
export const DOMAIN = "surviveaccounting.com";
export const TUTOR = "Lee Ingram";
const FONT = "'Rubik', system-ui, sans-serif";
const HEAD_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";
const WHITE = "#FFFFFF";
const POWDER = "#B3E5FC";
const SKY = "#7DD3FC";

/** The quiet line under the wordmark block — "tutored by Lee Ingram", the domain. */
function QUIET(h: number): React.CSSProperties {
  return { color: "rgba(245,239,230,0.62)", fontWeight: 700, fontSize: Math.round(h * 0.019), letterSpacing: "0.02em" };
}

/** Where the wordmark sits on slides one and two — the SAME number for both, so
 *  a cut from the open to the intro leaves "survive" exactly where it was. */
export const WORDMARK_TOP = 0.36;
export const WORDMARK_SIZE = 0.078;

function zoomCss(n: number, psych: number): string { return `
@keyframes sa-zoom { ${zoomKeyframes(n)} }
@keyframes sa-zoom-drift { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(${driftDegrees(psych)}deg); } }
@keyframes sa-zoom-banner { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes sa-zoom-rain { from { transform: translateY(-20%) rotate(var(--r, 0deg)); } to { transform: translateY(120%) rotate(var(--r, 0deg)); } }
@keyframes sa-zoom-sway { 0%, 100% { margin-left: 0; } 50% { margin-left: var(--sway, 2%); } }
@keyframes sa-zoom-pulse { 0%, 100% { transform: scale(0.97) rotate(-1.5deg); } 50% { transform: scale(1.04) rotate(1.5deg); } }
@keyframes sa-zoom-ring { from { transform: scale(1); opacity: 0.5; } to { transform: scale(2.3); opacity: 0; } }
@keyframes sa-zoom-wall { from { transform: translate(0, 0); } to { transform: translate(-6%, -4%); } }
@keyframes sa-zoom-wall-lit { 0%, 6% { opacity: 1; text-shadow: 0 0 18px rgba(252,163,17,0.9); color: ${BRAND_CREAM}; } 12%, 100% { opacity: 0.22; text-shadow: none; color: ${BRAND_CREAM}; } }
@keyframes sa-zoom-aurora { 0%, 100% { transform: translate(-8%, -6%) scale(1); } 50% { transform: translate(8%, 6%) scale(1.15); } }
@keyframes sa-zoom-confetti { from { transform: rotate(0deg) translateX(var(--orbit, 30%)) rotate(0deg); } to { transform: rotate(360deg) translateX(var(--orbit, 30%)) rotate(-360deg); } }
@keyframes sa-zoom-sweep { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.sa-zoom-layer { animation: sa-zoom ${ZOOM.period}s linear infinite; will-change: transform, opacity; }
.sa-zoom-drift { animation: sa-zoom-drift ${ZOOM.period * 3}s ease-in-out infinite; }
.sa-zoom-banner { animation: sa-zoom-banner ${BANNER_SECONDS}s linear infinite; }
.sa-zoom-rain { animation: sa-zoom-rain var(--dur, 14s) linear infinite, sa-zoom-sway 6s ease-in-out infinite; }
.sa-zoom-pulse { animation: sa-zoom-pulse 6s ease-in-out infinite; }
.sa-zoom-ring { animation: sa-zoom-ring 5s ease-out infinite; }
.sa-zoom-wall { animation: sa-zoom-wall 60s linear infinite alternate; }
.sa-zoom-wall-lit { animation: sa-zoom-wall-lit var(--cycle, 40s) linear infinite; }
.sa-zoom-aurora { animation: sa-zoom-aurora 14s ease-in-out infinite; }
.sa-zoom-confetti { animation: sa-zoom-confetti var(--dur, 30s) linear infinite; }
.sa-zoom-sweep { animation: sa-zoom-sweep var(--sweep, 9s) linear infinite alternate; }
.sa-zoom-still .sa-zoom-layer, .sa-zoom-still .sa-zoom-drift, .sa-zoom-still .sa-zoom-banner, .sa-zoom-still .sa-zoom-rain, .sa-zoom-still .sa-zoom-pulse, .sa-zoom-still .sa-zoom-ring, .sa-zoom-still .sa-zoom-wall, .sa-zoom-still .sa-zoom-wall-lit, .sa-zoom-still .sa-zoom-aurora, .sa-zoom-still .sa-zoom-confetti, .sa-zoom-still .sa-zoom-sweep { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .sa-zoom-layer, .sa-zoom-drift, .sa-zoom-banner, .sa-zoom-rain, .sa-zoom-pulse, .sa-zoom-ring, .sa-zoom-wall, .sa-zoom-wall-lit, .sa-zoom-aurora, .sa-zoom-confetti, .sa-zoom-sweep { animation: none; } }
`; }

/** THE CAMPUS BANNER — the slow, randomised Power Four strip. Reusable on any
 *  slide (Lee: "a useful repeatable thing, if I ever want to do an
 *  advertisement about expansion"). Bigger since 2026-09-04 ("so easier to
 *  read"): ≈ 4.6% of the frame tall. */
const BANNER_CSS = `
@keyframes sa-zoom-banner { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.sa-zoom-banner { animation: sa-zoom-banner ${BANNER_SECONDS}s linear infinite; }
.sa-zoom-still .sa-zoom-banner { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .sa-zoom-banner { animation: none; } }
`;

/** One clock for every banner on the page: a strip that mounts later starts
 *  where the last one was, so the ticker reads as ONE strip running from
 *  slide one into slide two (Lee: "can the campus banner persist from #1 to
 *  #2 slide? so it actually has a chance to be seen"). Set in an effect, so
 *  the server and the first client paint agree. */
const BANNER_EPOCH = Date.now();

export function CampusBanner({ w, h, seed = 7, live = true, top }: { w: number; h: number; seed?: number; live?: boolean; top?: number }) {
  const items = useMemo(() => campusMix(undefined, seed), [seed]);
  const fs = Math.round(h * 0.021);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    el.style.animationDelay = `-${(Date.now() - BANNER_EPOCH) % (BANNER_SECONDS * 1000)}ms`;
  }, []);
  return (
    // The banner carries its own keyframes (2026-09-04: "course ticker isn't
    // working on the ads" — it only moved where BoltZoom's stylesheet happened
    // to be mounted). Duplicate declarations are harmless.
    <div className={live ? undefined : "sa-zoom-still"} style={{ position: "absolute", left: 0, width: w, top: top ?? Math.round(h * 0.745), height: Math.round(h * 0.046), overflow: "hidden", pointerEvents: "none", borderTop: "1px solid rgba(245,239,230,0.16)", borderBottom: "1px solid rgba(245,239,230,0.16)", background: "rgba(0,0,0,0.38)", fontFamily: FONT }}>
      <style>{BANNER_CSS}</style>
      <div ref={strip} className="sa-zoom-banner" style={{ display: "flex", whiteSpace: "nowrap", alignItems: "center", height: "100%", width: "max-content" }}>
        {[0, 1].map((rep) => items.map((c, i) => (
          <span key={`${rep}-${i}`} style={{ color: BRAND_CREAM, fontWeight: 800, fontSize: fs, letterSpacing: "0.16em", textTransform: "uppercase", padding: `0 ${Math.round(h * 0.022)}px`, opacity: 0.9 }}>
            {campusText(c)}<span style={{ opacity: 0.35, marginLeft: Math.round(h * 0.022) }}>⚡</span>
          </span>
        )))}
      </div>
    </div>
  );
}

/** THE GLOW WORDMARK — "survive" with the sweep INSIDE the letters (the effect
 *  Lee called spectacular on the summary slide), and the real, boiling brand
 *  bolt as the "i". Two palettes: brand (red · cream · blue rolling through)
 *  for the open and the intro; powder (white · powder blue, subtle) for the
 *  summary, which also carries "accounting" underneath in the same glow. The
 *  geometry is SurviveWordmark's, so it lines up with every other wordmark. */
const GLOW_CSS = `
@keyframes sa-zoom-sweep { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.sa-zoom-sweep { animation: sa-zoom-sweep var(--sweep, 9s) linear infinite alternate; }
.sa-zoom-still .sa-zoom-sweep { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .sa-zoom-sweep { animation: none; } }
`;

export function GlowWordmark({ size, palette = "powder", live = true, second, boilFrame }: {
  size: number; palette?: "brand" | "powder"; live?: boolean;
  /** A second line in the same glow — "accounting" on the summary slide. */
  second?: string;
  boilFrame?: number;
}) {
  const gradient = palette === "powder"
    ? `linear-gradient(115deg, ${WHITE} 0%, ${POWDER} 28%, ${SKY} 50%, ${WHITE} 72%, ${POWDER} 100%)`
    : `linear-gradient(115deg, ${BRAND_RED} 0%, ${BRAND_CREAM} 22%, ${BRAND_BLUE} 45%, ${BRAND_RED} 68%, ${BRAND_CREAM} 90%, ${BRAND_BLUE} 100%)`;
  const glow = palette === "powder"
    ? `drop-shadow(0 0 ${Math.round(size * 0.10)}px rgba(179,229,252,0.32))`
    : `drop-shadow(0 0 ${Math.round(size * 0.12)}px rgba(245,239,230,0.28))`;
  const ink: React.CSSProperties = {
    backgroundImage: gradient, backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
    ["--sweep" as string]: palette === "powder" ? "14s" : "9s",
  };
  return (
    <div className={live ? undefined : "sa-zoom-still"} style={{ display: "flex", flexDirection: "column", alignItems: "center", filter: glow, pointerEvents: "none" }}>
      {/* self-styled, so the glow moves on the ads and anywhere else BoltZoom's sheet is not mounted */}
      <style>{GLOW_CSS}</style>
      <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
        <span className="sa-zoom-sweep" style={ink}>surv</span>
        <BoltBoil height={size * 0.8} boilSeconds={1.2} boilFrame={boilFrame} style={{ marginLeft: size * -0.015, marginRight: size * 0.03, transform: `translate(${size * (-1 / 96)}px, ${size * 0.13}px) rotate(2deg)`, transformOrigin: "100% 51%" }} />
        <span className="sa-zoom-sweep" style={{ ...ink, animationDelay: "-2s" }}>ve</span>
      </span>
      {second && (
        <span className="sa-zoom-sweep" style={{ ...ink, fontFamily: HEAD_FONT, fontWeight: 800, fontSize: Math.round(size * 0.5), letterSpacing: "0.22em", textTransform: "uppercase", marginTop: Math.round(size * 0.12), animationDelay: "-4s" }}>{second}</span>
      )}
    </div>
  );
}

/** The lines a brand slide lets the Review stage edit. */
export interface BrandEdit { tagline?: string; topic?: string; tutorLine?: string; domain?: string }

export function BoltZoom({ w, h, mode = "open", variant = "zoom", psych = 0.1, live = true, progress, banner = true, tagline = TAGLINE, topic, tutor = TUTOR, tutorLine, domain = DOMAIN, onEdit, seed = 7, style }: {
  /** The frame this fills, in px. */
  w: number; h: number;
  mode?: BoltZoomMode;
  /** The bolt detour's / gallery's animation. */
  variant?: ZoomVariant;
  /** 0 = brand colours at rest, 1 = full trip. Lee: 0.1. */
  psych?: number;
  /** false = frozen (an authoring pane). */
  live?: boolean;
  /** 0..1 pins one moment of the loop — an offline renderer's frame. */
  progress?: number;
  /** The slow campus strip along the lower third (open mode). */
  banner?: boolean;
  tagline?: string;
  /** Slide two: the set Lee is about to cram, and who is tutoring it. */
  topic?: string;
  tutor?: string;
  /** The whole line under the topic; default "tutored by <tutor>". */
  tutorLine?: string;
  /** The quiet address line under the tagline / the tutor line. */
  domain?: string;
  /** The Review stage's click-to-edit — absent everywhere else. */
  onEdit?: (patch: BrandEdit) => void;
  seed?: number;
  style?: React.CSSProperties;
}) {
  const m: Exclude<BoltZoomMode, "knockout"> = mode === "knockout" ? "summary" : mode;
  const layers = useMemo(() => zoomLayers(psych), [psych]);
  const mix = useMemo(() => campusMix(undefined, seed), [seed]);
  const pinned = progress !== undefined;
  const still = !live || pinned;
  const boltH = Math.round(h * 0.42);
  const boil = 1.2;   // calmer than the brand's 0.5 s — the wordmark is the focus
  const dim = 0.9;
  const delayAt = (sec: number) => (pinned ? `${(sec - progress! * ZOOM.period).toFixed(3)}s` : `${sec.toFixed(3)}s`);
  const seeded = useMemo(() => seededShuffle(Array.from({ length: 16 }, (_, i) => i), seed + 5), [seed]);
  const wordSize = Math.round(h * WORDMARK_SIZE);
  const frame = pinned ? Math.floor(progress! * 8) : undefined;

  // ---- the six animations (bolt detour + gallery) -------------------------
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
        <BoltBoil height={Math.round(h * 0.56)} boilSeconds={boil} boilFrame={frame} />
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

  const animation = variant === "rain" ? rain : variant === "pulse" ? pulse : variant === "wall" ? wall : variant === "board" ? board : variant === "aurora" ? aurora : zoomStack;

  // ---- slides one and two share this block ---------------------------------
  const wordmarkBlock = (children?: React.ReactNode) => (
    <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * WORDMARK_TOP), display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.016), pointerEvents: "none" }}>
      {/* Lee (2026-09-04): "just have a subtle powder blue / white glowing
          animation on the Survive. It's very much too much going on" — so the
          powder glow, not the brand sweep, on slides one and two. */}
      <GlowWordmark size={wordSize} palette="powder" live={!still} boilFrame={frame} />
      {children}
    </div>
  );

  return (
    <div className={still ? "sa-zoom-still" : undefined} style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", fontFamily: FONT, ...style }}>
      <style>{zoomCss(layers.length, psych)}</style>

      {/* THE BOLT DETOUR and the gallery: black + one of the six, nothing else. */}
      {(m === "bolt" || m === "gallery") && animation}

      {m === "gallery" && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-58%)", display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(h * 0.014), pointerEvents: "none", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.9)) drop-shadow(0 12px 40px rgba(0,0,0,0.7))" }}>
          <SurviveWordmark size={wordSize} cream={WHITE} red={WHITE} blue={WHITE} boltCream={WHITE} boilFrame={0} />
          <div style={{ color: WHITE, fontWeight: 800, fontSize: Math.round(h * 0.027), letterSpacing: "0.01em", textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>{tagline}</div>
        </div>
      )}

      {/* SLIDE ONE — the cold open: the glow wordmark, the line, the ticker. */}
      {m === "open" && (
        <>
          {wordmarkBlock(
            <>
              <Editable value={tagline} onEdit={onEdit ? (v) => onEdit({ tagline: v }) : undefined} style={{ color: WHITE, fontWeight: 800, fontSize: Math.round(h * 0.027), letterSpacing: "0.01em", marginTop: Math.round(h * 0.004), textAlign: "center" }} />
              {/* the domain, back under the line — quiet, the "tutored by" style */}
              <Editable value={domain} onEdit={onEdit ? (v) => onEdit({ domain: v }) : undefined} style={{ ...QUIET(h), textAlign: "center" }} />
            </>,
          )}
          {banner && <CampusBanner w={w} h={h} seed={seed} live={!still} />}
        </>
      )}

      {/* SLIDE TWO — the intro: the SAME wordmark, in the same place, and the set. */}
      {m === "intro" && wordmarkBlock(
        <>
          <div style={{ width: Math.round(w * 0.56), height: 1, background: "rgba(245,239,230,0.28)", marginTop: Math.round(h * 0.006) }} />
          <Editable value={topic || "Set name"} onEdit={onEdit ? (v) => onEdit({ topic: v }) : undefined} multiline style={{ fontFamily: HEAD_FONT, fontWeight: 800, fontSize: Math.round(h * 0.042), lineHeight: 1.08, letterSpacing: "0.02em", textTransform: "uppercase", color: BRAND_CREAM, textAlign: "center", maxWidth: Math.round(w * 0.84), textWrap: "balance" as never }} />
          <Editable value={tutorLine ?? `tutored by ${tutor}`} onEdit={onEdit ? (v) => onEdit({ tutorLine: v }) : undefined} style={{ ...QUIET(h), textAlign: "center" }} />
          <Editable value={domain} onEdit={onEdit ? (v) => onEdit({ domain: v }) : undefined} style={{ ...QUIET(h), opacity: 0.75, marginTop: Math.round(h * -0.008), textAlign: "center" }} />
        </>,
      )}
      {/* THE TICKER CARRIES INTO SLIDE TWO (2026-09-04) — same strip, same phase. */}
      {m === "intro" && banner && <CampusBanner w={w} h={h} seed={seed} live={!still} />}

      {/* THE SUMMARY — "Survive / Accounting" up top in the powder glow; the
          FOUND ON YOUR EXAM card is drawn by the frame underneath. */}
      {m === "summary" && (
        <div style={{ position: "absolute", left: 0, right: 0, top: Math.round(h * 0.085), display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <GlowWordmark size={Math.round(wordSize * 0.92)} palette="powder" live={!still} second="accounting" boilFrame={frame} />
        </div>
      )}
    </div>
  );
}
