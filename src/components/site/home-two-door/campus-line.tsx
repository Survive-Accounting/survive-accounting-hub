// THE CAMPUS LINE — "for ALABAMA students" on the homepage, "for ALPHA DELTA CHI · ALABAMA" on a
// chapter page. One small type treatment, shared, because those two lines sit in the SAME slot of
// the SAME hero (headline → promise → campus line → chips) and must never drift apart: the
// chapter page is a homepage that knows which house you came from.
//
// The CSS lives here as a string that BOTH stylesheets include (TWO_DOOR_CSS and MARKETING_CSS),
// so there is exactly one definition of the rules no matter which page mounts.
import * as React from "react";

import { BRAND_DISPLAY } from "@/components/canvas/brand";

export const CAMPUS_LINE_CSS = `
.sa-campus-line { font-size: 13px; font-weight: 900; letter-spacing: 0.08em; color: var(--brand-cream); max-width: 34ch; text-wrap: balance; }
.sa-campus-line-for { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.55; text-transform: none; }
.sa-campus-line-em { opacity: 0.92; white-space: nowrap; }
.sa-campus-line-dot { opacity: 0.45; }
`;

/** The line itself. Callers compose the spans with <CampusFor>/<CampusEm>/<CampusDot>. */
export function CampusLine({ children, className = "mt-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`sa-campus-line ${className}`} style={{ fontFamily: BRAND_DISPLAY }}>
      {children}
    </p>
  );
}

/** Quiet connective tissue — "for ", " students". Deliberately smaller and dimmer than the name. */
export const CampusFor = ({ children }: { children: React.ReactNode }) => (
  <span className="sa-campus-line-for">{children}</span>
);

/** The thing being named — a campus or a chapter. `color` wears the school's own primary. */
export const CampusEm = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <span className="sa-campus-line-em" style={color ? { color } : undefined}>{children}</span>
);

export const CampusDot = () => <span className="sa-campus-line-dot" aria-hidden> · </span>;
