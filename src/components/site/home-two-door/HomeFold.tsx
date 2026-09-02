// THE TWO-DOOR CARDS (rebuilt p1/p4, 2026-09-01).
//
// Each card is a tall panel: a large ~112px icon, then the CTA, then a support line. No heading —
// the icon carries the meaning, the CTA names the action. The icons differ per door:
//   • Solo    — the full-colour Survive bolt, boiling (campus-tinted on a campus page).
//   • Chapter — three GREEK LETTERS as a group, campus-coloured, with the same boil + a glow pulse
//               (p4 §5). NOT a classical building (that read institutional/bank, the opposite of a
//               chapter) and NOT a house.
//
// This is HOME-scoped on purpose: the shared DoorCard (chapter promo / council / share surfaces)
// and its geometry test stay untouched.
import { useEffect, useId, useMemo, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";

/** The large icon size — bolt and Greek trio share this box for equal optical weight. */
export const SOLO_ICON_H = 112;

/** Solo's icon: the boiling, campus-tinted bolt. Colours come from --bolt-primary/secondary (set
 *  per campus by the page theme), falling back to the brand red/blue on the generic home. */
export function SoloBoltIcon() {
  return <BoltBoil height={SOLO_ICON_H} />;
}

// ── GREEK LETTERS ICON ──────────────────────────────────────────────────────────────────────────
// REAL chapter letters, cycling. The trios this used to rotate (ΦΔΣ, ΘΛΞ…) were invented for shape
// contrast, and read as decoration because that is what they were — no house anywhere has them.
// Real letters do the opposite: a student sees their own house go by, or their roommate's, and the
// card stops being a graphic and starts being about them. The run alternates sorority/fraternity
// and carries an NPHC chapter; see lib/greek-cycle for how it is built and why.
//
// Once we know the visitor's OWN chapter the cycle stops and the card simply wears their letters.

/** Chapter's icon: real chapter letters that boil and glow, cycling until we know your house. */
export function GreekLettersIcon({ pinned, cycle, frozen }: {
  /** The visitor's own chapter letters. Present → the rotation stops and this stays. */
  pinned?: string | null;
  /** The letters to rotate through. Campus-specific where we have the roster. */
  cycle: string[];
  /** ONE INVITATION AT A TIME. While the solo door's bolt is cycling campuses this holds still —
   *  two doors moving at once is not twice as inviting, it is noise. */
  frozen?: boolean;
}) {
  // Stable, page-unique filter id (hashed, not useId(), to dodge the hydration-mismatch the hero
  // boundary caused elsewhere — see AnimatedCampusBolt).
  const rawId = useId();
  const uid = useMemo(() => { let h = 0; for (let i = 0; i < rawId.length; i++) h = (h * 31 + rawId.charCodeAt(i)) >>> 0; return h.toString(36); }, [rawId]);
  const fid = `greek-boil-${uid}`;

  // reduced-motion read in an effect (SSR-safe first paint), same as the bolt conveyor.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);

  const run = cycle.length ? cycle : [""];
  const pin = pinned?.trim() || null;
  // DISSOLVE THROUGH, never cross-fade. Two houses fading past each other put ΧΩ on top of ΣΑΕ for
  // a quarter of every cycle, and two different words at the same centre read as a smudge rather
  // than as letters. One layer: fade out, swap, fade back in.
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    if (reduced || pin || frozen || run.length < 2) return;
    let swap = 0;
    const tick = window.setInterval(() => {
      setVis(false);
      swap = window.setTimeout(() => { setIdx((i) => (i + 1) % run.length); setVis(true); }, 230);
    }, 2100);
    return () => { window.clearInterval(tick); window.clearTimeout(swap); };
  }, [reduced, pin, frozen, run.length]);

  // The run can shrink under a live index (campus switch), so wrap rather than render undefined.
  const word = pin ?? run[idx % run.length] ?? "";

  // CREAM, not campus-tinted: school colours belong to the campus; chapter letters belong to
  // chapters, and tinting them in school colours implies the chapter IS the school.
  const color = "var(--brand-cream, #F5EFE6)";
  // CAP HEIGHT, NOT FONT SIZE (icon-alignment prompt §3). Type carries empty space above the cap
  // and below the baseline inside its em box, so a font-size picked to "look like" the bolt's
  // height always undershoots — the glyphs come out smaller than the bolt and, because the extra
  // space is not symmetric, sitting higher than it too. Rubik's cap height is ~0.72em, so the size
  // is derived from the cap height we actually want and the glyphs are centred on the box's middle
  // (dominant-baseline central) rather than sitting on a baseline guessed by eye.
  const CAP_RATIO = 0.72;
  // The bolt fills its 112px slot; the letters read as its equal at ~78% of that, because a solid
  // silhouette carries more weight than three outlined glyphs of identical height.
  const TARGET_CAP = 58;                       // viewBox units, box is 100
  const FONT = Math.round(TARGET_CAP / CAP_RATIO);
  // Three glyphs at that size overrun 100 units, so the trio is squeezed to fit horizontally —
  // vertical size is what the eye compares, and textLength preserves it while fitting the width.
  const sizeFor = (w: string) => { const n = [...w].length; return n <= 2 ? FONT : n === 3 ? Math.round(FONT * 0.82) : Math.round(FONT * 0.62); };
  const textProps = (w: string) => ({
    textAnchor: "middle" as const, dominantBaseline: "central" as const, x: 50, y: 52,
    fontSize: sizeFor(w), letterSpacing: [...w].length >= 3 ? 0 : 2,
    style: { fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 800 } as React.CSSProperties,
  });

  return (
    <span aria-hidden style={{ display: "inline-block", width: SOLO_ICON_H * 1.05, height: SOLO_ICON_H }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        {!reduced && (
          <defs>
            {/* The BOIL (feTurbulence + displacement, seed cycled discretely like the bolt's flipbook)
                and a slow GLOW pulse. Unique id per instance. */}
            <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
              <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="1" seed="2" result="noise">
                <animate attributeName="seed" values="2;6;9;4;2" dur="0.9s" calcMode="discrete" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" result="wob" />
              <feGaussianBlur in="wob" stdDeviation="1.2" result="glow">
                <animate attributeName="stdDeviation" values="0.8;2.8;0.8" dur="3.4s" repeatCount="indefinite" />
              </feGaussianBlur>
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="wob" />
              </feMerge>
            </filter>
          </defs>
        )}
        <g fill={color} filter={reduced ? undefined : `url(#${fid})`}>
          {reduced || pin || frozen ? (
            <text {...textProps(word)}>{word}</text>
          ) : (
            <text {...textProps(word)} style={{ ...textProps(word).style, opacity: vis ? 1 : 0, transition: "opacity 210ms ease" }}>{word}</text>
          )}
        </g>
      </svg>
    </span>
  );
}

