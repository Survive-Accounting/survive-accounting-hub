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
 *  viewport is too narrow and never grows past it. */
export function FitWordmark({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
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
    <div ref={box} className={className} style={{ width: "100%", maxWidth: "100%", overflow: "hidden", display: "flex", justifyContent: "center", ...style }}>
      <SurviveWordmark size={fit} />
    </div>
  );
}

/** Sticky header for every public page. Small, on-brand, and the wordmark is a link home.
 *  Sits under the notch via safe-area padding so it is never obscured on a modern iPhone. */
export function SiteHeader() {
  return (
    <header
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
      <div className="mx-auto flex w-full max-w-[1200px] items-center px-3" style={{ minHeight: 48 }}>
        {/* 44px minimum tap target — Apple's floor, and this is the only way home. */}
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center" style={{ minHeight: 44, minWidth: 44 }}>
          <SurviveWordmark size={22} />
        </a>
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
