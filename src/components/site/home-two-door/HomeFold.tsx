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

// ── GREEK LETTERS ICON (p4 §5) ──────────────────────────────────────────────────────────────────
// Three Greek letters as a group, in campus colour, with the same feTurbulence "boil" the bolt has
// plus a slow glow pulse. Only letters that UNMISTAKABLY read Greek — the other half of the
// alphabet has Latin lookalikes (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ) and reads as English.
const GREEK_POOL_NOTE = "safe set: Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω";
// Trios chosen for shape contrast (one triangular, one angular, one round). We CYCLE them: any one
// trio is some real chapter's letters, and pinning it reads as repping that house — cycling avoids
// implying we favour any single organisation.
const GREEK_TRIOS: string[][] = [
  ["Φ", "Δ", "Σ"], // round · triangular · angular (the default)
  ["Θ", "Λ", "Ξ"], // round · triangular · angular
  ["Ω", "Ψ", "Γ"], // round · forked · angular
  ["Π", "Δ", "Θ"], // angular · triangular · round
  ["Σ", "Λ", "Ω"], // angular · triangular · round
];
void GREEK_POOL_NOTE;

/** Chapter's icon: a cycling trio of Greek letters that boil and glow in the campus colour. Pass
 *  `letters` to pin a specific trio (the seam for a returning visitor's real chapter letters —
 *  not built yet); omitted, it cycles GREEK_TRIOS with a slow crossfade. */
export function GreekLettersIcon({ letters }: { letters?: string[] } = {}) {
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

  // Crossfade cycler: two stacked layers swap trios. The BACK layer (opacity 0) takes the next trio,
  // then flips to front — so one fades in exactly as the other fades out.
  const pinned = !!(letters && letters.length);
  const [cf, setCf] = useState({ a: 0, b: 1, aFront: true });
  useEffect(() => {
    if (reduced || pinned) return;
    const t = window.setInterval(() => {
      setCf((s) => {
        const frontIdx = s.aFront ? s.a : s.b;
        const next = (frontIdx + 1) % GREEK_TRIOS.length;
        return s.aFront ? { a: s.a, b: next, aFront: false } : { a: next, b: s.b, aFront: true };
      });
    }, 4200);
    return () => window.clearInterval(t);
  }, [reduced, pinned]);

  // CREAM, not campus-tinted (p6 §4): school colours belong to the campus; Greek letters belong to
  // chapters, so tinting them in school colours implies the chapter IS the school. Bigger, too, to
  // match the bolt's optical weight on the solo card.
  const color = "var(--brand-cream, #F5EFE6)";
  const trioA = letters ?? GREEK_TRIOS[cf.a];
  const trioB = letters ?? GREEK_TRIOS[cf.b];
  // SIZED AGAINST THE BOLT, not against the box. The bolt is a solid silhouette and three outlined
  // letters read lighter at the same nominal size, so the type runs larger to land at equal weight.
  const textProps = { textAnchor: "middle" as const, x: 50, y: 70, fontSize: 58, letterSpacing: 1, style: { fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 800 } };

  return (
    <span aria-hidden style={{ display: "inline-block", width: SOLO_ICON_H * 1.05, height: SOLO_ICON_H }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        {!reduced && (
          <defs>
            {/* The BOIL (feTurbulence + displacement, seed cycled discretely like the bolt's flipbook)
                and a slow GLOW pulse (blur of the campus-coloured letters). Unique id per instance. */}
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
          {reduced ? (
            <text {...textProps}>{(letters ?? GREEK_TRIOS[0]).join("  ")}</text>
          ) : (
            <>
              <text {...textProps} style={{ ...textProps.style, opacity: cf.aFront ? 1 : 0, transition: "opacity 800ms ease" }}>{trioA.join("  ")}</text>
              <text {...textProps} style={{ ...textProps.style, opacity: cf.aFront ? 0 : 1, transition: "opacity 800ms ease" }}>{trioB.join("  ")}</text>
            </>
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
      {/* Fixed slot whether or not a line is in it, so a card with context and a card without are
          never different heights mid-transition. */}
      <div className="grid w-full place-items-center" style={{ minHeight: switcher ? 30 : 0 }}>{switcher}</div>
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
      <div className="mx-auto grid w-full max-w-[880px] gap-3 sm:grid-cols-2 sm:gap-6">
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
