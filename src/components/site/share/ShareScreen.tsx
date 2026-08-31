// THE ONE-SCREEN SHELL — the shared frame for /s/… , the DM destinations.
//
// ── WHY THESE PAGES ARE SMALL ─────────────────────────────────────────────────────────────────
// A DM gets about four seconds on a phone. The council page has a share kit, a chapter table, an
// FAQ and testimonials; sending DM traffic there is handing someone a binder when they asked for
// directions. Everything here is sized to one phone screen, no scrolling, and the design target
// is fifteen seconds from tap to a link on the clipboard.
//
// ── SIMPLER THAN THE HOMEPAGE, NOT DIFFERENT FROM IT ──────────────────────────────────────────
// Same navy, same bolt, same cream, same type scale, same card treatment, same CTA tokens. What
// is missing is missing on purpose: no FAQ, no testimonials, no footer wall, and the nav is the
// wordmark alone. The brief asks for both "same nav" and "no nav clutter"; the wordmark is the
// part of the nav that says which site you are on, and the links are the part that would invite
// someone off a page that exists to end in one tap.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { CompactLockup, useNavyDocument } from "@/components/site/SiteHeader";
import { DOOR_CTA_VARS } from "@/components/site/home-two-door/DoorCard";

export function ShareScreen({ boltVars, children }: {
  /** The campus colourway, so a share screen wears the school it belongs to. */
  boltVars?: { c1: string; c2: string } | null;
  children: React.ReactNode;
}) {
  useNavyDocument();
  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        ...DOOR_CTA_VARS,
        ...(boltVars ? { ["--sa-bolt-1" as string]: boltVars.c1, ["--sa-bolt-2" as string]: boltVars.c2 } : {}),
        background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY,
        minHeight: "100dvh", position: "relative", overflowX: "clip",
      }}
    >
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <FrameBackground variant="orbital" intensity={0.3} animate />
      </div>

      {/* THE WORDMARK IS TOP-LEFT (2026-08-31), not stacked above the hero.

          It used to sit inside the centred column, which put it directly over the headline: two
          brand elements on one vertical axis, reading as one three-line block. Every other page
          on the site puts the wordmark in the top-left corner, and a share page arriving from a
          DM is the LAST place to invent a second convention — it is the one moment the visitor is
          deciding whether this is a real thing. So it goes where it goes everywhere else, out of
          the hero's way, and the hero gets the bolt instead.

          Absolutely positioned rather than a flex row so the centred column below it stays
          genuinely centred in the viewport, not centred in whatever is left beside a logo. */}
      <a
        href="/"
        aria-label="Survive Accounting — home"
        style={{
          position: "absolute", zIndex: 2,
          top: "calc(14px + env(safe-area-inset-top, 0px))",
          left: "calc(20px + env(safe-area-inset-left, 0px))",
          display: "inline-flex", alignItems: "center", minHeight: 44,
        }}
      >
        <CompactLockup size={16} />
      </a>

      {/* minHeight uses dvh, not vh: on iOS Safari `100vh` is taller than the visible viewport, so
          a "one screen, no scrolling" page scrolls by exactly the height of the browser chrome. */}
      <main
        style={{
          position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto",
          // TOP PADDING CLEARS THE CORNER WORDMARK. The lockup is absolutely positioned, so it
          // takes no space in flow — without this the hero bolt is drawn straight through it the
          // moment the content is tall enough to start at the top instead of centring.
          padding: "calc(66px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px))",
          width: "100%", minHeight: "100dvh",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", fontFamily: BRAND_SANS,
        }}
      >
        {children}
      </main>
    </div>
  );
}

/** The screen's headline block — same type scale as the homepage hero, one step down in size
 *  because these pages carry one idea rather than a whole argument. */
export function ShareHeading({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      {/* THE HERO BOLT — the centred brand element, and a SEPARATE thing from the wordmark in the
          corner. The share screen had no mark of its own once the lockup moved out of the column,
          and a DM destination that opens on plain type has four seconds to look like a real
          product. The boiling bolt is the homepage's own hero mark at a smaller size, so this
          reads as the same site rather than a lookalike. */}
      <span className="mb-5 block" aria-hidden><BoltBoil height={84} /></span>
      <h1
        className="mx-auto max-w-[18ch] text-[26px] font-black leading-[1.14] sm:text-[32px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
      >
        {title}
      </h1>
      {sub && (
        <p className="mx-auto mt-3 max-w-[36ch] text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.8 }}>
          {sub}
        </p>
      )}
    </>
  );
}

/** A full-width action. `tone` picks which door token it wears, so these buttons and the
 *  homepage's doors can never drift apart. */
export function ShareButton({ tone = "solo", onClick, href, children, confirmed }: {
  tone?: "solo" | "chapter" | "quiet";
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  /** Renders the copied state — see copyToClipboard: only ever true for a copy that happened. */
  confirmed?: boolean;
}) {
  const base: React.CSSProperties = {
    minHeight: 54, width: "100%", borderRadius: 12, fontSize: 15.5, fontWeight: 900,
    fontFamily: BRAND_SANS, cursor: "pointer", border: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
  const tones: Record<string, React.CSSProperties> = {
    solo: { background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" },
    chapter: { background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)" },
    quiet: {
      background: "rgba(0,0,0,0.24)", color: "var(--brand-cream)",
      border: "1px solid var(--border-default)",
    },
  };
  const confirmedStyle: React.CSSProperties = {
    background: "rgba(252,163,17,0.14)", color: "var(--accent)", border: "1px solid var(--accent)",
  };
  const style = { ...base, ...(confirmed ? confirmedStyle : tones[tone]) };
  const cls = "transition-transform hover:scale-[1.02] focus-visible:ring-2";
  return href
    ? <a href={href} className={cls} style={style}>{children}</a>
    : <button type="button" onClick={onClick} className={cls} style={style}>{children}</button>;
}

/** The quiet line under the actions — an upgrade path or a way to the full page. One line, never
 *  a pitch: this screen's job is the tap above it. */
export function ShareFootnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}
