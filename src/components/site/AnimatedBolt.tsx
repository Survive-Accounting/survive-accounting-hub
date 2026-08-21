// THE ANIMATED CAMPUS BOLT — two school-colour streams flowing upward forever inside the locked
// brand bolt, with one campus flowing into the next.
//
// THE SHAPE IS FIXED ARTWORK. BOLT_OUTER (silhouette), BOLT_RIGHT (the right interior — its edge
// IS the internal zigzag dividing line) and BOLT_VIEWBOX are imported from brand.tsx, untouched.
//
// THE MENTAL MODEL — a conveyor of horizontal BANDS:
//
//   * The bolt interior is split permanently by the dividing line. LEFT = primary colour,
//     RIGHT = secondary colour. They are two separately clipped layers (left clipped to the full
//     silhouette, right clipped to BOLT_RIGHT and painted on top), so the split is exactly the
//     brand geometry and the colours can never bleed across it.
//   * Both layers draw the SAME queue of bands, each band knowing its campus palette and a tone
//     (base / lighter / deeper — tonal depth of the SAME colour, never grey). Both layers share
//     one upward offset, so the two lanes move in lockstep as one system.
//   * The queue is a conveyor: every frame the offset grows; once it exceeds one band height the
//     top band is dropped, a new band is appended at the BOTTOM, and the offset wraps — the
//     content that was at slot k is now at slot k-1 at the identical pixel, so the loop is
//     seamless by construction. No fade, no restart, no easing that stalls.
//   * CAMPUS TRANSITION = changing which palette NEW bands are born with. The next campus enters
//     from the bottom, rides up with the stream, and the old campus exits the top. The plate
//     beneath the bolt names whichever campus owns the band at mid-height (the dominant one).
//
// ONLY the band queue is React state (it changes ~3×/s). The per-frame offset is written straight
// to the two <g> transforms from a requestAnimationFrame loop — no re-render per frame, and a
// transform write is compositor-cheap.
//
// prefers-reduced-motion: no loop, no rotation — a static two-colour bolt in the first campus.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX, BRAND_DISPLAY } from "@/components/canvas/brand";

export type BoltHeroStop = { id: string; c1: string; c2: string; name?: string; code?: string | null };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TUNING — every knob in one place. Units are SVG user units unless stated (the bolt is ~147
// units tall, so 30 units/s sweeps the whole bolt in ~5s).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** Upward flow speed, units per second. Higher = faster current AND a quicker campus hand-over
 *  (the transition IS the sweep: one bolt-height ÷ STREAM_SPEED ≈ 4.9s at 30). */
const STREAM_SPEED = 30;
/** Band height — stream DENSITY. Smaller = finer, busier ribbon; larger = broad calm bands. */
const BAND_H = 11;
/** How long new bands keep being born in one campus before the feed moves to the next, ms.
 *  Each campus is therefore dominant for roughly HOLD_MS, with the hand-over riding the sweep. */
const HOLD_MS = 5500;
/** Slight diagonal character of the bands (degrees of skewX). 0 = flat horizontal bands. */
const SKEW_DEG = -10;
/** Tonal depth inside each lane — mix ratios toward white / toward black for the light and deep
 *  tones. The base tone is the EXACT school colour. Raise for more visible ribboning; 0/0 = flat. */
const TONE_LIGHT = 0.16;
const TONE_DEEP = 0.12;
/** Tone sequence new bands cycle through (0 base, 1 light, 2 deep). */
const TONE_SEQ = [0, 1, 0, 2] as const;
/** White keyline width (brand Bolt uses 7; half of it shows because the fill paints over it). */
const KEYLINE = 7;
// Glow strength lives in ANIMATED_BOLT_CSS below (.ab-bolt filter) — see "GLOW".
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** viewBox numbers, needed for band placement. */
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };
/** Bands in the queue: enough to cover the bolt plus one above (exiting) and one below (entering). */
const BAND_COUNT = Math.ceil(VB.h / BAND_H) + 3;
/** Bands are drawn wider than the bolt so the skew never exposes an edge. */
const BAND_X = VB.x - 60, BAND_W = VB.w + 120;

type Band = { key: number; stop: BoltHeroStop; tone: 0 | 1 | 2 };

// ── colour helpers ─────────────────────────────────────────────────────────────────────────────
const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
/** Tone of a colour: 0 = exact, 1 = toward white, 2 = toward black. Non-hex input (a CSS var
 *  that could not be resolved) is returned untouched — flat colour beats a broken one. */
