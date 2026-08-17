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

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";

/** The page navy. One constant so the CSS, the meta theme-color and any inline use agree —
 *  Safari samples this for its toolbar, and a mismatch reads as a rendering bug. */
export const SITE_NAVY = "#0F1A2E";

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
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1 }}>
      <SurviveWordmark size={size} />
      <span
        style={{
          marginTop: 2,
          fontSize: Math.max(7, size * 0.33),
          letterSpacing: "0.34em",
          // cancels the trailing letter-space so the word optically aligns to the wordmark's left
          textIndent: "0.34em",
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--brand-cream, #F5EFE6)",
          opacity: 0.55,
          whiteSpace: "nowrap",
        }}
      >
        Accounting
      </span>
    </span>
  );
}
/** The site menu (M2.2). Holds the broad navigation that used to have nowhere to live —
 *  and specifically NOT the topic switcher, which belongs inside the card next to the
 *  content it switches. Closes on Escape, on tap-outside, and on choosing anything. */
function SiteMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Pass 2 order. The first item repeats the page CTA on purpose: the navbar is sticky, so once
  // the hero has scrolled away this is the only Cram-Exam-1 door still on screen. The Greek link
  // is a ROUTE, not an anchor, so it sits under a divider — mixing "jump down this page" with
  // "leave this page" in one flat list is how people lose their place.
  const items: { label: string; href: string; route?: boolean; sub?: string }[] = [
    { label: "Cram Exam 1 Free", href: "/#exam1" },
    { label: "Reviews", href: "/#reviews" },
    { label: "About Lee", href: "/#lee" },
    // Anchor, never mailto:/sms: — a scheme link can be claimed by an installed app, which is
    // what made tapping Contact raise "Open in inDrive?" on iOS. The deliberate sms: CTA in the
    // contact section is a different thing and keeps its scheme.
    { label: "Contact", href: "/#contact" },
    { label: "For Fraternities & Sororities", href: "/chapters", route: true, sub: "Boost chapter GPAs" },
  ];

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
            style={{ top: "calc(52px + env(safe-area-inset-top, 0px))", background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)" }}
          >
            {items.map((it, i) => (
              <a
                key={it.label}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center px-4 text-[14px] font-semibold hover:bg-white/10"
                style={{
                  minHeight: 46,
                  color: "#F5EFE6",
                  // The rule belongs to the FIRST route item, so adding another anchor above it
                  // can never strand the divider in the wrong place.
                  borderTop: it.route && !items[i - 1]?.route ? "1px solid rgba(245,239,230,0.14)" : undefined,
                }}
              >
                <span className="flex flex-col">
                  <span>{it.label}</span>
                  {it.sub && <span className="text-[11px] font-bold" style={{ color: "var(--accent, #FCA311)" }}>{it.sub}</span>}
                </span>
              </a>
            ))}
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
export function SiteHeader({ wordmark = true }: { wordmark?: boolean } = {}) {
  const bar = useRef<HTMLElement>(null);

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
      className="sticky top-0 z-[200] w-full"
      style={{
        background: "rgba(15,26,46,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(245,239,230,0.10)",
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
        {/* SITE NAV (M2.2) — the BROWSE ▾ toggle that used to sit INSIDE the player card is
            gone; broader navigation belongs in the page chrome, not in the content.
            aria-hidden + inert while faded so it is not reachable by keyboard or screen reader
            either — an invisible-but-focusable control is worse than a visible one. */}
        <SiteMenu />
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
