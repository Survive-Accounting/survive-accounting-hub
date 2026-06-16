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
  families: CourseFamilyKey[];
  authorsContains: string;
  publisherContains: string;
  // Include campuses missing textbook data for the selected family. Helps
  // audit coverage gaps when reviewing an audience.
  includeBlanks?: boolean;
}

export const DEFAULT_AUDIENCE_FILTERS: AudienceFilters = {
  ...DEFAULT_CAMPUS_FILTERS,
  families: [],
  authorsContains: "",
  publisherContains: "",
  includeBlanks: false,
};

function getFamilyEntries(c: Campus) {
  return (c.course_family_textbooks_json ?? {}) as Record<
    string,
    { isbn13?: string; title?: string; authors?: string; publisher?: string }
  >;
}

export function getTextbookDisplay(
  c: Campus,
  families: CourseFamilyKey[],
): string {
  const tb = getFamilyEntries(c);
  const keys = families.length
    ? families
    : (Object.keys(tb) as CourseFamilyKey[]);
  for (const k of keys) {
    const e = tb[k];
    if (!e) continue;
    const title = (e.title ?? "").trim();
    const authors = (e.authors ?? "").trim();
    if (title || authors) return [title, authors].filter(Boolean).join(" — ");
  }
  return "";
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
    const keys = families.length
      ? families
      : (Object.keys(tb) as CourseFamilyKey[]);
    let hasAnyEntry = false;
    for (const k of keys) {
      const entry = tb[k];
      if (!entry) continue;
      hasAnyEntry = true;
      const authors = (entry.authors ?? "").toLowerCase();
      const publisher = (entry.publisher ?? "").toLowerCase();
      const okA = !aq || authors.includes(aq);
      const okP = !pq || publisher.includes(pq);
      if (okA && okP) return true;
    }
    // Show blanks for audit purposes (only when text filters are off, since
    // those filters are inherently exclusionary against missing data).
    if (f.includeBlanks && !aq && !pq && !hasAnyEntry) return true;
    return false;
  });
}

export function normalizeAudienceFilters(input: unknown): AudienceFilters {
  const f = (input ?? {}) as Partial<AudienceFilters>;
  return {
    ...DEFAULT_AUDIENCE_FILTERS,
    ...f,
    families: Array.isArray(f.families) ? (f.families as CourseFamilyKey[]) : [],
    authorsContains: typeof f.authorsContains === "string" ? f.authorsContains : "",
    publisherContains: typeof f.publisherContains === "string" ? f.publisherContains : "",
    includeBlanks: !!f.includeBlanks,
  };
}
