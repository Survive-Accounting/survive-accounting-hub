// Pure, dependency-free helpers shared by the Growth Admin server functions and
// UI. No Supabase, no server-only imports — safe to unit test and to import from
// either bundle.

export type CouncilInfo = { slug: string; name: string };

// campus_greek_chapters.council is free text ("IFC" / "ifc" / "Interfraternity
// Council" all coexist). Normalise to a canonical council slug, mirroring the
// greek-councils registry. Anything unrecognised falls to "other".
// Order matters: NPHC's full name ("National Pan-Hellenic Council") contains the
// substring "panhellenic", so NPHC must be tested before Panhellenic. IFC is last
// and uses only distinctive needles — a bare "nic" would false-match "panhelleNIC".
const COUNCIL_DEFS: { slug: string; name: string; needles: string[] }[] = [
  {
    slug: "nphc",
    name: "NPHC",
    needles: ["nphc", "nationalpanhelleniccouncil", "divinenine", "d9"],
  },
  { slug: "mgc", name: "MGC", needles: ["mgc", "multicultural", "nalfo", "napa", "nmgc"] },
  { slug: "panhellenic", name: "Panhellenic", needles: ["panhellenic", "cpc"] },
  { slug: "ifc", name: "IFC", needles: ["ifc", "interfraternity"] },
];

export function councilSlugOf(raw: string | null | undefined): CouncilInfo {
  const v = (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const d of COUNCIL_DEFS) {
    if (d.needles.some((n) => v.includes(n.replace(/[^a-z0-9]/g, ""))))
      return { slug: d.slug, name: d.name };
  }
  return { slug: "other", name: "Other" };
}

/** Mirror of partners.ts orgSlugify — "Kappa Kappa Gamma" -> "kappa-kappa-gamma". */
export function orgSlugify(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The Intro 1 course code is THE "student-ready" signal. Read it out of the
 *  messy course_family_codes_json (string or array shapes both occur). */
export function intro1Code(codesJson: unknown): string | null {
  if (!codesJson || typeof codesJson !== "object") return null;
  const v = (codesJson as Record<string, unknown>).intro_1;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length && typeof v[0] === "string") return String(v[0]);
  return null;
}
