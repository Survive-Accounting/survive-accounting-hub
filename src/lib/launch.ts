// THE LAUNCH DATE — one constant, every surface.
//
// This is a PUBLIC PROMISE. It renders on the landing page where strangers read it, so a
// missed date costs more trust than a vaguer line ever would. It lives here alone so moving
// it is one edit and cannot drift between the card, the modal and any future email.
//
// Confirmed with Lee on 2026-08-15: Monday, August 24. He may ship sooner; the page must
// never promise EARLIER than this date.
export const LAUNCH_DATE_ISO = "2026-08-24";

/** "Monday, August 24" — how the date reads to a student. Derived from the ISO value so the
 *  weekday can never disagree with the date, which is the classic way this kind of string
 *  goes wrong after an edit. */
export const LAUNCH_DATE_LABEL = new Date(`${LAUNCH_DATE_ISO}T12:00:00Z`).toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** The full launch line: "Coming Monday, August 24". */
export const LAUNCH_LINE = `Coming ${LAUNCH_DATE_LABEL}`;

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
