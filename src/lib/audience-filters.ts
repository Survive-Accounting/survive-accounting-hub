// Audience filters: campus-level filter set saved on outreach_audiences.
// Built on top of the existing CampusFilters from outreach-mock, with extra
// textbook-audit-style predicates (course families, authors, publisher).

import {
  DEFAULT_CAMPUS_FILTERS,
  applyFilters,
  type CampusFilters,
  type Campus,
} from "@/lib/outreach-mock";

export type CourseFamilyKey =
  | "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";

export interface AudienceFilters extends CampusFilters {
  // Which course families a campus must have textbook data for. Empty = no
  // family filter applied. A campus passes if ANY selected family has matching
  // textbook metadata (or the campus has the family in course_codes when no
  // textbook json — but to keep it tight we require json).
  families: CourseFamilyKey[];
  // Substring match (case-insensitive) on any family's detected authors.
  authorsContains: string;
  // Substring match (case-insensitive) on any family's detected publisher.
  publisherContains: string;
}

export const DEFAULT_AUDIENCE_FILTERS: AudienceFilters = {
  ...DEFAULT_CAMPUS_FILTERS,
  families: [],
  authorsContains: "",
  publisherContains: "",
};

function getFamilyEntries(c: Campus) {
  return (c.course_family_textbooks_json ?? {}) as Record<
    string,
    { isbn13?: string; title?: string; authors?: string; publisher?: string }
  >;
}

export function applyAudienceFilters(
  campuses: Campus[],
  f: AudienceFilters,
): Campus[] {
  const base = applyFilters(campuses, f);
  const aq = f.authorsContains.trim().toLowerCase();
  const pq = f.publisherContains.trim().toLowerCase();
  const families = f.families ?? [];
  if (!families.length && !aq && !pq) return base;
  return base.filter((c) => {
    const tb = getFamilyEntries(c);
    const keys = families.length ? families : (Object.keys(tb) as CourseFamilyKey[]);
    for (const k of keys) {
      const entry = tb[k];
      if (!entry) continue;
      const authors = (entry.authors ?? "").toLowerCase();
      const publisher = (entry.publisher ?? "").toLowerCase();
      const okA = !aq || authors.includes(aq);
      const okP = !pq || publisher.includes(pq);
      if (okA && okP) return true;
    }
    return false;
  });
}

// Migrate a stored filters_json blob (possibly older shape) to AudienceFilters.
export function normalizeAudienceFilters(input: unknown): AudienceFilters {
  const f = (input ?? {}) as Partial<AudienceFilters>;
  return {
    ...DEFAULT_AUDIENCE_FILTERS,
    ...f,
    families: Array.isArray(f.families) ? (f.families as CourseFamilyKey[]) : [],
    authorsContains: typeof f.authorsContains === "string" ? f.authorsContains : "",
    publisherContains: typeof f.publisherContains === "string" ? f.publisherContains : "",
  };
}
