// PUBLIC SITE CHROME (M1) — the wordmark that fits, and the header that is always there.
//
// Two mobile-critical jobs:
//
//   FitWordmark — SurviveWordmark is `white-space: nowrap` at a fixed pixel size. At the
//   hero's 92px that lockup is ~350px wide, which is WIDER than a 320-390px phone: it both
//   clipped mid-letter and pushed the whole document into horizontal scroll. The logo may
//   never be cropped — it is the logo — so this measures the space available and scales the
//   lockup down to fit, bolt and all, instead of letting it overflow.
//
//   SiteHeader — every public page gets the wordmark, top-left, always linking home. Before
//   this, /chapters and friends had no route back to the landing page at all: a visitor who
//   arrived on a shared link was simply stranded.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { SA_NAV_FOCUS_EVENT, scrollToId } from "@/lib/ui-scroll";
import { useCampus } from "@/lib/campus-context";

/** The page navy. One constant so the CSS, the meta theme-color and any inline use agree —
 *  Safari samples this for its toolbar, and a mismatch reads as a rendering bug. */
// TEST palette (branch test/lighter-color-system): page canvas #0D1730 — keep in sync with --bg-page.
export const SITE_NAVY = "#0D1730";

/** Wordmark that never exceeds its container. `size` is the IDEAL size; it shrinks when the
 *  viewport is too narrow and never grows past it.
 *
 *  `subline` turns it into the full BRAND LOCKUP: the wordmark with a word set beneath it in
 *  letterspaced small caps. It is sized from the FITTED size, not the ideal one, so the two
 *  halves keep their proportion when the phone forces the wordmark down. */
