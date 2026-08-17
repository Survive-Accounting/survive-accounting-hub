// THE HERO GRAPHIC — a quiet navy card, the brand bolt, and a pencil crossing it.
//
// PASS 6 removed the exam. Earlier versions drew answer bubbles and greeked question rows, on the
// theory that the composition should show the PROBLEM (an exam) being overpowered by the ANSWER
// (the bolt). In practice the rows and bubbles just made the card busy at hero size, and every
// pass since had been spent dulling them down — fainter strokes, fainter fills, a darker sheet —
// which is a long way of admitting they should not have been there. The card is now empty on
// purpose: two lines of type, and one mark.
//
// The mark is the bolt with a pencil across it: exam + energy, read in one glance. The bolt
// dominates and the pencil is deliberately small and flat — if the pencil ever competes, shrink it
// rather than restyling the bolt.
//
// The cycle names a real course at a real school, and the course code, the campus name and the
// bolt's colourway crossfade together so the graphic reads as "this is your exam", school by
// school.
import { useEffect, useState } from "react";

import { Bolt } from "@/components/canvas/brand";
import type { School } from "@/routes/landing";

/** One stop in the cycle. `code` is a VERIFIED course code — never a guess. */
export type PaperStop = { id: string; name: string; code: string; c1: string; c2: string };

/** ~4s per school, per the brief. */
const DWELL_MS = 4000;

export function ExamPaper({ stops, onActivate, className, style }: {
  stops: PaperStop[];
  onActivate: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [i, setI] = useState(0);
  const [reduce, setReduce] = useState(false);

  // Read in an effect, never during render: this route is server-rendered, and calling matchMedia
  // while rendering makes the server and a reduced-motion client disagree on the first paint.
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  // The card TEXT changes, which CSS keyframes cannot do — so this is a state tick, not an
  // animation loop: one setState every 4 seconds, and the crossfade itself is CSS.
  useEffect(() => {
    if (reduce || stops.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % stops.length), DWELL_MS);
    return () => window.clearInterval(t);
  }, [reduce, stops.length]);

  const stop = stops[reduce ? 0 : i] ?? stops[0];
  if (!stop) return null;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Cram Exam 1 Free"
      className={`sa-paper group relative block ${className ?? ""}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        // Both the mark and the campus line read these, so one state change moves every colour in
        // the composition at once and the light can never disagree with the object.
        ["--sa-bolt-1" as string]: stop.c1,
        ["--sa-bolt-2" as string]: stop.c2,
        ...style,
      }}
    >
      {/* THE CARD — one tilted, rounded panel. No rules, no rows, no bubbles. */}
      <svg viewBox="0 0 300 340" role="img" aria-hidden className="w-full sa-paper-sheet" style={{ overflow: "visible" }}>
        <g transform="rotate(-4 150 170)">
          <rect x="26" y="18" width="248" height="304" rx="12" fill="rgba(0,0,0,0.22)" />
          <rect x="22" y="14" width="248" height="304" rx="12" fill="#22304F" stroke="rgba(245,239,230,0.10)" strokeWidth="1" />

          {/* EXAM HINTS — behind the bolt, and deliberately almost subliminal. Pass 4 drew a full
              worksheet and it fought the mark; these are three text strokes and two bubble rows at
              a fraction of that opacity. They exist so the card reads as an EXAM at a glance, and
              nothing more. If they ever compete with the bolt, lower the opacity — do not redraw. */}
          <g opacity="0.5">
            {[124, 176, 228].map((y, n) => (
              <rect key={y} x="46" y={y} width={[150, 120, 138][n]} height="4" rx="2" fill="rgba(245,239,230,0.14)" />
            ))}
            {[150, 202].map((y) => (
              <g key={y}>
                {[0, 1, 2, 3].map((b) => (
                  <circle key={b} cx={52 + b * 22} cy={y} r="5.5" fill="none" stroke="rgba(245,239,230,0.13)" strokeWidth="1.4" />
                ))}
              </g>
            ))}
          </g>

          {/* THE GRADE. One red check, drawn with the same hand as the bolt — two strokes, round
              caps, slightly uneven so it reads as marked rather than printed. This is the whole
              reason the hints are there: an exam with a check on it is a PASSED exam. */}
          <path
            d="M196 232 L214 252 L252 196"
            fill="none"
            stroke="#CE1126"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        </g>
      </svg>

      {/* TOP-LEFT, TWO LINES. Line 1 is static neutral so it is legible against every colourway
          without any contrast gymnastics; line 2 is the one that carries the school. */}
      <span className="sa-paper-course" aria-hidden>
        <span key={stop.id} className="sa-paper-course-in">Cram for {stop.code}</span>
      </span>
      <span className="sa-paper-campus" aria-hidden>
        <span key={`c-${stop.id}`} className="sa-paper-course-in">{stop.name}</span>
      </span>

      {/* THE MARK — bolt (dominant) with the pencil crossing it. */}
      <span className="sa-paper-bolt" aria-hidden>
        {/* keyline left at its default (BRAND_WHITE): the white outline is permanent on every
            colourway. Pass 4 passed keyline="" to drop it, which made dark colourways (Auburn
            navy, Florida blue) merge into the navy page. */}
        <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
      </span>
    </button>
  );
}

// The PENCIL is gone (Pass 7). It was drawn to brand rules — flat shapes, the bolt's own white
// keyline — and it still read as clip art the moment it sat next to the real mark. A second
// illustrated object competing with the bolt is the problem; drawing it better was never going to
// fix that. What the card needed was CONTEXT behind the bolt, not company beside it.

/** Component-local stylesheet, injected once by the hero. It lives here rather than in styles.css
 *  because nothing else on the site reads it. */
export const EXAM_PAPER_CSS = `
.sa-paper {
  position: relative;
  display: block;
  cursor: pointer;
  border: 0;
  background: none;
  padding: 0;
  transition: transform 220ms cubic-bezier(.2,.8,.2,1);
}
.sa-paper:hover { transform: scale(1.02); }
.sa-paper:focus-visible { outline: 3px solid var(--accent); outline-offset: 8px; border-radius: 14px; }
.sa-paper-sheet { filter: drop-shadow(0 18px 40px rgba(0,0,0,0.45)); }

/* LINE 1 — "Cram for ACCY 201". Tilted onto the card to match its -4deg. */
.sa-paper-course {
  position: absolute;
  left: 12%;
  top: 11%;
  transform: rotate(-4deg);
  transform-origin: left center;
  font-family: 'Rubik', system-ui, sans-serif;
  font-size: clamp(13px, 4.2cqw, 19px);
  font-weight: 900;
  letter-spacing: 0.01em;
  white-space: nowrap;
  /* STATIC. Deliberately not var(--sa-bolt-1) — the code changes with the school but the colour
     never does, so this line is legible on every colourway with no contrast gymnastics. */
  color: rgba(245,239,230,0.96);
}
/* Re-keying the inner span on each school remounts it, so this runs as a crossfade-in. */
.sa-paper-course-in { display: inline-block; animation: sa-course-in 900ms ease; }
@keyframes sa-course-in { from { opacity: 0; } to { opacity: 1; } }

/* LINE 2 — the campus. Smaller and secondary, and the line that carries the school colour. */
.sa-paper-campus {
  position: absolute;
  left: 12%;
  top: 19.5%;
  transform: rotate(-4deg);
  transform-origin: left center;
  font-family: 'Rubik', system-ui, sans-serif;
  font-size: clamp(10px, 3.1cqw, 14px);
  font-weight: 900;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--sa-bolt-1);
  /* paint-order draws the dark stroke BEHIND the fill, so a light colourway (Vanderbilt gold,
     Tennessee white) keeps its true colour and simply gains a dark edge. Plain
     -webkit-text-stroke without paint-order would eat into the glyph instead. */
  -webkit-text-stroke: 3px rgba(10,16,30,0.85);
  paint-order: stroke fill;
  transition: color 900ms ease;
}

/* THE BOLT — deliberately taller than the card, so it overhangs top and bottom. The glow is kept
   low on purpose: the brief says illuminated, not flashy. */
.sa-paper-bolt {
  position: absolute;
  left: 50%;
  top: 52%;
  width: 46%;
  height: 122%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--sa-bolt-1) 45%, transparent))
          drop-shadow(0 6px 26px rgba(0,0,0,0.5));
  transition: filter 900ms ease;
}
.sa-paper:hover .sa-paper-bolt {
  filter: drop-shadow(0 0 26px color-mix(in srgb, var(--sa-bolt-1) 60%, transparent))
          drop-shadow(0 6px 30px rgba(0,0,0,0.55));
}
/* The bolt's own fills transition too, so a school change moves card accent and bolt together. */
.sa-paper-bolt path { transition: fill 900ms ease; }

