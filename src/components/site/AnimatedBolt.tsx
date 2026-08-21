// THE ANIMATED CAMPUS BOLT — a solid two-colour brand bolt that HOLDS on one campus, then the next
// campus's colours sweep UPWARD through it in one quick charge, then it holds again.
//
// THE SHAPE IS FIXED ARTWORK. BOLT_OUTER (silhouette), BOLT_RIGHT (the right interior — its edge
// IS the internal zigzag dividing line) and BOLT_VIEWBOX are imported from brand.tsx, untouched.
// One `d` — BOLT_OUTER — is used for the fill, the clip AND the white outline, so they cannot
// disagree by a pixel.
//
// THE MODEL — a state machine, not a conveyor:
//
//   HOLD (CAMPUS_HOLD_MS)  →  SWEEP (CAMPUS_TRANSITION_MS)  →  HOLD  →  …
//
//   * HOLD: the bolt is a static two-colour object. LEFT = primary, RIGHT = secondary, exact school
//     hex, full saturation. The only motion is a slow outer-glow breath.
//   * SWEEP: the NEXT campus is painted as a second, identical two-colour bolt sitting on top of the
//     current one, revealed through ONE mask — a tall gradient (transparent above, feathered
//     TRANSITION_FEATHER units, opaque below), slightly angled, that translates from below the
//     bolt to above it. Primary and secondary are two halves of one campus and share that mask,
//     so they always cross the bolt together. A narrow soft highlight rides the front.
//   * The plate (course · campus) switches at LABEL_SWITCH_PROGRESS of the sweep — when the new
//     campus visually owns most of the bolt — with a 100ms fade.
//
// The previous implementation (a queue of ~17 horizontal bands per lane, re-rendered ~3×/s and
// translated every frame) is GONE: it read as scan lines. Nothing here re-renders during a
// sweep except the one label switch; the sweep itself is two `transform` attribute writes per
// frame for 900ms, then nothing at all until the next hold ends.
//
// PAINT ORDER (top of the SVG = bottom of the stack):
//   1. glow (blurred silhouette, breathing)
//   2. CURRENT campus: primary over the whole silhouette, secondary over BOLT_RIGHT
//   3. NEXT campus: same two layers, both inside the sweep mask
//   4. transition-front highlight, inside the same mask motion
//   5. WHITE OUTLINE LAST — a stroke of BOLT_OUTER over everything
//
// SEAMS: the secondary is painted ON TOP of a full-silhouette primary (there is always colour under
// the divider) and carries a SEAM_OVERLAP stroke in its own colour, clipped to the silhouette, so
// anti-aliasing along the zigzag can never show navy through. The outline is centred on the
// silhouette edge, so half its width always overlaps the fill — no fill/outline gap is possible.
//
// prefers-reduced-motion: static on the first campus — no sweep, no breath, no label changes.
import { useEffect, useMemo, useRef, useState } from "react";

import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX, BRAND_DISPLAY } from "@/components/canvas/brand";

export type BoltHeroStop = { id: string; c1: string; c2: string; name?: string; code?: string | null };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TUNING — every knob in one place. Units are SVG user units (the bolt is ~147 tall) unless stated.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** How long one campus rests before the next one sweeps in. */
const CAMPUS_HOLD_MS = 4600;
/** Duration of the upward sweep. */
const CAMPUS_TRANSITION_MS = 900;
/** Pause after a sweep completes before the hold clock starts (lets the front highlight fade). */
const SETTLE_MS = 150;
/** Height of the soft band between "old campus" and "new campus" at the sweep front. */
const TRANSITION_FEATHER = 16;
/** Tilt of the sweep front, degrees. Negative = rises left-to-right, complementing the bolt's lean. */
const TRANSITION_ANGLE = -7;
/** Sweep easing — ease-in-out so the front accelerates out of the bottom and settles at the top. */
const TRANSITION_EASE = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** The plate switches campus at this fraction of the sweep (0.58 ≈ "new campus owns the bolt"). */
const LABEL_SWITCH_PROGRESS = 0.58;
/** Front highlight: height of the bright band and its peak opacity. Narrow, soft, not neon. */
const FRONT_HEIGHT = 10;
const FRONT_OPACITY = 0.55;
/** Outer glow: blur radius (user units), resting opacity, and the breath's swing + cycle. */
const GLOW_BLUR = 9;
const GLOW_STRENGTH = 0.34;
const GLOW_BREATH = 0.08;         // opacity swing, ±
const GLOW_BREATH_MS = 4000;
/** White outline: width centred on the silhouette edge (half overlaps the fill). Round joins
 *  match the brand Bolt's keyline. */