const shade = (color: string, tone: 0 | 1 | 2): string => {
  if (tone === 0) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const t = tone === 1 ? [255, 255, 255] : [0, 0, 0];
  const k = tone === 1 ? TONE_LIGHT : TONE_DEEP;
  return toHex(rgb[0] + (t[0] - rgb[0]) * k, rgb[1] + (t[1] - rgb[1]) * k, rgb[2] + (t[2] - rgb[2]) * k);
};

// ── the stream hook ────────────────────────────────────────────────────────────────────────────
/** Owns the band queue, the feed (which campus new bands are born into), and the per-frame
 *  offset. Returns the bands to draw and refs for the two lane groups the loop translates. */
function useBoltStream(stops: BoltHeroStop[], reduce: boolean) {
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const stopsKey = useMemo(() => stops.map((s) => s.id + ":" + s.c1 + ":" + s.c2).join("|"), [stops]);

  const seed = (s: BoltHeroStop): Band[] => Array.from({ length: BAND_COUNT }, (_, i) => ({ key: i, stop: s, tone: TONE_SEQ[i % TONE_SEQ.length] }));
  const [bands, setBands] = useState<Band[]>(() => seed(stops[0]));
  const leftRef = useRef<SVGGElement>(null);
  const rightRef = useRef<SVGGElement>(null);
  const offsetRef = useRef(0);

  // Apply the current offset to both lanes — also after every band shift, so the new DOM and the
  // wrapped offset land in the same paint.
  const paint = () => {
    const t = "translate(0 " + (-offsetRef.current) + ") skewX(" + SKEW_DEG + ")";
    leftRef.current?.setAttribute("transform", t);
    rightRef.current?.setAttribute("transform", t);
  };
  useLayoutEffect(paint);

  // A changed campus list (a picker choice, a page's campus resolving) reseeds instantly.
  useEffect(() => { setBands(seed(stopsRef.current[0])); offsetRef.current = 0; }, [stopsKey]);

  useEffect(() => {
    if (reduce) return;
    let raf = 0, last = performance.now(), feedIdx = 0, feedMs = 0, keyCounter = BAND_COUNT, toneCounter = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000; // clamp a background-tab gap so nothing leaps
      last = now;
      // feed rotation — only meaningful with 2+ campuses
      const list = stopsRef.current;
      if (list.length > 1) {
        feedMs += dt * 1000;
        if (feedMs >= HOLD_MS) { feedMs -= HOLD_MS; feedIdx = (feedIdx + 1) % list.length; }
      } else feedIdx = 0;
      offsetRef.current += STREAM_SPEED * dt;
      if (offsetRef.current >= BAND_H) {
        offsetRef.current -= BAND_H;
        const born: Band = { key: keyCounter++, stop: list[feedIdx] ?? list[0], tone: TONE_SEQ[toneCounter++ % TONE_SEQ.length] };
        setBands((b) => [...b.slice(1), born]);
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, stopsKey]);

  return { bands, leftRef, rightRef };
}

// ── the component ──────────────────────────────────────────────────────────────────────────────
export function AnimatedBoltHero({ stops, onActivate, className, ariaLabel = "Cram Exam 1 Free" }: {
  stops: BoltHeroStop[];
  /** Receives the DOMINANT campus at the moment of the click — on the rotating home hero,
   *  pressing the bolt while the plate says "ACCY 201 · OLE MISS" means "that one". */
  onActivate: (stop: BoltHeroStop) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [reduce, setReduce] = useState(false);
  // Read in an effect, never during render: this route is server-rendered, and calling matchMedia
  // while rendering makes the server and a reduced-motion client disagree on the first paint.
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  // Campus pages hand in CSS vars ("var(--sa-bolt-1)") so the bolt can never disagree with the
  // page's own colourway. Tones need literal hex, so resolve vars once from the bolt's own
  // computed style; until then (and on the server) the vars paint flat, which is still correct.
  const hostRef = useRef<HTMLButtonElement>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  useEffect(() => {
    const el = hostRef.current; if (!el) return;
    const cs = getComputedStyle(el);
    const next: Record<string, string> = {};
    for (const s of stops) for (const c of [s.c1, s.c2]) {
      const m = c.match(/^var\((--[\w-]+)\)$/);
      if (m) { const v = cs.getPropertyValue(m[1]).trim(); if (v) next[c] = v; }
    }
    if (Object.keys(next).length) setResolved((r) => ({ ...r, ...next }));
  }, [stops]);
  const lit = (c: string) => resolved[c] ?? c;

  const { bands, leftRef, rightRef } = useBoltStream(stops, reduce);
  if (!stops.length) return null;

  // The campus that owns the middle of the visible bolt is the one the plate names and the one
  // a click means. Index 0 sits above the top edge, so mid-height is ~(BAND_COUNT-1)/2.
  const dominant = (reduce ? stops[0] : bands[Math.floor((BAND_COUNT - 1) / 2)]?.stop) ?? stops[0];
  const plate = dominant.code || dominant.name;
  const clipAll = "ab-all-" + uid, clipRight = "ab-right-" + uid;

  const lane = (ref: React.RefObject<SVGGElement | null>, side: "c1" | "c2") => (
    <g ref={ref}>
      {bands.map((b, i) => (
        <rect key={b.key} x={BAND_X} y={VB.y - BAND_H + i * BAND_H} width={BAND_W} height={BAND_H + 0.5} fill={shade(lit(b.stop[side]), reduce ? 0 : b.tone)} />
      ))}
    </g>
  );

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={() => onActivate(dominant)}
      aria-label={ariaLabel}
      className={"ab-hero group relative block " + (className ?? "")}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="ab-bolt" aria-hidden>
        <svg viewBox={BOLT_VIEWBOX} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id={clipAll}><path d={BOLT_OUTER} /></clipPath>
            <clipPath id={clipRight}><path d={BOLT_RIGHT} /></clipPath>
          </defs>
          {/* KEYLINE UNDER THE FILL (the brand Bolt's paint-order:stroke): the lanes cover its inner
              half, so ~3.5 units of white frame the colours instead of drowning them. */}
          <path d={BOLT_OUTER} fill="none" stroke="#FFFFFF" strokeWidth={KEYLINE} strokeLinejoin="round" strokeLinecap="round" />
          {/* LEFT LANE — primary colour, clipped to the whole silhouette… */}
          <g clipPath={"url(#" + clipAll + ")"}>{lane(leftRef, "c1")}</g>
          {/* …RIGHT LANE — secondary colour, clipped to BOLT_RIGHT and painted on top, so the
              boundary between the two is EXACTLY the brand's internal dividing line. */}
          <g clipPath={"url(#" + clipRight + ")"}>{lane(rightRef, "c2")}</g>
        </svg>
      </span>

      {/* THE PLATE — the words live here, never inside the bolt. Keyed on the dominant campus so
          the hand-over re-runs the fade as the new colours take the middle of the bolt. */}
      {plate && (
        <span key={dominant.id} className="ab-plate" style={{ fontFamily: BRAND_DISPLAY }}>
          <span className="ab-plate-for">for </span>
          {dominant.code ? <span className="ab-plate-em">{dominant.code}</span> : null}
          {dominant.code && dominant.name ? <span className="ab-plate-dot"> · </span> : null}
          {dominant.name ? <span className="ab-plate-em">{dominant.name.toUpperCase()}</span> : null}
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

/* GLOW — neutral warm-white, outside the clip (it never moves with the stream). Tune the two
   numbers: blur radius (32px) and strength (0.42). Keep it a support, not a haze. */
.ab-bolt {
  display: block;
  width: 100%;
  pointer-events: none;
  filter: drop-shadow(0 0 32px rgba(245, 239, 230, 0.42)) drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
  transition: filter 900ms ease;
}
.ab-hero:hover .ab-bolt {
  filter: drop-shadow(0 0 40px rgba(245, 239, 230, 0.55)) drop-shadow(0 10px 34px rgba(0, 0, 0, 0.55));
}

/* THE PLATE. Small and restrained — the bolt is the hero object; the plate supports it. */
.ab-plate {
  margin-top: 16px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--brand-cream, #F5EFE6);
  white-space: nowrap;
  animation: ab-plate-in 500ms ease;
}
.ab-plate-for { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.55; text-transform: none; }
.ab-plate-em { opacity: 0.92; }
.ab-plate-dot { opacity: 0.45; }
@keyframes ab-plate-in { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .ab-hero, .ab-hero:hover { transform: none; }
  .ab-plate { animation: none; }
}
`;
