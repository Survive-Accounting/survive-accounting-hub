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

      {/* minHeight uses dvh, not vh: on iOS Safari `100vh` is taller than the visible viewport, so
          a "one screen, no scrolling" page scrolls by exactly the height of the browser chrome. */}
      <main
        style={{
          position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto",
          padding: "0 20px calc(24px + env(safe-area-inset-bottom, 0px))",
          width: "100%", minHeight: "100dvh",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", fontFamily: BRAND_SANS,
        }}
      >
        <div className="pb-6 pt-5"><CompactLockup /></div>
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