const OUTLINE_WIDTH = 6;
const OUTLINE_COLOR = "#FFFFFF";
/** Secondary-colour overlap across the internal divider (px at 1:1 — ~0.9 user units), so no
 *  anti-aliased seam can show the navy behind. Invisible by design. */
const SEAM_OVERLAP = 1.8;
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** viewBox numbers, needed to place the mask travel. */
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };
const CX = VB.x + VB.w / 2, CY = VB.y + VB.h / 2;
/** The mask rect is wider than the bolt so the tilt never exposes an edge, and the travel has
 *  margin beyond both ends so the bolt is fully hidden / fully shown at the extremes. */
const MASK_X = VB.x - 120, MASK_W = VB.w + 240, MASK_H = VB.h * 3;
const TRAVEL_MARGIN = 40;
const WIPE_START_Y = VB.y + VB.h + TRAVEL_MARGIN;          // gradient top sits below the bolt → nothing shown
const WIPE_END_Y = VB.y - TRANSITION_FEATHER - TRAVEL_MARGIN; // gradient top above the bolt → all shown

/** The sweep front's `transform` for a given eased progress. Rotation is about the bolt centre so
 *  the tilt stays symmetric; translation carries the feather edge from below to above. */
const wipeTransform = (p: number) => {
  const y = WIPE_START_Y + (WIPE_END_Y - WIPE_START_Y) * p;
  return `rotate(${TRANSITION_ANGLE} ${CX} ${CY}) translate(0 ${y})`;
};

type Phase = { cur: BoltHeroStop; next: BoltHeroStop | null; label: BoltHeroStop };