export function FitWordmark({ size, subline, className, style }: { size: number; subline?: string; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(size);

  // useLayoutEffect so the first paint is already correct — a frame of the oversized
  // wordmark is exactly the clipped state we are fixing.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth;
      if (!avail) return;
      // The lockup's natural width tracks font-size almost linearly. 4.0 is measured from
      // the Rubik Black "surv[bolt]ve" lockup; the 0.94 leaves a hair of breathing room so
      // antialiasing never tips it over the edge.
      const natural = size * 4.0;
      setFit(natural <= avail ? size : Math.max(18, (avail / natural) * size * 0.94));
    };
    measure();
    // BOTH mechanisms, deliberately. ResizeObserver is the precise one — it catches the
    // container changing without the window changing. But RO callbacks are delivered during
    // the rendering steps, so a background tab or non-compositing embed can silence it
    // indefinitely, leaving the logo stuck at whatever width it first measured. The window
    // resize listener cannot be starved, and orientationchange covers the phone rotation
    // that is the single most likely way this gets narrower in the wild.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [size]);

  return (
    <div ref={box} className={className} style={{ width: "100%", maxWidth: "100%", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
      <SurviveWordmark size={fit} />
      {subline && (
        // textIndent cancels the TRAILING letter-space. Without it, centred letterspaced text
        // sits visibly left of centre — the last character contributes a gap that the centring
        // maths counts as glyph. Classic lockup detail, and very obvious under a big wordmark.
        <span
          style={{
            marginTop: fit * 0.1,
            fontSize: Math.max(9, fit * 0.155),
            letterSpacing: "0.42em",
            textIndent: "0.42em",
            fontWeight: 700,
            lineHeight: 1,
            textTransform: "uppercase",
            color: "var(--brand-cream, #F5EFE6)",
            opacity: 0.55,
            whiteSpace: "nowrap",
          }}
        >
          {subline}
        </span>
      )}
    </div>
  );
}

/** The NAVBAR lockup: wordmark with ACCOUNTING beneath, sized for a 48px bar.
 *
 *  Pass 2 makes this the ONLY wordmark on the page — the hero no longer carries one — so it is
 *  also the brand statement, not just a way home. Kept as its own component because
 *  FitWordmark's subline is proportional to the fitted size and would render ~3.4px here. */
export function CompactLockup({ size = 19 }: { size?: number } = {}) {
  // THE BOLT IS THE "i" — the real wordmark, as the footer and every large surface draw it, rather
  // than plain text with a bolt bolted on beside it (2026-09-02).
  //
  // MONOCHROME on purpose. The two-tone brand bolt at 19px, boiling, next to a headline is a second
  // thing moving in the corner of the eye the whole way down the page; the previous version flashed
  // it in on scroll, which was worse — motion arriving in the chrome while you are reading the body
  // is exactly the kind of thing that makes a page hard to scan.
  //
  // CREAM BODY, LIGHT-GREY SEAM. Painting the seam in the bar's own navy read as a hole punched
  // through the bolt rather than as a fold in it. From across a room this is one white bolt; up
  // close the seam still draws the shape the footer logo draws. No brand red or blue at this size —
  // two saturated colours in the corner of the eye are a distraction, not a logo.
  return (
    <SurviveWordmark
      size={size}
      red="var(--brand-cream, #F5EFE6)"
      blue="#AFB6C4"
      boltCream="none"
      // AND IT HOLDS STILL. The boil is a four-frame flipbook running forever; at 15px in the corner
      // of every screen it is not readable as craft, only as something twitching while you read.
      // One pinned frame keeps the drawn look and drops the movement.
      boilFrame={0}
    />
  );
}
/** A nav destination. `href` starting with "#" is a SAME-PAGE anchor: it smooth-scrolls in place
 *  (honouring reduced motion via scrollToId) instead of navigating, so on /go/ chapter pages the
 *  navbar never yanks the visitor back to the homepage. */
type NavItem = {
  label: string;
  href: string;
  route?: boolean;
  sub?: string;
  /** CONTACT (2026-08-28): not a destination — the row expands in place to show both ways to
   *  reach Lee. It used to point at `#contact`, an anchor that exists on no page, so the menu's
   *  Contact item quietly did nothing. */
  contact?: boolean;
};

/** The two ways to reach Lee, revealed by the menu's Contact row. */
const LEE_PHONE = "(662) 565-8818";
const LEE_TEL = "+16625658818";
const LEE_EMAIL = "lee@surviveaccounting.com";

/** Chapter pages contextualize the whole navbar (see chapterNav on SiteHeader). */
export interface ChapterNav {
  examAnchor: string;
  accessAnchor: string;
}

const chapterLinks = (nav: ChapterNav): NavItem[] => [
  { label: "Exam 1 Free", href: `#${nav.examAnchor}` },
  { label: "Chapter Access", href: `#${nav.accessAnchor}` },
  { label: "Reviews", href: "#reviews" },
  { label: "Meet Lee", href: "#lee" },
];

/** Smooth-scroll same-page anchors; let everything else navigate normally. The href stays on the
 *  element so middle-click, no-JS and screen readers keep the real destination.
 *
 *  Focus moves WITH the scroll: native anchor navigation hands sequential focus to the target,
 *  and preventDefault silently loses that — a keyboard user pressing Enter on "Chapter Access"
 *  would see the page move while their next Tab continued from the navbar. tabindex="-1" makes
 *  the (div) target programmatically focusable without adding it to the tab order. */
const onNavClick = (href: string) => (e: React.MouseEvent) => {
  if (!href.startsWith("#")) return;
  e.preventDefault();
  const id = href.slice(1);
  scrollToId(id);
  const el = document.getElementById(id);
  if (el) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
  window.dispatchEvent(new CustomEvent(SA_NAV_FOCUS_EVENT, { detail: id }));
};

/** The site menu (M2.2). Holds the broad navigation that used to have nowhere to live —
 *  and specifically NOT the topic switcher, which belongs inside the card next to the
 *  content it switches. Closes on Escape, on tap-outside, and on choosing anything. */
function SiteMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(false);
  useEffect(() => {
    if (!open) { setContact(false); return; } // closing the menu collapses the contact row
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="grid place-items-center rounded-lg"
        style={{ minHeight: 44, minWidth: 44, color: "#F5EFE6" }}
      >
        <span style={{ display: "grid", gap: 4 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ display: "block", width: 18, height: 2, borderRadius: 2, background: "currentColor" }} />)}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[201]" style={{ background: "rgba(5,8,16,0.55)" }} onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed right-2 z-[202] w-[252px] overflow-hidden rounded-xl"
            style={{ top: "calc(52px + env(safe-area-inset-top, 0px))", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)" }}
          >
            {items.map((it, i) => {
              const rowStyle: React.CSSProperties = {
                minHeight: 46,
                color: "#F5EFE6",
                // The rule belongs to the FIRST route item, so adding another anchor above it
                // can never strand the divider in the wrong place.
                borderTop: it.route && !items[i - 1]?.route ? "1px solid var(--border-default)" : undefined,
                marginTop: it.route && !items[i - 1]?.route ? 8 : undefined,
              };
              // CONTACT — expands in place; the menu stays open so both options are readable.
              if (it.contact) {
                return (
                  <div key={it.label}>
                    <button
                      type="button"
                      onClick={() => setContact((v) => !v)}
                      aria-expanded={contact}
                      className="flex w-full items-center justify-between px-4 text-left text-[14px] font-semibold hover:bg-white/10"
                      style={{ ...rowStyle, background: "none", border: 0, borderTop: rowStyle.borderTop, cursor: "pointer" }}
                    >
                      <span>{it.label}</span>
                      <span aria-hidden style={{ color: "var(--accent, #FCA311)", fontSize: 11 }}>{contact ? "▴" : "▾"}</span>
                    </button>
                    {contact && (
                      <div style={{ background: "rgba(0,0,0,0.22)" }}>
                        <a href={`sms:${LEE_TEL}`} className="flex items-center px-4 text-[13.5px] font-semibold hover:bg-white/10" style={{ minHeight: 44, color: "#F5EFE6" }}>
                          <span style={{ color: "var(--text-muted, #94A3B8)" }}>Text:</span>
                          <span className="ml-1.5">{LEE_PHONE}</span>
                        </a>
                        <a href={`mailto:${LEE_EMAIL}`} className="flex items-center px-4 text-[13.5px] font-semibold hover:bg-white/10" style={{ minHeight: 44, color: "#F5EFE6" }}>
                          <span style={{ color: "var(--text-muted, #94A3B8)" }}>Email:</span>
                          <span className="ml-1.5 truncate">{LEE_EMAIL}</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <a
                  key={it.label}
                  href={it.href}
                  onClick={(e) => { onNavClick(it.href)(e); setOpen(false); }}
                  className="flex items-center px-4 text-[14px] font-semibold hover:bg-white/10"
                  style={rowStyle}
                >
                  <span className="flex flex-col">
                    <span>{it.label}</span>
                    {it.sub && <span className="text-[11px] font-bold" style={{ color: "var(--accent, #FCA311)" }}>{it.sub}</span>}
                  </span>
                </a>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** Sticky header for every public page. Small, on-brand, and the wordmark is a link home.
 *  Sits under the notch via safe-area padding so it is never obscured on a modern iPhone.
 *
 *  Pass 2: the bar is ALWAYS fully visible, hamburger included. The previous fade-in-on-scroll
 *  existed to keep exactly one interactive element above the fold when the hero carried the
 *  wordmark; now the navbar carries the lockup and is itself the brand statement, so hiding half
 *  of it on load would just make the page look unfinished for the first 80px of scroll. */
/** Desktop-only inline links. Anchors rather than router links: #reviews and #lee are on the
 *  landing page and carry scroll-margin for the sticky bar, so a same-page press lands correctly
 *  and a press from elsewhere navigates home first. */
// `base` is "" on a page that HAS these sections (the homepage and every campus page render the
// same landing layout) and "/" everywhere else. Before this the hrefs were hard-coded "/#reviews",
// so on /university-of-mississippi the navbar's own "Cram Exam 1 Free" sent the visitor to the
// GENERIC homepage and asked them to pick the school the URL had just named.
const desktopLinks = (base: string, greekHref: string): NavItem[] => [
  { label: "Reviews", href: `${base}#reviews` },
  { label: "Meet your tutor", href: `${base}#lee` },
  { label: "For Greeks", href: greekHref },
];

// Pass 2 order. The first item repeats the page CTA on purpose: the navbar is sticky, so once
// the hero has scrolled away this is the only Cram-Exam-1 door still on screen. The Greek link
// is a ROUTE, not an anchor, so it sits under a divider — mixing "jump down this page" with
// "leave this page" in one flat list is how people lose their place.
// (Contact EXPANDS in place — see NavItem.contact. The row used to jump to `#contact`, an anchor
// no page defines. The revealed rows are sms:/mailto: links the visitor chooses deliberately,
// which is different from a bare menu item silently opening an installed app.)
const menuLinks = (base: string, greekHref: string): NavItem[] => [
  { label: "Start cramming", href: `${base}#exam1` },
  { label: "Reviews", href: `${base}#reviews` },
  { label: "Meet your tutor", href: `${base}#lee` },
  { label: "Contact", href: "", contact: true },
  { label: "For Fraternities & Sororities", href: greekHref, route: true, sub: "⚡ Boost chapter GPAs" },
];

// TWO-DOOR HOMEPAGE NAV (08-27). The homepage's Greek path is one of the two doors directly
// under the hero, so the bar drops "For Greeks" — a nav link to the thing the page is already
// showing. The orange Start-Exam-1 CTA goes with it: the doors are the instruction, and three
// competing "start" doors was exactly the clutter the redesign removes. Every OTHER page keeps
// the full bar (the CTA there is the only Exam-1 door still on screen once the hero scrolls).
const homeLinks = (): NavItem[] => [
  { label: "Reviews", href: "#reviews" },
  { label: "Meet your tutor", href: "#lee" },
];
const homeMenuLinks = (): NavItem[] => [
  { label: "Reviews", href: "#reviews" },
  { label: "Meet your tutor", href: "#lee" },
  // Contact expands in place into Text + Email rather than jumping anywhere.
  { label: "Contact", href: "", contact: true },
];

export function SiteHeader({ wordmark = true, chapterNav, onLanding = false, homeNav = false }: { wordmark?: boolean; chapterNav?: ChapterNav; /** The page renders the landing sections (#exam1, #reviews, #lee, #contact), so nav anchors stay on THIS page. */ onLanding?: boolean; /** The TWO-DOOR HOMEPAGE bar: Reviews + Meet your tutor only, no For-Greeks link, no orange CTA — see homeLinks above. */ homeNav?: boolean; } = {}) {
  const bar = useRef<HTMLElement>(null);
  // The Greek link carries the known campus. One source (campus context), so the navbar can never
  // name a different school from the hero beside it; pages outside a provider get the bare link.
  const campus = useCampus();
  const greekHref = campus.school?.slug ? `/chapters?school=${campus.school.slug}` : "/chapters";
  const base = onLanding ? "" : "/";
  // A Greek chapter page contextualizes the whole bar: same-page anchors (Exam 1, Chapter
  // Access, Reviews, Meet Lee) and an exec-facing CTA. Generic homepage links ("For Greeks",
  // Contact) are deliberately absent there — a visitor on a chapter page is already somewhere
  // specific, and every link that navigates away is a door out of the funnel.
  const links = chapterNav ? chapterLinks(chapterNav) : homeNav ? homeLinks() : desktopLinks(base, greekHref);
  const menuItems = chapterNav ? chapterLinks(chapterNav) : homeNav ? homeMenuLinks() : menuLinks(base, greekHref);
  // null = no CTA pill at all (the two-door homepage: the doors are the CTAs).
  const cta: NavItem | null = homeNav ? null : chapterNav
    ? { label: "Set Up Chapter Access →", href: `#${chapterNav.accessAnchor}` }
    : { label: "Start Exam 1 Free ⚡", href: `${base}#exam1` };

  // PUBLISH THE HEADER HEIGHT as --sa-header-h so a full-viewport hero can subtract exactly the
  // right amount. Hardcoding 48px is wrong on a notched phone, where safe-area-inset-top adds
  // ~47px and the section below would overflow the fold by exactly that much.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => document.documentElement.style.setProperty("--sa-header-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    measure();
    // Both mechanisms, for the same reason as FitWordmark: RO is precise but is delivered during
    // the rendering steps, so a non-compositing tab can silence it indefinitely.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, []);


  return (
    <header
      ref={bar}
      /* NOT STICKY (2026-09-02). A bar pinned over the page while you read costs a strip of every
         screen and keeps a second focal point in view the whole way down; scanning got harder, not
         easier. It scrolls away with everything else now. */
      className="relative z-[200] w-full"
      style={{
        background: "color-mix(in srgb, var(--sa-surface-nav) 92%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border-default)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center px-3" style={{ minHeight: 54 }}>
        {/* 44px minimum tap target — Apple's floor, and this is the only way home. */}
        {/* §4 — the landing page hides this: the hero wordmark sits directly below it,
            so the small one is pure duplication. Every OTHER page keeps it, because there
            it is the only route home. */}
        {wordmark
          ? <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center" style={{ minHeight: 44, minWidth: 44 }}><CompactLockup /></a>
          : <span style={{ minHeight: 44, display: "inline-flex" }} />}
        <span className="flex-1" />

        {/* DESKTOP INLINE LINKS (>=1024px). The bar carried a wordmark and a lone hamburger with
            a wasteland between them; at this width there is room to just show the destinations.
            Contact and FAQ are deliberately absent — Contact lives in the footer and the FAQ is
            on the page itself, so putting either here would be a link to somewhere the visitor
            already is. */}
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={onNavClick(l.href)}
              className="text-[13.5px] font-semibold transition-colors"
              style={{ color: "var(--text-muted)", minHeight: 44, display: "inline-flex", alignItems: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand-cream)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* THE CTA survives to tablet; only the links collapse into the hamburger there.
            Absent entirely on the two-door homepage — the doors below the hero are the CTAs. */}
        {cta && (
          <a
            href={cta.href}
            onClick={onNavClick(cta.href)}
            className="ml-5 hidden items-center rounded-xl px-4 text-[13.5px] font-black md:inline-flex"
            style={{ background: "var(--accent)", color: "#0B1220", minHeight: 40 }}
          >
            {cta.label}
          </a>
        )}

        {/* Hidden entirely at >=1024px — everything it holds is now inline. */}
        <span className="ml-2 lg:hidden">
          <SiteMenu items={menuItems} />
        </span>
      </div>
    </header>
  );
}

/** Paint the document navy for this page.
 *
 *  The meta theme-color drives Safari's toolbar, but the OVERSCROLL rubber-band samples the
 *  html/body background — which globally is the light shadcn token. Rather than change that
 *  for the whole app (admin and JE surfaces expect it), public pages opt in by class, and
 *  clean up on unmount so navigating away restores the default.
 *
 *  Idempotent and reference-counted-by-nature: re-adding an existing class is a no-op, and
 *  only the last public page to unmount removes it. */
export function useNavyDocument() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("sa-navy");
    return () => el.classList.remove("sa-navy");
  }, []);
}

/** THE BLACK HOME — on top of the navy document: html/body paint --bg-home (the film stage black)
 *  so overscroll and the area behind the page match the homepage root. Homepage only. */
export function useBlackDocument() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("sa-black");
    return () => el.classList.remove("sa-black");
  }, []);
}
