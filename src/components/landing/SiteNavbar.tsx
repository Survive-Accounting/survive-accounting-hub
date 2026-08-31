import { useEffect, useState } from "react";

import { CompactLockup } from "@/components/site/SiteHeader";

interface SiteNavbarProps {
  onBookTutoring?: () => void;
}

export default function SiteNavbar({ onBookTutoring }: SiteNavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 40 : y > 80));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const TRANSITION = "600ms cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div className="fixed top-0 left-0 right-0 z-50 w-full">
      <nav
        className="relative w-full px-5 sm:px-8 h-16 flex items-center justify-between"
        style={{ background: "transparent" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 border-b pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,33,61,0.96) 0%, rgba(16,26,49,0.96) 100%)",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow:
              "0 4px 16px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04) inset",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            opacity: scrolled ? 1 : 0,
            transition: `opacity ${TRANSITION}`,
          }}
        />

        {/* THE CURRENT WORDMARK (2026-08-31). This was a raster PNG on an external CDN
            (lwfiles.mycourse.app) — a different mark from the `survive ACCOUNTING` lockup every
            other page carries, loaded from a host we do not control, on exactly the pages a
            visitor reaches when they are checking whether this is a real company. It is the same
            component as the main header now, so the two cannot drift, and it is one fewer
            third-party request in the critical path. */}
        <a
          href="/"
          className="relative inline-flex items-center"
          aria-label="Survive Accounting — home"
          style={{ minHeight: 44 }}
        >
          <CompactLockup size={17} />
        </a>

        <div className="relative flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={onBookTutoring}
            className="inline-flex items-center justify-center rounded-full px-4 sm:px-5 h-9 text-[13px] font-semibold text-white hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "Inter, sans-serif",
              background:
                "linear-gradient(180deg, #E94B4B 0%, #C9302C 100%)",
              boxShadow:
                "0 6px 18px rgba(201,48,44,0.35), 0 1px 0 rgba(255,255,255,0.18) inset",
              transition: `filter ${TRANSITION}, transform 150ms ease`,
            }}
          >
            Book Tutoring
          </button>
        </div>
      </nav>
    </div>
  );
}