// ── the component ──────────────────────────────────────────────────────────────────────────────
export function AnimatedBoltHero({ stops, onActivate, className, ariaLabel = "Cram Exam 1 Free" }: {
  stops: BoltHeroStop[];
  /** Receives the campus the plate names at the moment of the click — on the rotating home hero,
   *  pressing the bolt while the plate says "ACCY 201 · OLE MISS" means "that one". */
  onActivate: (stop: BoltHeroStop) => void;
  className?: string;
  ariaLabel?: string;
}) {
  // IDS ARE DERIVED, NOT GENERATED. useId() produced different values on the server and the
  // client under the lazy route boundary and logged a hydration mismatch on every hero. The id
  // only has to be unique per bolt on one page, so it is built from what the bolt IS.
  const uid = useMemo(() => {
    const seed = `${ariaLabel}|${stops.map((s) => s.id).join(",")}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }, [ariaLabel, stops]);
  const id = (k: string) => `ab-${k}-${uid}`;

  const [reduce, setReduce] = useState(false);
  // Read in an effect, never during render: this route is server-rendered, and calling matchMedia
  // while rendering makes the server and a reduced-motion client disagree on the first paint.
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  const hostRef = useRef<HTMLButtonElement>(null);
  const wipeRef = useRef<SVGGElement>(null);   // the mask's gradient rect
  const frontRef = useRef<SVGGElement>(null);  // the highlight band (same motion)

  const stopsKey = useMemo(() => stops.map((s) => s.id + ":" + s.c1 + ":" + s.c2).join("|"), [stops]);
  const [phase, setPhase] = useState<Phase>(() => ({ cur: stops[0], next: null, label: stops[0] }));
  // A changed campus list (picker choice, page campus resolving) restarts on its first campus.
  useEffect(() => { setPhase({ cur: stops[0], next: null, label: stops[0] }); }, [stopsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── THE STATE MACHINE ──────────────────────────────────────────────────────────────────────
  // One timer during HOLD; one rAF loop during SWEEP that writes two transform attributes per
  // frame and nothing else. Three React updates per campus change (sweep start, label, sweep end).
  useEffect(() => {
    if (reduce || stops.length < 2) return;
    let timer = 0, raf = 0, alive = true, i = 0;
    const paint = (p: number) => {
      const t = wipeTransform(p);
      wipeRef.current?.setAttribute("transform", t);
      frontRef.current?.setAttribute("transform", t);
      if (frontRef.current) frontRef.current.style.opacity = String(p <= 0 || p >= 1 ? 0 : 1);
    };
    const hold = () => { timer = window.setTimeout(sweep, CAMPUS_HOLD_MS); };
    const sweep = () => {
      const from = stops[i % stops.length], to = stops[(i + 1) % stops.length];
      i += 1;
      paint(0);
      setPhase({ cur: from, next: to, label: from });
      let labelled = false;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!alive) return;
        const raw = Math.min(1, (now - t0) / CAMPUS_TRANSITION_MS);
        paint(TRANSITION_EASE(raw));
        if (!labelled && raw >= LABEL_SWITCH_PROGRESS) { labelled = true; setPhase((ph) => ({ ...ph, label: to })); }
        if (raw < 1) { raf = requestAnimationFrame(tick); return; }
        // Sweep complete: the next campus becomes the current one; the mask parks below the bolt.
        setPhase({ cur: to, next: null, label: to });
        paint(0);
        timer = window.setTimeout(hold, SETTLE_MS);
      };
      raf = requestAnimationFrame(tick);
    };
    paint(0);
    hold();
    return () => { alive = false; clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [reduce, stopsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stops.length) return null;
  const { cur, next, label } = phase;
  const plate = label.code || label.name;

  /** One campus = primary over the whole silhouette + secondary over BOLT_RIGHT, overlapping the
   *  divider by SEAM_OVERLAP in its own colour so the boundary is never a transparent line. */
  const campusLayers = (s: BoltHeroStop) => (
    <>
      <path d={BOLT_OUTER} fill={s.c1} />
      <g clipPath={`url(#${id("clip")})`}>
        <path d={BOLT_RIGHT} fill={s.c2} stroke={s.c2} strokeWidth={SEAM_OVERLAP} strokeLinejoin="round" />
      </g>
    </>
  );

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={() => onActivate(label)}
      aria-label={ariaLabel}
      className={"ab-hero group relative block " + (className ?? "")}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="ab-bolt" aria-hidden>
        <svg viewBox={BOLT_VIEWBOX} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* THE ONE SILHOUETTE: same `d` as the fill below and the outline at the end. */}
            <clipPath id={id("clip")}><path d={BOLT_OUTER} /></clipPath>
            <filter id={id("glow")} x="-40%" y="-30%" width="180%" height="160%">
              <feGaussianBlur stdDeviation={GLOW_BLUR} />
            </filter>
            {/* THE SWEEP MASK. userSpaceOnUse so the feather is in bolt units: transparent
                (black) above the front, TRANSITION_FEATHER units of ramp, opaque (white) below.
                The gradient pads, so everything below the ramp stays fully revealed. */}
            <linearGradient id={id("wipe-grad")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={TRANSITION_FEATHER}>
              <stop offset="0" stopColor="#000" />
              <stop offset="1" stopColor="#fff" />
            </linearGradient>
            <mask id={id("wipe")} maskUnits="userSpaceOnUse" x={MASK_X} y={VB.y - MASK_H} width={MASK_W} height={MASK_H * 3}>
              <g ref={wipeRef} transform={wipeTransform(0)}>
                <rect x={MASK_X} y={0} width={MASK_W} height={MASK_H} fill={`url(#${id("wipe-grad")})`} />
              </g>
            </mask>
            {/* The charge front: a narrow band that fades in and out vertically. */}
            <linearGradient id={id("front-grad")} gradientUnits="userSpaceOnUse" x1="0" y1={TRANSITION_FEATHER / 2 - FRONT_HEIGHT} x2="0" y2={TRANSITION_FEATHER / 2 + FRONT_HEIGHT}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity={FRONT_OPACITY} />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 1. GLOW — the silhouette itself, blurred, breathing behind everything. */}
          <path d={BOLT_OUTER} fill="#F5EFE6" filter={`url(#${id("glow")})`} className="ab-glow" style={{ opacity: GLOW_STRENGTH }} />

          {/* 2. CURRENT campus — a solid two-colour bolt. */}
          <g>{campusLayers(cur)}</g>

          {/* 3. NEXT campus — identical layers, revealed from the bottom by the ONE shared mask. */}
          {next && (
            <g mask={`url(#${id("wipe")})`}>{campusLayers(next)}</g>
          )}

          {/* 4. TRANSITION FRONT — rides the same transform as the mask, clipped to the bolt. */}
          {next && (
            <g clipPath={`url(#${id("clip")})`}>
              <g ref={frontRef} transform={wipeTransform(0)} style={{ opacity: 0, mixBlendMode: "screen" }}>
                <rect x={MASK_X} y={TRANSITION_FEATHER / 2 - FRONT_HEIGHT} width={MASK_W} height={FRONT_HEIGHT * 2} fill={`url(#${id("front-grad")})`} />
              </g>
            </g>
          )}

          {/* 5. WHITE OUTLINE LAST — the same `d`, stroked over every fill. */}
          <path d={BOLT_OUTER} fill="none" stroke={OUTLINE_COLOR} strokeWidth={OUTLINE_WIDTH} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </span>

      {/* THE PLATE — the words live here, never inside the bolt. Keyed on the labelled campus so
          the switch (at LABEL_SWITCH_PROGRESS of the sweep) re-runs the short fade. */}
      {plate && (
        <span key={label.id} className="ab-plate" style={{ fontFamily: BRAND_DISPLAY }}>
          <span className="ab-plate-for">for </span>
          {label.code ? <span className="ab-plate-em">{label.code}</span> : null}
          {label.code && label.name ? <span className="ab-plate-dot"> · </span> : null}
          {label.name ? <span className="ab-plate-em">{label.name.toUpperCase()}</span> : null}
        </span>
      )}
    </button>
  );
}

