// THE CHAIR PAGE'S WORDS AND LINKS — pure, so the copy that goes out in DMs is testable without
// a browser (see chair-promo.test.ts). ChairPromo.tsx renders these.
//
// WHO THIS IS FOR (Lee, 2026-09-11): "/go/ is strictly for promotion to the IFC or chapter
// scholarship chairs." Students never land here on purpose — their page is /learn. So every line
// speaks to the chair about THEIR members (or, for a council, every chapter's members).
import { SHARE_ORIGIN, buildShareUrl } from "@/lib/share-url";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { nbspCode } from "@/lib/course-code";

export type ChairKind = "chapter" | "council";

/** "Boost ΑΤΩ's GPA in ACCT 200." / "Boost every chapter's GPA in ACCT 200." — the one place on
 *  the page the course code appears (ONE-CODE RULE, see two-door-copy.ts). Without a verified
 *  code it degrades honestly to "intro accounting". */
export function chairHeadline(kind: ChairKind, letters: string, code: string | null): string {
  const who = kind === "council" ? "every chapter's" : `${letters}'s`;
  return `Boost ${who} GPA in ${code ? nbspCode(code) : "intro accounting"}.`;
}

/** The line under the headline (Lee's wording, 2026-09-11). "Reels" is what the home page
 *  highlights, and ChairPromo renders it the same way. No course code here — the headline spent it. */
export function chairSubhead(kind: ChairKind): string {
  const who = kind === "council" ? "Every chapter's members" : "Members";
  return `Like Reels for exam prep. ${who} get cram videos and practice exams proven to boost scores quickly.`;
}

/** The quiet line at the top — "For Alpha Tau Omega · Tennessee". */
export function chairForLine(name: string, schoolName: string): string {
  return `For ${name} · ${schoolName}`;
}

/** THE STUDENT LINK the chair hands out — /learn, never /go. A chapter link opens the chapter's
 *  own page (letters over the bolt, every email carries the chapter); a council link opens the
 *  campus page with the chapter bar preset to that council so each member picks their house. */
export function chairShareUrl(kind: ChairKind, schoolId: string, slug: string, ref?: string | null): string {
  const base = kind === "council"
    ? `${SHARE_ORIGIN}/learn/${schoolId}?c=${encodeURIComponent(slug)}`
    : buildShareUrl({ campus: schoolId, chapter: slug });
  // THE REF TRAVELS (Lee, 2026-09-11: "the links that they then share are also the same, passed
  // down the line, and … trackable"): the chair arrived on a DM link with ?ref=<contact>; what
  // they hand their members carries the same ref, so every /learn visit down the line attributes
  // to that chair on the DM console.
  return ref ? `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}` : base;
}

/** The same destination, relative — what the left door opens in a new tab. */
export function chairLearnPath(kind: ChairKind, schoolId: string, slug: string, ref?: string | null): string {
  return chairShareUrl(kind, schoolId, slug, ref).slice(SHARE_ORIGIN.length);
}

/** The GroupMe post — the /learn bar's wording, so a chair and a member post the same thing. */
export function chairGroupMe(kind: ChairKind, courseCode: string | null, url: string, shortName: string): string {
  return chapterGroupMe({ courseCode, url, chapter: kind === "council" ? null : shortName });
}

/** Print + projector artwork. A council gets the slide only (Lee: "For IFC councils… they just
 *  need the meeting slide"); a chapter gets the flyer for the house and the meeting slide. */
export function chairArtwork(kind: ChairKind, schoolSlug: string, slug: string): { flyer: string | null; slide: string; slidePreview: string } {
  if (kind === "council") {
    const base = `/api/slide/${schoolSlug}/council/${slug}`;
    return { flyer: null, slide: `${base}?pdf=1`, slidePreview: base };
  }
  const base = `/api/flyer/${schoolSlug}/${slug}`;
  return { flyer: base, slide: `${base}?f=slide&pdf=1`, slidePreview: `${base}?f=slide` };
}

/** The three value cards, in the chair's words (Lee, 2026-09-11). "members" becomes "everyone"
 *  on a council page, where the chair does not have members of their own. */
export function chairValueCards(kind: ChairKind): Array<{ title: string; copy: string }> {
  const m = kind === "council" ? "everyone" : "your members";
  const mp = kind === "council" ? "everyone's" : "your members'";
  const needs = kind === "council" ? "needs" : "need";
  return [
    { title: "2-minute cram videos", copy: `Fast explanations for the problems ${m} actually ${needs} to know.` },
    { title: "Practice exams", copy: `Exam-style questions that teach ${m} to recognize the pattern before test day.` },
    { title: "Built for the course", copy: `Matched to ${mp} course. If anything's missing, they can request it.` },
  ];
}