/* THE CAPTION — tilted to the card's own -4deg and pulled tight under its bottom edge, so it
   reads as part of the composition rather than a line of page text that happens to sit below a
   picture. The card is rotated about its centre, so the caption has to be rotated the same way
   and nudged up; the negative margin is what closes the gap the rotation opens. */
.sa-paper-caption {
  transform: rotate(-4deg);
  transform-origin: center;
  margin-top: -10px;
}

@media (prefers-reduced-motion: reduce) {
  .sa-paper, .sa-paper:hover { transform: none; }
  .sa-paper-course-in { animation: none; }
  .sa-paper-campus, .sa-paper-bolt, .sa-paper-bolt path { transition: none; }
}
`;

/** Build the cycle from the SAME school list the picker uses.
 *
 *  Ole Miss, LSU and Tennessee lead (the brief's order); the rest follow in picker order. Schools
 *  with no VERIFIED course code are dropped rather than shown with an empty code — inventing
 *  "ACCY 201" for a campus that has not confirmed it would be a fabricated fact on the landing
 *  page. If nothing has a code yet the hero simply renders no graphic. */
const LEAD = ["ole-miss", "lsu", "tennessee"];
export function paperStops(schools: School[], boltFor: (id: string) => { c1: string; c2: string }): PaperStop[] {
  const rank = (id: string) => { const i = LEAD.indexOf(id); return i < 0 ? LEAD.length : i; };
  return schools
    .filter((s) => s.codeVerified && !!s.code)
    .slice()
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((s) => ({ id: s.id, name: s.name, code: s.code!, ...boltFor(s.id) }));
}
