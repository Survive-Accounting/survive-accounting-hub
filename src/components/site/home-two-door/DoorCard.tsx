// THE DOOR CARD — the two-choice card the homepage hero is built from, and now the chapter
// promo page's hero too (2026-08-28).
//
// EXTRACTED, NOT COPIED. When /go/<school>/<chapter> needed the same two doors, the rule was
// "reuse the component, do not fork a lookalike" — so the frame, the internal grammar, the
// button base, the CTA tokens and the hover CSS all live here, and both surfaces import them.
// A change to the door is a change to BOTH doors on BOTH pages, which is the point: two pages
// that drift apart one padding value at a time is exactly what this file prevents.
//
// SYMMETRY IS THE DESIGN: one frame (DOOR_CARD), one grammar
// (ICON → HEADING → BUTTON → SUPPORT LINE), fixed-height slots so headings, buttons and support
// lines sit on identical baselines left → right.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

/** ONE frame for every door — identical width, padding, radius, elevation. */
export const DOOR_CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 20,
  padding: "28px 24px 20px",
  minHeight: 332,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7), 0 4px 24px -4px rgba(0,0,0,0.45)",
};

/** Shared button geometry — both doors' CTAs are the same object at different fills. */
export const DOOR_BTN: React.CSSProperties = {
  minHeight: 54, width: "100%", borderRadius: 12, fontSize: 15.5, fontWeight: 900, fontFamily: BRAND_SANS,
};

/** The CTA colour tokens both pages publish on their page root (see DOOR_CTA_VARS). */
export const SOLO_BTN: React.CSSProperties = { ...DOOR_BTN, background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" };
export const CHAPTER_BTN: React.CSSProperties = { ...DOOR_BTN, background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)" };

/** Put these on the page root so the tokens above resolve. One definition, both pages. */
export const DOOR_CTA_VARS = {
  ["--cta-solo-bg" as string]: "#CE1126",
  ["--cta-solo-fg" as string]: "#FFFFFF",
  ["--cta-chapter-bg" as string]: "#A8D4F0",
  ["--cta-chapter-fg" as string]: "#0F1A2E",
} as React.CSSProperties;

/** The shared interaction class for a door's CTA (hover lift + focus ring), so the two buttons
 *  can never respond differently from each other. */
export const DOOR_BTN_CLASS = "transition-transform hover:scale-[1.02] focus-visible:ring-2";

export function DoorCard({ icon, title, button, support }: {
  icon: React.ReactNode;
  title: string;
  button: React.ReactNode;
  support: React.ReactNode;
}) {
  return (
    <div className="sa-door-card" style={DOOR_CARD}>
      {/* Icon envelope — same box on every door, whatever lives inside it. */}
      <div className="grid place-items-center" style={{ height: 118 }}>{icon}</div>
      {/* Fixed two-line envelope so a wrapped title never pushes the buttons out of line. */}
      <h3
        className="mt-3 grid place-items-center text-[20px] font-black uppercase leading-tight"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "0.04em", minHeight: 52 }}
      >
        {title}
      </h3>
      <div className="mt-3 w-full">{button}</div>
      {/* Support line BELOW the button; balanced wrap, two lines max on mobile. */}
      <div className="sa-door-support mt-3 grid w-full place-items-center" style={{ minHeight: 38, fontFamily: BRAND_SANS }}>{support}</div>
      <div className="flex-1" />
    </div>
  );
}

/** The row both pages lay their two doors out in — same max width, same gap, same stacking. */
export function DoorRow({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="sa-anchor" style={{ fontFamily: BRAND_SANS }}>
      <div className="mx-auto grid w-full max-w-[880px] gap-6 sm:grid-cols-2 sm:gap-9">{children}</div>
    </section>
  );
}

/** Door CSS — the hover response and the balanced support wrap. Injected by whichever page
 *  renders doors (both do it once, at their root). */
export const DOOR_CARD_CSS = `
/* SUPPORT LINES — balanced wrap so a one-word last line can't happen. */
.sa-door-support { text-wrap: balance; }

/* DOOR CARDS — one hover response everywhere: a hair of lift, nothing else moves. */
.sa-door-card { transition: transform 180ms ease, box-shadow 180ms ease; }
.sa-door-card:hover { transform: translateY(-3px); box-shadow: 0 30px 70px -28px rgba(0,0,0,0.8), 0 4px 24px -4px rgba(0,0,0,0.45); }
@media (prefers-reduced-motion: reduce) {
  .sa-door-card, .sa-door-card:hover { transform: none; transition: none; }
}
`;
