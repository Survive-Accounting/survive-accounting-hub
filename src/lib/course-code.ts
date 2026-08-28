// COURSE-CODE DISPLAY RULE (homepage-final-mile H1, 2026-08-28).
//
// A course code is ONE token on screen: "ACCY 201" renders with a non-breaking space so "201"
// can never wrap onto its own line. Apply this at every render site (hero, cards, plate, player
// identity, modals, greek pages) — never in DATA (share messages, analytics, queries), where a
// real space must survive.
export const nbspCode = (code: string): string => code.replace(/ /g, "\u00A0");

/** Convenience for nullable codes at render sites. */
export const nbspCodeOrNull = (code: string | null | undefined): string | null =>
  code == null ? null : nbspCode(code);
