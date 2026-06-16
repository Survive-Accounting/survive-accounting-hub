// Supported textbook family matcher.
//
// Replaces the old "campus has ANY isbn13" check with a real keyword-based
// match against the `supported_textbook_families` table. Editions are
// ignored unless a family is flagged edition_sensitive.

import { supabase } from "@/integrations/supabase/client";
import type { Campus } from "@/lib/outreach-mock";

export type CourseFamilyKey =
  | "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";

export interface SupportedTextbookFamily {
  id: string;
  course_family: string;
  label: string;
  publisher_keywords: string[];
  title_keywords: string[];
  author_keywords: string[];
  isbn13_prefixes: string[];
  edition_sensitive: boolean;
  active: boolean;
  notes: string | null;
}

export type TextbookMatchStatus = "matched" | "unmatched" | "unknown";

export interface TextbookMatchResult {
  status: TextbookMatchStatus;
  matched_textbook_family_id: string | null;
  matched_label: string | null;
  textbook_match_reason: string | null;
  textbook_match_source_url: string | null;
  textbook_match_confidence: number; // 0..1
}

export interface CampusFamilyTextbook {
  title?: string | null;
  authors?: string | null;
  publisher?: string | null;
  isbn13?: string | null;
  source?: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function anyKeywordHits(haystack: string, keywords: string[]): string[] {
  if (!haystack || keywords.length === 0) return [];
  return keywords.filter((k) => k && haystack.includes(norm(k)));
}

/** True if there's enough textbook metadata to attempt a match. */
function hasAnySignal(tb: CampusFamilyTextbook | null | undefined): boolean {
  if (!tb) return false;
  return !!(tb.title || tb.authors || tb.publisher || tb.isbn13);
}

/** Match one detected campus textbook against the supported families list. */
export function matchTextbookFamily(
  detected: CampusFamilyTextbook | null | undefined,
  courseFamily: string,
  families: SupportedTextbookFamily[],
): TextbookMatchResult {
  if (!hasAnySignal(detected)) {
    return {
      status: "unknown",
      matched_textbook_family_id: null,
      matched_label: null,
      textbook_match_reason: "No textbook metadata detected for this course family.",
      textbook_match_source_url: detected?.source ?? null,
      textbook_match_confidence: 0,
    };
  }

  const title = norm(detected!.title);
  const authors = norm(detected!.authors);
  const publisher = norm(detected!.publisher);

  const candidates = families.filter(
    (f) => f.active && f.course_family === courseFamily,
  );

  let best: { fam: SupportedTextbookFamily; score: number; reasons: string[] } | null = null;

  for (const fam of candidates) {
    const authorHits = anyKeywordHits(authors, fam.author_keywords);
    const titleHits = anyKeywordHits(title, fam.title_keywords);
    const pubHits = anyKeywordHits(publisher, fam.publisher_keywords);

    // Scoring: authors are the strongest signal. Title + publisher together
    // also match. A single author hit OR (title + publisher) qualifies.
    let score = 0;
    if (authorHits.length >= 2) score += 0.7;
    else if (authorHits.length === 1) score += 0.5;
    if (titleHits.length >= 2) score += 0.25;
    else if (titleHits.length === 1) score += 0.15;
    if (pubHits.length >= 1) score += 0.2;

    if (score < 0.5) continue;

    const reasons: string[] = [];
    if (authorHits.length) reasons.push(`authors: ${authorHits.join(", ")}`);
    if (titleHits.length) reasons.push(`title: ${titleHits.join(", ")}`);
    if (pubHits.length) reasons.push(`publisher: ${pubHits.join(", ")}`);

    if (!best || score > best.score) best = { fam, score, reasons };
  }

  // ISBN-13 prefix fallback: if no keyword match (or there were no
  // title/authors/publisher signals at all), an ISBN whose leading digits
  // match a family's known publisher prefix is treated as a weak match.
  const normIsbn = (detected!.isbn13 ?? "").replace(/[^0-9]/g, "");
  if (!best && normIsbn) {
    let isbnBest: { fam: SupportedTextbookFamily; prefix: string } | null = null;
    for (const fam of candidates) {
      const prefixes = fam.isbn13_prefixes ?? [];
      const hit = prefixes.find((p) => p && normIsbn.startsWith(p));
      if (hit && (!isbnBest || hit.length > isbnBest.prefix.length)) {
        isbnBest = { fam, prefix: hit };
      }
    }
    if (isbnBest) {
      return {
        status: "matched",
        matched_textbook_family_id: isbnBest.fam.id,
        matched_label: isbnBest.fam.label,
        textbook_match_reason: `isbn13 prefix match: ${isbnBest.prefix}… → ${isbnBest.fam.label}`,
        textbook_match_source_url: detected!.source ?? null,
        textbook_match_confidence: 0.6,
      };
    }
  }

  if (!best) {
    return {
      status: "unmatched",
      matched_textbook_family_id: null,
      matched_label: null,
      textbook_match_reason:
        "Detected textbook (" +
        [detected!.title, detected!.authors, detected!.publisher, detected!.isbn13]
          .filter(Boolean).join(" · ") +
        ") did not match any supported family.",
      textbook_match_source_url: detected!.source ?? null,
      textbook_match_confidence: 0,
    };
  }

  return {
    status: "matched",
    matched_textbook_family_id: best.fam.id,
    matched_label: best.fam.label,
    textbook_match_reason: best.reasons.join("; "),
    textbook_match_source_url: detected!.source ?? null,
    textbook_match_confidence: Math.min(1, best.score),
  };
}

let _familiesCache: { ts: number; rows: SupportedTextbookFamily[] } | null = null;
const CACHE_MS = 60_000;

export async function getSupportedTextbookFamilies(force = false): Promise<SupportedTextbookFamily[]> {
  if (!force && _familiesCache && Date.now() - _familiesCache.ts < CACHE_MS) {
    return _familiesCache.rows;
  }
  const { data, error } = await supabase
    .from("supported_textbook_families" as never)
    .select("*")
    .eq("active", true);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as SupportedTextbookFamily[]).map((r) => ({
    ...r,
    publisher_keywords: r.publisher_keywords ?? [],
    title_keywords: r.title_keywords ?? [],
    author_keywords: r.author_keywords ?? [],
    isbn13_prefixes: r.isbn13_prefixes ?? [],
  }));
  _familiesCache = { ts: Date.now(), rows };
  return rows;
}

