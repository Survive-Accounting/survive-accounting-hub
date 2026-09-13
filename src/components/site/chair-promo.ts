// THE CHAIR PAGE'S WORDS AND LINKS — pure, so the copy that goes out in DMs is testable without
// a browser (see chair-promo.test.ts). ChairPromo.tsx renders these.
//
// WHO THIS IS FOR (Lee, 2026-09-11): "/go/ is strictly for promotion to the IFC or chapter
// scholarship chairs." Students never land here on purpose — their page is /learn. So every line
// speaks to the chair about THEIR members (or, for a council, every chapter's members).
import { SHARE_ORIGIN, buildShareUrl } from "@/lib/share-url";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { nbspCode } from "@/lib/course-code";
import { schoolByAny } from "@/lib/schools";

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

const withRefParam = (base: string, ref?: string | null) =>
  // THE REF TRAVELS (Lee, 2026-09-11: "the links that they then share are also the same, passed
  // down the line, and … trackable"): the chair arrived on a DM link with ?ref=<contact>; what
  // they hand on carries the same ref, so every visit down the line attributes to that DM.
  ref ? `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}` : base;

/** THE LINK THE CHAIR HANDS OUT.
 *
 *  A CHAPTER chair shares the chapter's own /learn page — their members land on it, join with an
 *  email, and study. Never /go.
 *
 *  A COUNCIL chair shares ONE link to every chapter's scholarship chair (Lee, 2026-09-13: "if IFC
 *  is sharing a link, we assume it's going to a scholarship chair … pick their chapter from the
 *  pre-filled campus, and then the scholarship chair can begin their stage of the funnel"). That
 *  is the chair portal: /chapters with the campus and council preset. Picking a chapter opens that
 *  chapter's chair page (/go), where the chapter's own funnel starts. */
export function chairShareUrl(kind: ChairKind, schoolId: string, slug: string, ref?: string | null): string {
  if (kind === "council") return withRefParam(councilPortalUrl(schoolId, slug), ref);
  return withRefParam(buildShareUrl({ campus: schoolId, chapter: slug }), ref);
}

/** /chapters?school=<campus slug>&c=<council> — the council's one link (and its slide QR). The
 *  portal speaks campuses.slug; the id is accepted and translated so callers can pass either. */
export function councilPortalUrl(school: string, council: string): string {
  const slug = schoolByAny(school)?.slug ?? school;
  return `${SHARE_ORIGIN}/chapters?school=${encodeURIComponent(slug)}&c=${encodeURIComponent(council)}`;
}

/** What the left door opens in a new tab: the page MEMBERS land on. For a chapter, that chapter's
 *  /learn page; for a council, the campus /learn page with the council preset. */
export function chairLearnPath(kind: ChairKind, schoolId: string, slug: string, ref?: string | null): string {
  const base = kind === "council" ? `/learn/${schoolId}?c=${encodeURIComponent(slug)}` : buildShareUrl({ campus: schoolId, chapter: slug }).slice(SHARE_ORIGIN.length);
  return withRefParam(base, ref);
}

/** The GroupMe post. A chapter's is the /learn bar's wording, so a chair and a member post the
 *  same thing. A council's goes to the scholarship chairs' group chat and sends them to the portal. */
export function chairGroupMe(kind: ChairKind, courseCode: string | null, url: string, shortName: string): string {
  if (kind === "council") return councilChairPost(courseCode, url, shortName);
  return chapterGroupMe({ courseCode, url, chapter: shortName });
}

/** The council → scholarship chairs post. One link, and it says what they get when they open it. */
export function councilChairPost(courseCode: string | null, url: string, councilName: string): string {
  const course = courseCode ?? "intro accounting";
  return [
    `Scholarship chairs — ${councilName} is sharing free ${course} cram videos + practice exams for every chapter. The first exam is completely free for your members.`,
    "",
    "Pick your chapter here to get your members' link and a flyer for the house:",
    url,
  ].join("\n");
}

/** Print + projector artwork. A council gets the slide only (Lee: "For IFC councils… they just
 *  need the meeting slide"); a chapter gets the flyer for the house and the meeting slide. */
export function chairArtwork(kind: ChairKind, schoolSlug: string, slug: string): { flyer: string | null; flyerImage: string | null; slide: string; slidePreview: string } {
  if (kind === "council") {
    const base = `/api/slide/${schoolSlug}/council/${slug}`;
    return { flyer: null, flyerImage: null, slide: `${base}?pdf=1`, slidePreview: base };
  }
  const base = `/api/flyer/${schoolSlug}/${slug}`;
  // flyerImage: the SAME print flyer as vector, which the page rasterises to a PNG in the browser
  // (lib/flyer-image) — the image a chair texts or drops in a GroupMe (Lee, 2026-09-13).
  return { flyer: base, flyerImage: `${base}?f=svg`, slide: `${base}?f=slide&pdf=1`, slidePreview: `${base}?f=slide` };
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