/** Spec name alias — same component. */
export const AnimatedCampusBolt = AnimatedBoltHero;

/** Component-local stylesheet, injected once by whichever hero mounts the bolt. */
export const ANIMATED_BOLT_CSS = `
.ab-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  border: 0;
  background: none;
  padding: 0;
  transition: transform 220ms cubic-bezier(.2,.8,.2,1);
}
.ab-hero:hover { transform: scale(1.04); }
.ab-hero:focus-visible { outline: 3px solid var(--accent); outline-offset: 10px; border-radius: 14px; }

/* The only shadow outside the SVG is the dark drop — the warm glow is the blurred silhouette
   inside the SVG (.ab-glow), so it is derived from the exact shape and can breathe on its own. */
.ab-bolt {
  display: block;
  width: 100%;
  pointer-events: none;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
}
/* GLOW BREATH — opacity only, ±GLOW_BREATH around GLOW_STRENGTH (values inlined from the TS
   constants: 0.34 ± 0.08 over 4s). Subtle by design: the colours must stay readable. */
.ab-glow { animation: ab-breathe ${GLOW_BREATH_MS}ms ease-in-out infinite; }
@keyframes ab-breathe {
  0%, 100% { opacity: ${(GLOW_STRENGTH - GLOW_BREATH).toFixed(2)}; }
  50% { opacity: ${(GLOW_STRENGTH + GLOW_BREATH).toFixed(2)}; }
}
.ab-hero:hover .ab-glow { animation-play-state: paused; opacity: ${(GLOW_STRENGTH + GLOW_BREATH + 0.1).toFixed(2)} !important; }

/* THE PLATE. Small and restrained — the bolt is the hero object; the plate supports it. */
.ab-plate {
  margin-top: 16px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--brand-cream, #F5EFE6);
  white-space: nowrap;
  animation: ab-plate-in 100ms ease-out;
}
.ab-plate-for { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.55; text-transform: none; }
.ab-plate-em { opacity: 0.92; }
.ab-plate-dot { opacity: 0.45; }
@keyframes ab-plate-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .ab-hero, .ab-hero:hover { transform: none; }
  .ab-plate { animation: none; }
  .ab-glow { animation: none; }
}
`;
