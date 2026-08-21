// THE ANIMATED HERO BOLT — the exact brand bolt, with school colours FLOWING upward through it.
//
// The bolt geometry is untouched: BOLT_OUTER / BOLT_RIGHT / BOLT_VIEWBOX imported straight from
// brand.tsx, never redrawn. What animates is the FILL: the outer silhouette is a clip mask, and
// inside it a doubled-height gradient sheet (c1→c2→c1→c2→c1, top half identical to bottom half)
// translates upward one half-height per cycle — so the loop is seamless by construction. The
// white keyline and the warm glow are drawn OUTSIDE the mask and never move: they are the
// identity anchor. The right-half split keeps the mark's signature depth as a static navy shade
// INSIDE the clip, so the flowing colour reads as the bolt's own two-tone, not a flat wash.
//
// NO TEXT INSIDE THE BOLT — ever. The PLATE below it ("for ACCY 201 · OLE MISS") carries the
// words, in the site's own display face, cross-fading in lockstep with the colour cycle.
//
// ROTATION (home): cycle every school in the list, continuously, ~5s each — the breadth IS the
// message. A single stop (campus page, or a returning visitor whose school the picker stored)
// pins from the first frame: one bolt, one campus, their colours.
//
// prefers-reduced-motion: the gradient freezes at its midpoint (colours + plate still shown),
// the flow animation never starts, and school rotation is skipped entirely. Everything animated
// is transform/opacity/colour — no layout properties.
import { useEffect, useId, useState } from "react";

import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX, BRAND_DISPLAY } from "@/components/canvas/brand";

export type BoltHeroStop = { id: string; c1: string; c2: string; name?: string; code?: string | null };

/** viewBox numbers, needed for the gradient sheet's user-space coordinates. */
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };

/** ~5s per school. The general hero cycles EVERY school in the list (66 today) continuously —
 *  a lap is ~5½ minutes, so no visit sees a repeat, and the breadth is the point. Campus and
 *  greek pages pass a single stop and never rotate. */
const DWELL_MS = 5000;

export function AnimatedBoltHero({ stops, onActivate, className, ariaLabel = "Cram Exam 1 Free" }: {
  stops: BoltHeroStop[];
  onActivate: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [i, setI] = useState(0);
  const [reduce, setReduce] = useState(false);

  // Read in an effect, never during render: this route is server-rendered, and calling matchMedia
  // while rendering makes the server and a reduced-motion client disagree on the first paint.
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  // Cycle through every stop, continuously. Reduced motion never starts the timer (stops[0]
  // stays); a single stop (campus/greek/stored school) never rotates.
  useEffect(() => {
    if (reduce || stops.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % stops.length), DWELL_MS);
    return () => window.clearInterval(t);
  }, [reduce, stops.length]);

  const stop = stops[i] ?? stops[0];
  if (!stop) return null;

  const clipId = `ab-clip-${uid}`;
  const gradId = `ab-grad-${uid}`;
  const plate = stop.code || stop.name;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={ariaLabel}
      className={`ab-hero group relative block ${className ?? ""}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        ["--ab-c1" as string]: stop.c1,
        ["--ab-c2" as string]: stop.c2,
      }}
    >
      <span className="ab-bolt" aria-hidden>
        <svg viewBox={BOLT_VIEWBOX} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id={clipId}><path d={BOLT_OUTER} /></clipPath>
            {/* Doubled-height sheet: the stop pattern has period h (half the sheet), so y∈[0,h]
                equals y∈[h,2h] and translating up by exactly one height is invisible — the seam
                cannot show. SOLID BANDS, not one long blend: each colour holds a wide plateau
                with a short blend zone between, so the school colours read as THEIR colours
                rather than a muddy mix of the two. */}
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1={VB.y} x2="0" y2={VB.y + VB.h * 2}>
              <stop offset="0" className="ab-stop-a" />
              <stop offset="0.14" className="ab-stop-a" />
              <stop offset="0.25" className="ab-stop-b" />
              <stop offset="0.39" className="ab-stop-b" />
              <stop offset="0.5" className="ab-stop-a" />
              <stop offset="0.64" className="ab-stop-a" />
              <stop offset="0.75" className="ab-stop-b" />
              <stop offset="0.89" className="ab-stop-b" />
              <stop offset="1" className="ab-stop-a" />
            </linearGradient>
          </defs>
          {/* THE KEYLINE GOES UNDER THE FILL — same trick as the brand Bolt's paint-order:
              stroke. A stroke straddles its path, so painting it first and letting the clipped
              gradient cover the inner half leaves ~3.5 units of visible white instead of the
              full 7 — the outline frames the colours instead of drowning them. */}
          <path d={BOLT_OUTER} fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
          {/* the flowing fill, clipped to the exact brand silhouette */}
          <g clipPath={`url(#${clipId})`}>
            <rect className="ab-flow" x={VB.x} y={VB.y} width={VB.w} height={VB.h * 2} fill={`url(#${gradId})`} />
            {/* the signature right-half split — a LIGHT static shade over the moving colour;
                heavier and it greys the school colours out of recognition */}
            <path d={BOLT_RIGHT} fill="#0A1020" opacity="0.22" />
          </g>
        </svg>
      </span>

      {/* THE PLATE — the words live here, never inside the bolt. Keyed on the school so a
          rotation tick re-runs the fade, in lockstep with the colour transition. */}
      {plate && (
        <span key={stop.id} className="ab-plate" style={{ fontFamily: BRAND_DISPLAY }}>
          <span className="ab-plate-for">for </span>
          {stop.code ? <span className="ab-plate-em">{stop.code}</span> : null}
          {stop.code && stop.name ? <span className="ab-plate-dot"> · </span> : null}
          {stop.name ? <span className="ab-plate-em">{stop.name.toUpperCase()}</span> : null}
        </span>
      )}
    </button>
  );
}

/** Component-local stylesheet, injected once by whichever hero mounts the bolt. Lives here
 *  because nothing else on the site reads it. */
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

/* Warm-white glow (~35%, ~30px) + a soft ground shadow — applied to the whole SVG, i.e. OUTSIDE
   the clip mask, so the glow never animates with the gradient. */
.ab-bolt {
  display: block;
  width: 100%;
  pointer-events: none;
  filter: drop-shadow(0 0 30px rgba(245, 239, 230, 0.35)) drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
  transition: filter 900ms ease;
}
.ab-hero:hover .ab-bolt {
  filter: drop-shadow(0 0 38px rgba(245, 239, 230, 0.5)) drop-shadow(0 10px 34px rgba(0, 0, 0, 0.55));
}

/* THE FLOW — up one half of the doubled sheet per cycle, then an invisible snap. transform only:
   GPU-composited, no layout work per frame. */
.ab-flow { animation: ab-flow-up 7s linear infinite; }
@keyframes ab-flow-up {
  from { transform: translateY(0); }
  to   { transform: translateY(-146.96px); }
}

/* School cross-fades ride on the gradient stops themselves. */
.ab-stop-a { stop-color: var(--ab-c1); transition: stop-color 900ms ease; }
.ab-stop-b { stop-color: var(--ab-c2); transition: stop-color 900ms ease; }

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
  /* Freeze the sheet at its MIDPOINT — a mid-transition c1→c2 blend, colours + plate intact. */
  .ab-flow { animation: none; transform: translateY(-73.48px); }
  .ab-stop-a, .ab-stop-b { transition: none; }
  .ab-plate { animation: none; }
}
`;
