// GREEK PORTAL — the org rotation, which is ALSO Lee's outreach priority list.
//
// The Greek Portal card on /preview/home and the demo toggle's ADMIN segment both cycle through
// this list, in this order. Reorder the entries to reorder the animation — top of the list is the
// resting state (what a visitor sees before any cycling starts), so the org Lee is courting
// hardest belongs first.
//
// LETTERS ONLY on screen (real Greek characters, not Latin lookalikes); `name` exists so the list
// stays readable while reordering and never renders anywhere.
export type PortalOrg = { letters: string; name: string };

export const GREEK_PORTAL_ORGS: PortalOrg[] = [
  { letters: "ΑΤΩ", name: "Alpha Tau Omega" },
  { letters: "ΦΣΚ", name: "Phi Sigma Kappa" },
  { letters: "ΚΚΓ", name: "Kappa Kappa Gamma" },
  { letters: "ΣΧ", name: "Sigma Chi" },
  { letters: "ΑΔΠ", name: "Alpha Delta Pi" },
  { letters: "ΠΚΑ", name: "Pi Kappa Alpha" },
  { letters: "ΧΩ", name: "Chi Omega" },
  { letters: "ΣΝ", name: "Sigma Nu" },
  { letters: "ΚΔ", name: "Kappa Delta" },
  { letters: "ΦΔΘ", name: "Phi Delta Theta" },
  { letters: "ΔΔΔ", name: "Delta Delta Delta" },
  { letters: "ΚΣ", name: "Kappa Sigma" },
];
