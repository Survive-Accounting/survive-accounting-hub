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

/** The public phone, shown in full on partner secondary CTAs — a number is more concrete and more
 *  reachable than "Questions? Text Lee". Href form and display form kept together so they agree. */
export const LEE_SMS_HREF = "sms:+16625658818";
export const LEE_PHONE_DISPLAY = "(662) 565-8818";

const ORIGIN = "https://surviveaccounting.com";

// ── SHARE COPY ───────────────────────────────────────────────────────────────────────────────
// Ready-to-send words for the "Share with chapters" modal and the on-page tools. Personalized with
// what the page already knows (council/campus/course, or org). One source so the modal and any
// on-page copy can never disagree.

/** The email a council officer sends their chapter presidents. */
export function councilPresidentEmail(d: { councilName: string; schoolName: string; courseCode: string | null; schoolSlug: string }): string {
  const course = d.courseCode ?? "intro accounting";
  return [
    `Subject: Free ${course} exam prep for your chapter`,
    ``,
    `Hey all,`,
    ``,
    `${course} hits a lot of our members at once. Survive Accounting makes ${course} cram videos and practice exams for ${d.schoolName} students, and Exam 1 is free for every member — no cost to the chapter.`,
    ``,
    `Every chapter has its own page. Send yours to your members:`,
    `${ORIGIN}/chapters?school=${d.schoolSlug}`,
    ``,
    `Takes a minute. Worth it if it saves a few grades.`,
    ``,
    `— ${d.councilName} Academics`,
  ].join("\n");
}

/** The group-chat line for a council presidents' chat. */
export function councilGroupMessage(d: { schoolName: string; courseCode: string | null; schoolSlug: string }): string {
  const course = d.courseCode ?? "intro accounting";
  return `Free ${course} exam prep for the house ⚡ Exam 1 is free for every member. Each chapter has its own page — find yours: ${ORIGIN}/chapters?school=${d.schoolSlug}`;
}

/** The email a national officer sends down the chain to chapter leaders. */
export function nationalLeaderEmail(d: { orgShort: string; totalCampuses: number }): string {
  return [
    `Subject: Free intro accounting exam prep for ${d.orgShort} chapters`,
    ``,
    `Hi all,`,
    ``,
    `Sharing something your chapters can use this semester. Survive Accounting makes intro accounting cram videos and practice exams matched to the course each campus actually teaches. Exam 1 is free for every member.`,
    ``,
    `${d.orgShort} chapters on ${d.totalCampuses} campuses already have their own pages. Chapters find theirs here:`,
    `${ORIGIN}/chapters`,
    ``,
    `No cost to the organization.`,
    ``,
    `— ${d.orgShort}`,
  ].join("\n");
}

/** The short national message for a chapter social / group chat. */
export function nationalMessage(d: { orgShort: string }): string {
  return `Free intro accounting exam prep for every ${d.orgShort} chapter ⚡ matched to your campus's own course — find your chapter: ${ORIGIN}/chapters`;
}
