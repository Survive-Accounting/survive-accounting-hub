const FOOTER_BG = "#0f172a";
const LOGO_URL =
  "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

interface SiteFooterProps {
  onScrollToContact?: () => void;
  onScrollToReviews?: () => void;
  onBookTutoring?: () => void;
}

export default function SiteFooter({
  onScrollToContact,
  onScrollToReviews,
  onBookTutoring,
}: SiteFooterProps) {
  const linkClass = "text-[13px] no-underline hover:underline transition-colors";
  const linkStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter, sans-serif",
  };

  return (
    <footer style={{ background: FOOTER_BG }}>
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <a
            href="/"
            aria-label="Survive Accounting — home"
            className="inline-flex items-center hover:opacity-90 transition-opacity"
          >
            <img
              src={LOGO_URL}
              alt="Survive Accounting"
              className="h-5 sm:h-[22px] w-auto object-contain select-none"
              draggable={false}
            />
          </a>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="sms:+16625658818" className={linkClass} style={linkStyle}>
              Text Lee
            </a>
            {onScrollToReviews && (
              <button onClick={onScrollToReviews} className={linkClass} style={linkStyle}>
                Reviews
              </button>
            )}
            {onScrollToContact && (
              <button onClick={onScrollToContact} className={linkClass} style={linkStyle}>
                Contact
              </button>
            )}
            {onBookTutoring && (
              <button onClick={onBookTutoring} className={linkClass} style={linkStyle}>
                Book Tutoring
              </button>
            )}
          </nav>
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p
            className="text-[11px]"
            style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}
          >
            © {new Date().getFullYear()} Earned Wisdom, LLC · Created by Lee Ingram
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/privacy"
              className="text-[11px] hover:underline"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="text-[11px] hover:underline"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
