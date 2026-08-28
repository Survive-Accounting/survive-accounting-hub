// TWO-DOOR HOMEPAGE — the locked copy, as pure functions.
// (2026-08-27 spec, revised by HOMEPAGE FINAL MILE v2 H1 on 2026-08-28.)
//
// Every student-facing string on the two door cards routes through here so the locked copy
// lives in exactly one place and the pieces are testable without rendering. The rules:
//
//  • The left door names the visitor's REAL course code when known, else the flagship campus
//    config's code (HOME_CAMPUS in lib/launch.ts — the same config the waitlist date lives in).
//  • Course codes render as ONE non-breaking token ("ACCY 201" can never wrap "201" alone).
import { nbspCode } from "@/lib/course-code";
import { HOME_CAMPUS } from "@/lib/launch";

// ── THE ONE-CODE RULE ─────────────────────────────────────────────────────────────────────────
// THE COURSE CODE APPEARS EXACTLY ONCE PER SURFACE BLOCK — headline OR card, never both.
// On the HOME page the hero headline carries it in orange ("ACCY 201 at Ole Miss is where GPAs
// quietly slip."), so the left card's BUTTON must not repeat it — that put the code on screen
// three times in one glance. The card's support line keeps it, because that line is the block's
// one mention. On the CHAPTER page the split is the other way round: the left door's HEADING is
// the code ("SURVIVE AC 210"), so that card's support line drops it.
// Wherever it renders it stays non-breaking and comes from config, never a literal.

/** The course code the homepage speaks: the visitor's verified code, else the flagship
 *  campus's (config, never hardcoded in a component). Always nbsp-joined for display. */
export const homeCourseCode = (resolvedCode: string | null): string =>
  nbspCode(resolvedCode ?? HOME_CAMPUS.courseCode);

/** Left door button. Code-free ON PURPOSE — see the one-code rule above. */
export const soloButtonLabel = (): string => "Start cramming →";

/** Left door support line, two tones: muted sentence + cream "Exam 1 is free." */
export const soloSupport = (resolvedCode: string | null): { muted: string; strong: string } => ({
  muted: `Cram-style videos & practice for ${homeCourseCode(resolvedCode)}.`,
  strong: "Exam 1 is free.",
});

// The Greek-letter ticker helpers that lived here were removed with the ticker itself
// (2026-08-28). GREEK_PORTAL_ORGS is still the canonical org list — the waitlist sheet's
// organization step and /go/demo's glyph both read it.
