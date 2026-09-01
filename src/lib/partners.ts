// PARTNER TYPES + COPY — client-safe. The server functions live in partners.functions.ts; this
// file holds what both sides need (shapes, the org slug rule, and the shared copy).
//
// COPY PRINCIPLE, applied everywhere below: state the PROBLEM first, then what the partner can do
// about it for their students. Campus surfaces name the course ("ACCY 201 at Ole Miss is where
// GPAs quietly slip."); national and generic surfaces stay course-neutral ("Intro accounting is
// where GPAs quietly slip.") and describe the offer as "free intro accounting exam prep", because
// "Exam 1" means nothing to someone who has not yet seen a campus page.

import { nbspCode } from "@/lib/course-code";

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

// ── WHO FEELS WHAT ────────────────────────────────────────────────────────────────────────────
// FEAR FOR THE OWNER OF THE GRADE, LIFT FOR THE OWNER OF THE SYSTEM.
//
// A student and a chapter member own the grade that is slipping, so their pages name the fear:
// "ACCY 201 at Ole Miss is where GPAs quietly slip." A COUNCIL officer owns the system, not the
// grade — nobody's transcript is on the line in that room, and telling them their chapters are
// failing is an accusation, not an offer. Council surfaces lead with the lift they can create:
// "Raise GPAs across every chapter." Same product, opposite emotional address; do not swap them.

/** THE ONE PROBLEM LINE — for the people who own the grade (solo + chapter pages). Campus
 *  surfaces pass a course + school; everything else gets the course-neutral version. */
export const problemHeadline = (code?: string | null, school?: string | null) =>
  code && school ? `${code} at ${school} is where GPAs quietly slip.` : "Intro accounting is where GPAs quietly slip.";

/** THE LIFT LINE — for the people who own the system (council pages). */
export const liftHeadline = () => "Raise GPAs across every chapter.";

/** The council sub, naming the course exactly once in this block (the headline carries none). */
export const liftSubhead = (code?: string | null) =>
  code
    ? `Share a free resource for ${nbspCode(code)} — the weed-out course where GPAs quietly slip.`
    : "Share a free resource for your campus's intro accounting course — the weed-out course where GPAs quietly slip.";

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

/** THE GROUP-CHAT POST — one message, every chapter's own link, ready to paste.
 *
 *  Written to be READ ON A PHONE IN A GROUP CHAT: no subject line, no salutation ceremony, no
 *  signature block. The credential sits at the bottom because a group chat reads top-down and the
 *  links are what people are scrolling for.
 *
 *  Deliberately NOT stamped with ?via=: this message gets pasted, forwarded and retyped, and a
 *  query string that survives one hop and not the next produces attribution that is confidently
 *  wrong. The campaign email keeps its stamp because it is sent once, from one place. */
export function councilChapterLinksPost(d: {
  courseCode: string | null;
  chapters: Array<{ name: string; letters?: string | null; url: string }>;
}): string {
  const course = d.courseCode ?? "intro accounting";
  return [
    `Hey all — free exam prep for ${course}, the first exam is completely free. Each chapter has its own link:`,
    ``,
    // ── ONE CHAPTER, TWO LINES, A BLANK LINE BETWEEN ─────────────────────────────────────────
    // These were "Name — url" on one line each, which in a chat client is eighteen consecutive
    // lines of near-identical text: a wall. A president scanning for her own house cannot find
    // it. Name on its own line, link under it, blank line between entries — longer, and
    // scannable, which is the trade worth making. Nobody reads this top to bottom; they hunt for
    // one row.
    ...d.chapters.flatMap((c) => [c.name, c.url.replace("https://", ""), ``]),
    `Made by a tutor who's worked with 1,000+ accounting students.`,
    ``,
    LEE_SIGNOFF,
  ].join("\n");
}

/** THE SIGN-OFF ON EVERY PASTEABLE MESSAGE.
 *
 *  A person, with a name and a number — not a support line. An exec pasting this into her
 *  presidents' chat is putting her own credibility behind it, and "Questions? Text Lee Ingram,
 *  the tutor behind it" is what makes the thing she pasted answerable by a human rather than a
 *  brand. One constant so a message can never ship without it, and so the number can never drift
 *  from the one in the footer. */
export const LEE_SIGNOFF = `Questions? Text Lee Ingram, the tutor behind it — ${LEE_PHONE_DISPLAY}`;

/** THE PORTAL POST — the primary council share, and one link rather than a wall of them.
 *
 *  ── WHY ONE LINK BEATS EIGHTEEN ───────────────────────────────────────────────────────────
 *  The bulk post asks a president to find her own row in a list of eighteen near-identical
 *  lines, in a group chat, on a phone. The failure it invites is not "she gives up" — it is
 *  worse than that: she taps the wrong chapter's link and lands on somebody else's page, and
 *  every member she then forwards it to is counted against the wrong house. One portal link
 *  cannot be mis-tapped: every chapter finds itself, and the picker is the only thing that
 *  decides which page anyone lands on.
 *
 *  The bulk version stays, as a secondary, for councils who prefer it. */
export function councilPortalPost(d: {
  courseCode: string | null;
  schoolName: string;
  /** The /s/<campus> portal, already carrying any ref. */
  portalUrl: string;
}): string {
  const course = d.courseCode ?? "intro accounting";
  return [
    `Free ${course} exam prep for every chapter — the whole first exam, no cost, nothing to buy.`,
    ``,
    `Cram videos + practice questions for what's actually on Exam 1.`,
    `Built by a tutor who's worked with 1,000+ students.`,
    ``,
    `Your chapter finds itself here:`,
    d.portalUrl.replace("https://", ""),
    ``,
    LEE_SIGNOFF,
  ].join("\n");
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