/** True if ANY of the requested course families on the campus has a matched book. */
export function campusHasSupportedTextbook(
  campus: Campus,
  families: SupportedTextbookFamily[],
  requireFamilies: CourseFamilyKey[] = ["intro_1", "intro_2"],
): boolean {
  const tb = (campus.course_family_textbooks_json ?? {}) as Record<string, CampusFamilyTextbook>;
  return requireFamilies.some((fam) => {
    const detected = tb[fam];
    if (!detected) return false;
    return matchTextbookFamily(detected, fam, families).status === "matched";
  });
}

export interface TextbookAuditRow {
  campus_id: string;
  campus_name: string;
  course_family: string;
  course_code: string | null;
  detected_title: string | null;
  detected_publisher: string | null;
  detected_authors: string | null;
  detected_isbn13: string | null;
  old_status: "matched" | "unmatched" | "unknown"; // old = "has any isbn13"
  new_status: TextbookMatchStatus;
  matched_label: string | null;
  match_reason: string | null;
  source_url: string | null;
  match_confidence: number;
}

/** Run a per-campus / per-family audit for the four core families. */
export async function runTextbookMatchAudit(
  campuses: Campus[],
): Promise<TextbookAuditRow[]> {
  const families = await getSupportedTextbookFamilies(true);
  const rows: TextbookAuditRow[] = [];
  const FAMILIES: CourseFamilyKey[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

  for (const c of campuses) {
    if ((c as any).archived) continue;
    const tb = (c.course_family_textbooks_json ?? {}) as Record<string, CampusFamilyTextbook>;
    const codes = (c as any).course_family_codes_json as Record<string, string> | null;

    // Old status: campus is "matched" if ANY family has an isbn13.
    const oldCampusMatched = Object.values(tb).some(
      (v) => v && typeof v === "object" && (v as any).isbn13,
    );

    for (const fam of FAMILIES) {
      const detected = tb[fam];
      const result = matchTextbookFamily(detected, fam, families);

      // Per-family "old" status mirrors the old isbn13-only campus rule:
      // had ISBN → matched; had partial data but no ISBN → unmatched;
      // nothing → unknown.
      let oldFamilyStatus: "matched" | "unmatched" | "unknown" = "unknown";
      if (detected?.isbn13) oldFamilyStatus = "matched";
      else if (hasAnySignal(detected)) oldFamilyStatus = "unmatched";

      rows.push({
        campus_id: c.id,
        campus_name: c.school_name,
        course_family: fam,
        course_code: codes?.[fam] ?? null,
        detected_title: detected?.title ?? null,
        detected_publisher: detected?.publisher ?? null,
        detected_authors: detected?.authors ?? null,
        detected_isbn13: detected?.isbn13 ?? null,
        old_status: oldCampusMatched ? oldFamilyStatus : "unknown",
        new_status: result.status,
        matched_label: result.matched_label,
        match_reason: result.textbook_match_reason,
        source_url: result.textbook_match_source_url,
        match_confidence: result.textbook_match_confidence,
      });
    }
  }
  return rows;
}
