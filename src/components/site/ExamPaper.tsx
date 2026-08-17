// THE HERO GRAPHIC — a plain multiple-choice exam with the brand bolt struck through it.
//
// The story is the composition: the bolt OVERPOWERS the exam. It overhangs the sheet top and
// bottom, and the paper underneath is deliberately dull — four faint rows, one inked bubble each.
// Nothing on the paper should compete for attention, because the paper is the problem and the
// bolt is the answer.
//
// PASS 4 changed two things from the first version. The bolt is now the REAL brand asset
// (`Bolt` from canvas/brand — the 13-point split bolt used by the wordmark and the player), not a
// hand-drawn approximation. And the cycle is no longer colour-only: the header names a real
// course at a real school, and the course code, its accent and the bolt's colourway crossfade
// together so the graphic reads as "this is your exam", school by school.
//
// DECORATIVE ONLY. The question rows are greeked strokes and the inked bubbles are chosen for
// rhythm, not correctness. A marketing prop carrying a real question and a real answer is exactly
// how an answer key ends up in a screenshot.
import { useEffect, useState } from "react";

import { Bolt } from "@/components/canvas/brand";
import type { School } from "@/routes/landing";

/** One stop in the cycle. `code` is a VERIFIED course code — never a guess. */
export type PaperStop = { id: string; name: string; code: string; c1: string; c2: string };

/** Greeked rows. Four, faint, one inked bubble each — see the note above about staying dull. */
const ROWS: { w: number; fill: number }[] = [
  { w: 92, fill: 2 },
  { w: 76, fill: 0 },
  { w: 86, fill: 3 },
  { w: 68, fill: 1 },
];
const BUBBLES = 4;

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

  // The header TEXT changes, which CSS keyframes cannot do — so this is a state tick, not an
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
        // Both the bolt and the header accent read these, so one state change moves every
        // colour in the composition at once and the light can never disagree with the object.
        ["--sa-bolt-1" as string]: stop.c1,
        ["--sa-bolt-2" as string]: stop.c2,
        ...style,
      }}
    >
      {/* THE SHEET */}
      <svg viewBox="0 0 300 340" role="img" aria-hidden className="w-full sa-paper-sheet" style={{ overflow: "visible" }}>
        <g transform="rotate(-4 150 170)">
          <rect x="26" y="18" width="248" height="304" rx="10" fill="rgba(0,0,0,0.22)" />
          {/* Navy-tinted, not cream: the paper is the PROBLEM in this composition and must not
                compete with the bolt. Still unmistakably a sheet — rounded, tilted, ruled. */}
          <rect x="22" y="14" width="248" height="304" rx="10" fill="#22304F" stroke="rgba(245,239,230,0.10)" strokeWidth="1" />

          {/* header rule only — the course line itself is HTML, so its text can crossfade */}
          <line x1="42" y1="62" x2="160" y2="62" stroke="rgba(245,239,230,0.20)" strokeWidth="1.2" />
          <line x1="172" y1="62" x2="250" y2="62" stroke="rgba(245,239,230,0.20)" strokeWidth="1.2" />

          {ROWS.map((r, n) => {
            const top = 96 + n * 52;
            return (
              <g key={n}>
                {/* fainter than Pass 3 — the paper must not compete with the bolt */}
                <rect x="42" y={top} width={(r.w / 100) * 200} height="4.5" rx="2.25" fill="rgba(245,239,230,0.20)" />
                <rect x="42" y={top + 10} width={(r.w / 100) * 128} height="4.5" rx="2.25" fill="rgba(245,239,230,0.13)" />
                {Array.from({ length: BUBBLES }, (_, b) => (
                  <circle
                    key={b}
                    cx={48 + b * 26}
                    cy={top + 29}
                    r="6"
                    fill={b === r.fill ? "#CE1126" : "none"}
                    stroke={b === r.fill ? "#CE1126" : "#DCE1E9"}
                    strokeWidth="1.4"
                  />
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {/* THE COURSE LINE — HTML rather than SVG <text> so the string can crossfade on key change.
          Positioned over the sheet's header area and tilted to match its -4deg. */}
      <span className="sa-paper-course" aria-hidden>
        <span key={stop.id} className="sa-paper-course-in">
          {stop.code} <span style={{ opacity: 0.55 }}>— EXAM 1</span>
        </span>
      </span>

      {/* BOTTOM-LEFT — this is the line that carries the school. Legibility is handled by a dark
          paint-order stroke rather than by picking "safe" colours: Vanderbilt gold and Tennessee
          white would both vanish on the tinted card otherwise, and dropping them from the cycle
          would mean the hero silently never shows those schools. */}
      <span className="sa-paper-campus" aria-hidden>
        <span key={`c-${stop.id}`} className="sa-paper-course-in">{stop.name}</span>
      </span>

      {/* THE BOLT — the real brand asset, overhanging the sheet top and bottom. */}
      <span className="sa-paper-bolt" aria-hidden>
        {/* keyline left at its default (BRAND_WHITE): the white outline is now permanent on every
            colourway. Pass 4 passed keyline="" to drop it, which made dark colourways (Auburn navy,
            Florida blue) merge into the navy page. */}
        <Bolt c1="var(--sa-bolt-1)" c2="var(--sa-bolt-2)" />
      </span>
    </button>
  );
}

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

/* The course line, tilted onto the sheet's header rule. */
.sa-paper-course {
  position: absolute;
  left: 13%;
  top: 11.5%;
  transform: rotate(-4deg);
  transform-origin: left center;
  font-family: 'Rubik', system-ui, sans-serif;
  font-size: clamp(9px, 2.6cqw, 12px);
  font-weight: 700;
  letter-spacing: 0.14em;
  white-space: nowrap;
  /* STATIC, deliberately not var(--sa-bolt-1): the code changes with the school but the colour
     never does, so this line is legible on every colourway with no contrast gymnastics. */
  color: rgba(245,239,230,0.92);
}
/* Re-keying the inner span on each school remounts it, so this runs as a crossfade-in. */
.sa-paper-course-in { display: inline-block; animation: sa-course-in 900ms ease; }
@keyframes sa-course-in { from { opacity: 0; } to { opacity: 1; } }

/* The campus name is where the school colour lives now. */
.sa-paper-campus {
  position: absolute;
  left: 13%;
  bottom: 12%;
  transform: rotate(-4deg);
  transform-origin: left center;
  font-family: 'Rubik', system-ui, sans-serif;
  font-size: clamp(11px, 3.4cqw, 15px);
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

/* THE BOLT — 1.5x the Pass 3 size and deliberately taller than the sheet, so it overhangs top
   and bottom. The glow is kept low on purpose: the brief says illuminated, not flashy. */
.sa-paper-bolt {
  position: absolute;
  left: 50%;
  top: 50%;
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
/* The bolt's own fills transition too, so a school change moves paper accent and bolt together. */
.sa-paper-bolt path { transition: fill 900ms ease; }

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
