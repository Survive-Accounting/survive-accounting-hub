// TWO-DOOR HOMEPAGE — the locked copy, as pure functions (2026-08-27 spec).
//
// Every student-facing string on the two door cards routes through here so the spec's locked
// copy lives in exactly one place and the pieces are testable without rendering. The rules:
//
//  • The left door names the visitor's REAL course code or nothing — "built around your course"
//    is the honest generic, never a plausible invented code (same contract as the hero).
//  • The primary CTA flips to "Continue" only on trustworthy local progress (the guided path's
//    own started flag) — never on a guess.
import { GREEK_PORTAL_ORGS } from "@/components/site/portal-home/greek-portal-orgs";

/** Left door description. `code` must be a VERIFIED course code or null. */
export const soloDoorDescription = (code: string | null): string =>
  code ? `Cram videos + practice built for ${code}.` : "Cram videos + practice built around your course.";

/** Left door primary CTA. `returning` = the visitor has genuinely started Exam 1 here before. */
export const soloDoorCta = (returning: boolean): string =>
  returning ? "Continue Exam 1 →" : "Start Exam 1 Free →";

/** The Greek-letter ticker stream — DERIVED from the one canonical client-side org list
 *  (greek-portal-orgs.ts, which is also Lee's outreach priority order), never a second
 *  hardcoded list that could drift from it. */
export const tickerLetters = (): string[] => GREEK_PORTAL_ORGS.map((o) => o.letters);

/** One ticker line: "ΑΤΩ · ΦΣΚ · …". The marquee renders it twice for a seamless loop. */
export const tickerLine = (): string => tickerLetters().join(" · ");
