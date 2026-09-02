// THE LAUNCH PROMISE — one constant, every surface.
//
// This renders on the landing page where strangers read it, so a missed promise costs more
// trust than a vaguer one ever would. It lives here alone so changing it is one edit and
// cannot drift between the poster, the notify modal and any future email.
//
// 2026-08-16: widened from "Monday, August 24" to the SEASON. A named day is a promise you
// can miss by a day; a season is one you keep. The exact-date machinery that used to live
// here (an ISO value with the weekday derived from it, so the two could never disagree) is
// gone with it — keeping a stale "2026-08-24" around while the page said something else
// would be exactly the drift this file exists to prevent.
export const LAUNCH_WINDOW = "Fall 2026";

/** The full launch line: "Coming Fall 2026". */
export const LAUNCH_LINE = `Coming ${LAUNCH_WINDOW}`;

/** EXAM 1S PUBLIC RELAUNCH WINDOW. The new Exam 1 prep is being rebuilt privately, and the public
 *  homepage promises it here. A WINDOW, not a named day (2026-09-02): the pinned September 1 came
 *  and went while the rebuild was still private, and a promise the page has already missed costs
 *  more trust than a vaguer one keeps. One constant, so the door card, the notify record and any
 *  future email can never disagree. If the window moves, change it here and nowhere else. */
export const EXAM1_LAUNCH_LABEL = "Early September";

/** THE FLAGSHIP CAMPUS (homepage-final-mile, 2026-08-28). The homepage leads with ONE campus
 *  story; campus #2 is a data change here, not a redesign. Display strings + colors only —
 *  ids (campusId etc.) still resolve through the canonical school table via `id`. The hero
 *  falls back to these when the visitor's campus is unknown; a known campus still wins. */
export const HOME_CAMPUS = {
  /** Picker id in src/lib/schools (resolves campusId, slug, etc.). */
  id: "ole-miss",
  name: "Ole Miss",
  courseCode: "ACCY 201",
  /** School colors for the campus line — crimson on the navy page, navy secondary. */
  colors: { primary: "#CE1126", secondary: "#14213D" },
} as const;

/** Source tag for everything captured by the landing page's "Get notified" flow. */
export const NOTIFY_SOURCE = "landing-notify";

/** Is the given contact string an email or a phone? One field on screen, so the shape has to
 *  be inferred. Deliberately permissive on phones — students type them every which way, and
 *  rejecting a real number to enforce a format would cost a signup for nothing. */
export function contactKind(raw: string): "email" | "phone" | "unknown" {
  const s = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "email";
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15 && /^[\d\s().+-]+$/.test(s)) return "phone";
  return "unknown";
}
