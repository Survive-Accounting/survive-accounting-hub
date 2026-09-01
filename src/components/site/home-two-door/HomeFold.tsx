// THE MOBILE FOLD (2026-09-01) — the home page's two doors, rebuilt so BOTH sit above the fold
// on a 390x844 phone at load.
//
// ── WHY A NEW CARD INSTEAD OF EDITING DoorCard ────────────────────────────────────────────────
// DoorCard is the SHARED door: /go/<school>/<chapter>, the council share kit, ShareScreen and the
// campaign page all import its frame, its 332px min-height and its icon envelope, and
// door-geometry.test.ts pins that height as "the big door" a tier steps down from. The mobile-fold
// spec is a HOME-ONLY change — kill the giant cap/house icons, drop the card to a ~160px rectangle,
// make the title the bolt lockup — so reshaping the shared constant would silently restyle five
// other surfaces and break the staircase test. These home cards therefore live here, reusing the
// shared VISUAL LANGUAGE (surface, border, radius, the CTA colour tokens) but their own geometry.
//
// SYMMETRY STILL HOLDS: one frame (HOME_DOOR_CARD), one grammar (TITLE ROW → CTA → SUPPORT LINE),
// the two cards differing only by the chapter card's small building glyph — the single icon left
// on either card, there to tell the two doors apart at a glance.
import { Landmark } from "lucide-react";

import { Bolt, BOLT_RATIO, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

/** THE BOLT'S AMBER. Fixed by the spec (#EF9F27) — a hair warmer than a campus theme's --accent,
 *  because the lockup is a brand mark and reads the same on every campus, where the CTA beneath it
 *  is free to recolour to the school. */
const BOLT_AMBER = "#EF9F27";

/** THE BOLT LOCKUP — `survive` in cream, the amber bolt inline at ~cap height, then the door's
 *  word ("SOLO" / "WITH YOUR CHAPTER"). The bolt is a GLYPH here, not an illustration: it sits on
 *  the text baseline and breathes (see HOME_FOLD_CSS .sa-bolt-pulse). */
export function BoltWord({ tail, size = 20 }: { tail: string; size?: number }) {
  const boltH = Math.round(size * 0.92);
  const boltW = Math.round(boltH * BOLT_RATIO);
  return (
    <span
      className="sa-boltword"
      style={{ display: "inline-flex", alignItems: "center", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "0.02em", color: "var(--brand-cream)" }}
    >
      <span style={{ textTransform: "none" }}>survive</span>
      <span className="sa-bolt-pulse" aria-hidden style={{ display: "inline-block", height: boltH, width: boltW, margin: "0 3px" }}>
        {/* mono amber, no keyline — one flat glyph, not the two-colour house bolt */}
        <Bolt c1={BOLT_AMBER} c2={BOLT_AMBER} keyline="" title="" />
      </span>
      <span>{tail}</span>
    </span>
  );
}

/** ONE frame for both home doors — the rectangle. Reuses the shared surface/border/radius so it is
 *  visibly the same family as the door everywhere else, at its own mobile-fold height. */
const HOME_DOOR_CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  padding: "16px 18px 18px",
  minHeight: 158,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7), 0 4px 24px -4px rgba(0,0,0,0.45)",
};

export function HomeDoorCard({ tail, chapterGlyph = false, button, support }: {
  /** The word after the bolt: "SOLO" | "WITH YOUR CHAPTER". */
  tail: string;
  /** The chapter card alone carries a small columned-building glyph, so the pair is instantly
   *  distinguishable. Deliberately NOT a house (that read as real-estate, not a Greek chapter). */
  chapterGlyph?: boolean;
  button: React.ReactNode;
  support: React.ReactNode;
}) {
  return (
    <div className="sa-home-door" style={HOME_DOOR_CARD}>
      <div className="sa-home-door-title flex items-center justify-center gap-2">
        {chapterGlyph && <Landmark size={19} strokeWidth={2} aria-hidden style={{ color: "var(--text-muted)", flex: "none" }} />}
        <h3 className="grid place-items-center" style={{ margin: 0, minHeight: 24 }}>
          <BoltWord tail={tail} />
        </h3>
      </div>
      <div className="mt-3 w-full">{button}</div>
      {/* Support line below the button; the shared .sa-door-support gives it the balanced wrap. */}
      <div className="sa-door-support mt-2.5 grid w-full place-items-center" style={{ minHeight: 34, fontFamily: BRAND_SANS }}>{support}</div>
    </div>
  );
}

/** The row the two home doors lay out in. VERTICAL STACK with a 12px gap on a phone (both cards
 *  partially visible on load); 2-up with more air from sm up, where the fold is not the constraint. */
export function HomeDoorRow({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="sa-anchor" style={{ fontFamily: BRAND_SANS }}>
      <div className="mx-auto grid w-full max-w-[880px] gap-3 sm:grid-cols-2 sm:gap-6">
        {children}
      </div>
    </section>
  );
}

/** Home-fold CSS — the bolt's slow breath, and the card's hover/press response. Injected once by
 *  TwoDoorHome at its root. */
export const HOME_FOLD_CSS = `
/* BOLT PULSE — a slow breath, not a blink: 0.75 → 1.0 over 2.4s, forever. */
@keyframes sa-bolt-breath { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
.sa-bolt-pulse { animation: sa-bolt-breath 2.4s ease-in-out infinite; }

/* HOME DOORS — hover AND press (touch): a hair of scale, the hairline goes amber, and the bolt
   breathes faster. Same treatment on :active so a phone tap registers the same as a hover. */
.sa-home-door { transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
.sa-home-door:hover, .sa-home-door:active {
  transform: scale(1.02);
  border-color: var(--accent);
  box-shadow: 0 30px 70px -28px rgba(0,0,0,0.8), 0 4px 24px -4px rgba(0,0,0,0.45);
}
.sa-home-door:hover .sa-bolt-pulse, .sa-home-door:active .sa-bolt-pulse { animation-duration: 0.5s; }

/* REDUCED MOTION — hold the bolt full-on, disable every transition (cards and the header pill). */
@media (prefers-reduced-motion: reduce) {
  .sa-bolt-pulse { animation: none; opacity: 1; }
  .sa-home-door, .sa-home-door:hover, .sa-home-door:active { transform: none; transition: none; }
  .sa-context-pill { transition: none !important; transform: none !important; }
}
`;
