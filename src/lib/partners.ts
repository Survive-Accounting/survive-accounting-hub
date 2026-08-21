// PARTNER TYPES + COPY — client-safe. The server functions live in partners.functions.ts; this
// file holds what both sides need (shapes, the org slug rule, and the shared copy).
//
// COPY PRINCIPLE, applied everywhere below: state the PROBLEM first, then what the partner can do
// about it for their students. Campus surfaces name the course ("ACCY 201 at Ole Miss is where
// GPAs quietly slip."); national and generic surfaces stay course-neutral ("Intro accounting is
// where GPAs quietly slip.") and describe the offer as "free intro accounting exam prep", because
// "Exam 1" means nothing to someone who has not yet seen a campus page.

/** A chapter on a council page — the same identity a /go/ page uses, never a parallel one. */
export type PartnerChapterRow = {
  name: string;
  slug: string;
  letters: string | null;
  nickname: string | null;
  goPath: string;
  claimed: boolean;
};

export type CouncilPartner = {
  schoolSlug: string; schoolName: string;
  councilSlug: string; councilName: string; councilFull: string;
  courseCode: string | null;
  chapters: PartnerChapterRow[];
  totalChapters: number;
  claimedChapters: number;
};

export type NationalCampusRow = {
  schoolSlug: string; schoolName: string;
  courseCode: string | null;
  chapterSlug: string;
  goPath: string;
  claimed: boolean;
};

export type NationalPartner = {
  orgSlug: string; orgName: string; orgShort: string;
  campuses: NationalCampusRow[];
  totalCampuses: number;
  claimedChapters: number;
  codedCampuses: number;
};

/** greek_orgs has no slug column, so a national page's slug is DERIVED from the org name and
 *  matched server-side. Kept here so the link builder and the matcher can never disagree.
 *  "Kappa Kappa Gamma" → "kappa-kappa-gamma"; "Alpha Phi Alpha Fraternity, Inc." →
 *  "alpha-phi-alpha-fraternity-inc". */
export function orgSlugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** THE ONE PROBLEM LINE. Campus surfaces pass a course + school; everything else gets the
 *  course-neutral version — the same sentence the student pages open with. */
export const problemHeadline = (code?: string | null, school?: string | null) =>
  code && school ? `${code} at ${school} is where GPAs quietly slip.` : "Intro accounting is where GPAs quietly slip.";

/** What Survive gives a partner's students, stated the same way on every partner surface. */
export const PARTNER_OFFER = "Free intro accounting exam prep";
