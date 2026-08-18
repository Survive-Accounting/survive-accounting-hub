// THE HERO GRAPHIC — the brand bolt, and nothing else.
//
// This file has a long history of subtraction, and Pass 8 finishes it. It has been, in order: an
// exam sheet with greeked question rows and answer bubbles; the same sheet plus a pencil across
// the bolt; then a bare navy card carrying a course code, a campus name, faint exam hints and a
// red check. Every pass removed something, and every pass the remaining pieces still competed with
// the mark. The honest reading of that sequence is that the composition never needed a scene — the
// bolt IS the graphic, and everything drawn around it was scenery for a story the headline already
// tells ("Cram what's on your exam.").
//
// What that deletion also buys, which is the actual reason for it: the hero no longer names a
// specific school in type. The card used to say "Cram for ACCY 201 / UNIVERSITY OF MISSISSIPPI",
// which is a precise claim that made a student from anywhere else feel like the wrong audience —
// the caption underneath existed largely to walk it back. The bolt still cycles school COLOURWAYS,
// so the graphic keeps its life and its local nod, without asserting anything a visitor has to be
// told to ignore.
import { useEffect, useState } from "react";

import { Bolt, BRAND_BLUE, BRAND_RED } from "@/components/canvas/brand";
import type { School } from "@/routes/landing";

/** One stop in the colour cycle. No text: the graphic draws colours, not claims. */
export type PaperStop = { id: string; c1: string; c2: string };

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

  useEffect(() => {
    if (reduce || stops.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % stops.length), DWELL_MS);
    return () => window.clearInterval(t);
  }, [reduce, stops.length]);

  // REDUCED MOTION GETS THE BRAND COLOURWAY, not stops[0]. Freezing on the first school would
  // leave one campus's colours permanently on the hero for those users — a quieter version of the
  // same "this page is for that school" problem the text had. Red/blue belongs to nobody.
  const stop = reduce ? { id: "brand", c1: BRAND_RED, c2: BRAND_BLUE } : (stops[i] ?? stops[0]);
  if (!stop) return null;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Cram Exam 1 Free"
      className={`sa-paper group relative block ${className ?? ""}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        ["--sa-bolt-1" as string]: stop.c1,
        ["--sa-bolt-2" as string]: stop.c2,
        ...style,
      }}
    >
      {/* keyline left at its default (BRAND_WHITE): the white outline is permanent on every
          colourway. An earlier pass passed keyline="" to drop it, which made dark colourways
          (Auburn navy, Florida blue) merge into the navy page. */}
      <span className="sa-paper-bolt" aria-hidden>
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
.sa-paper:hover { transform: scale(1.04); }
.sa-paper:focus-visible { outline: 3px solid var(--accent); outline-offset: 10px; border-radius: 14px; }

/* THE BOLT. With the card gone this is the whole graphic, so it sizes itself off the button rather
   than overhanging a sheet. The glow is kept low on purpose: the brief says illuminated, not
   flashy — and against a bare navy page there is no card edge left to hide a heavy one. */
.sa-paper-bolt {
  display: block;
  width: 100%;
  pointer-events: none;
  filter: drop-shadow(0 0 22px color-mix(in srgb, var(--sa-bolt-1) 42%, transparent))
          drop-shadow(0 10px 30px rgba(0,0,0,0.5));
  transition: filter 900ms ease;
}
.sa-paper:hover .sa-paper-bolt {
  filter: drop-shadow(0 0 32px color-mix(in srgb, var(--sa-bolt-1) 58%, transparent))
          drop-shadow(0 10px 34px rgba(0,0,0,0.55));
}
/* The bolt's own fills transition too, so a school change moves the whole mark at once. */
.sa-paper-bolt path { transition: fill 900ms ease; }

/* THE CAPTION — horizontal now. It used to be rotated -4deg to sit parallel to the tilted card and
   pulled up with a negative margin to close the gap that rotation opened. There is no card and no
   tilt any more, so both were left-over geometry: a line of type at an angle for no reason, which
   reads as a mistake rather than a flourish. */
.sa-paper-caption {
  margin-top: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .sa-paper, .sa-paper:hover { transform: none; }
  .sa-paper-bolt, .sa-paper-bolt path { transition: none; }
}
`;

/** Build the colour cycle from the SAME school list the picker uses.
 *
 *  Ole Miss, LSU and Tennessee lead (the brief's order); the rest follow in picker order.
 *
 *  NO codeVerified FILTER any more. The old version dropped every school without a verified course
 *  code, because the card PRINTED that code and inventing one would have put a fabricated fact on
 *  the landing page. The card no longer prints anything, so that filter would now be silently
 *  shrinking the colour cycle to enforce a rule about text that isn't rendered. Colours are not a
 *  claim; every school is in. */
const LEAD = ["ole-miss", "lsu", "tennessee"];
export function paperStops(schools: School[], boltFor: (id: string) => { c1: string; c2: string }): PaperStop[] {
  const rank = (id: string) => { const i = LEAD.indexOf(id); return i < 0 ? LEAD.length : i; };
  return schools
    .slice()
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((s) => ({ id: s.id, ...boltFor(s.id) }));
}
