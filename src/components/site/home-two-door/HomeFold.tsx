// THE TWO-DOOR CARDS (rebuilt p1, 2026-09-01).
//
// Each card is a tall panel: a large ~112px icon, then the heading, then the CTA, then a support
// line. The icons differ per door and carry the meaning before a word is read:
//   • Solo    — the full-colour Survive bolt, boiling (campus-tinted on a campus page).
//   • Chapter — a classical columned building (pediment + columns). NOT a house: a house read as
//               real-estate, not a Greek chapter.
// Both headings are the "survive" wordmark (the bolt is the "i") + the door's word, sentence-case:
// "survive Solo" / "survive Fraternities & Sororities". The separate ⚡ glyph is gone — the icon
// above (solo) and the wordmark's own bolt already carry it.
//
// This is HOME-scoped on purpose: the shared DoorCard (chapter promo / council / share surfaces)
// and its geometry test stay untouched.
import { Landmark } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";

/** The large icon size. Bolt and building are tuned to roughly equal optical weight — the building
 *  is an outline so it renders a touch smaller than the filled bolt would at the same box. */
export const SOLO_ICON_H = 112;

/** Solo's icon: the boiling, campus-tinted bolt. Colours come from --bolt-primary/secondary (set
 *  per campus by the page theme), falling back to the brand red/blue on the generic home. */
export function SoloBoltIcon() {
  return <BoltBoil height={SOLO_ICON_H} />;
}

/** Chapter's icon: the classical columned building (Tabler ti-building-bank equivalent). */
export function ChapterBuildingIcon() {
  return <Landmark size={104} strokeWidth={1.4} style={{ color: "var(--brand-cream)" }} aria-hidden />;
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

export function HomeDoorCard({ icon, button, support }: {
  /** The large icon (SoloBoltIcon / ChapterBuildingIcon). */
  icon: React.ReactNode;
  button: React.ReactNode;
  support: React.ReactNode;
}) {
  return (
    <div className="sa-home-door" style={HOME_DOOR_CARD}>
      {/* The large icon — a fixed envelope so both cards' icons sit on the same baseline. */}
      <div className="sa-home-door-icon grid place-items-center" style={{ height: SOLO_ICON_H }}>{icon}</div>
      <div className="mt-5 w-full">{button}</div>
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