/** ONE frame for both home doors — the panel. No heading: the large icon carries the meaning and
 *  the CTA names the action, so a title row between them was just noise. */
const HOME_DOOR_CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 18,
  padding: "24px 18px 20px",
  minHeight: 236,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7), 0 4px 24px -4px rgba(0,0,0,0.45)",
};

export function HomeDoorCard({ icon, switcher, button, support }: {
  /** The large icon (SoloBoltIcon / GreekLettersIcon). */
  icon: React.ReactNode;
  /** The context line between icon and button ("for OLE MISS students ⇄"). Rendered only when
   *  there IS context — a switcher with nothing to switch from is clutter — and both cards are
   *  given the same level of it, so they stay the same height at every state. */
  switcher?: React.ReactNode;
  button: React.ReactNode;
  support: React.ReactNode;
}) {
  return (
    <div className="sa-home-door" style={HOME_DOOR_CARD}>
      {/* The large icon — a fixed envelope so both cards' icons sit on the same baseline. */}
      <div className="sa-home-door-icon grid place-items-center" style={{ height: SOLO_ICON_H }}>{icon}</div>
      {/* The slot reserves its height WHETHER OR NOT a line is in it. One card carrying context
          while the other does not is normal here (the solo door cycles campuses before you have
          picked one), and a collapsing slot would drop that card's button half a line below its
          neighbour's — the two buttons have to sit on one line to read as two equal choices. */}
      <div className="grid w-full place-items-center" style={{ minHeight: 30 }}>{switcher}</div>
      <div className="mt-4 w-full">{button}</div>
      <div className="sa-door-support mt-3 grid w-full place-items-center" style={{ minHeight: 34, fontFamily: BRAND_SANS }}>{support}</div>
      <div className="flex-1" />
    </div>
  );
}

/** The row the two home doors lay out in — vertical stack with a 12px gap on a phone; 2-up with
 *  more air from sm up. */
export function HomeDoorRow({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="sa-anchor" style={{ fontFamily: BRAND_SANS }}>
      {/* MORE AIR BETWEEN THE DOORS ON A PHONE. Stacked, a 12px gap read as one tall panel with a
          hairline through it; the two choices need to look like two choices. Desktop is unchanged —
          side by side they were already clearly separate. */}
      <div className="mx-auto grid w-full max-w-[880px] gap-7 sm:grid-cols-2 sm:gap-6">
        {children}
      </div>
    </section>
  );
}

/** Home-fold CSS — the card's hover/press response. (The bolt's own boil animation lives in
 *  bolt-boil.tsx and is reduced-motion safe there.) */
export const HOME_FOLD_CSS = `
/* HOME DOORS — hover AND press (touch): a hair of scale and the hairline goes amber. */
.sa-home-door { transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
.sa-home-door:hover, .sa-home-door:active {
  transform: scale(1.02);
  border-color: var(--accent);
  box-shadow: 0 30px 70px -28px rgba(0,0,0,0.8), 0 4px 24px -4px rgba(0,0,0,0.45);
}
@media (prefers-reduced-motion: reduce) {
  .sa-home-door, .sa-home-door:hover, .sa-home-door:active { transform: none; transition: none; }
  .sa-context-pill { transition: none !important; transform: none !important; }
}
`;
