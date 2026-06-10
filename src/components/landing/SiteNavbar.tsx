import { useEffect, useState } from "react";

interface SiteNavbarProps {
  onLoginClick?: () => void;
}

const LOGO_URL =
  "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

export default function SiteNavbar({ onLoginClick }: SiteNavbarProps) {
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

        <a
          href="/"
          className="relative inline-flex items-center"
          aria-label="Survive Accounting — home"
        >
          <img
            src={LOGO_URL}
            alt="Survive Accounting"
            className="h-5 sm:h-[22px] w-auto object-contain select-none"
            draggable={false}
          />
        </a>

        <div className="relative flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={onLoginClick}
            className="text-[13px] font-medium"
            style={{
              color: "rgba(255,255,255,0.85)",
              fontFamily: "Inter, sans-serif",
              transition: `color ${TRANSITION}`,
            }}
          >
            Log in
          </button>
        </div>
      </nav>
    </div>
  );
}
