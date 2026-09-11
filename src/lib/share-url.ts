// THE SHARE LINK (Lee, 2026-09-11: "Do not construct links ad hoc in the navbar component.
// Create/reuse a central helper such as buildShareUrl({ campus, chapter, course, exam }). Use only
// context that should legitimately travel with the link. Campus/chapter context is the priority.")
//
// One builder for /learn's Share, its menu and its toast, on the conventions the site already
// uses (no new URL shapes):
//   campus + chapter   https://surviveaccounting.com/go/<school-slug>/<chapter-slug>   (greek-go's
//                      goPath — the chapter's public front door), + ?ref= when the visitor arrived
//                      through a contact link (contact-ref's withRef, never clobbering)
//   campus only        https://surviveaccounting.com/s/<school-slug>                   (the /s hop
//                      that lands on /learn with the campus prefilled), + ?by=<contact> when the
//                      visitor is a person forwarding a contact link (ChapterShareSheet's shape)
//   nothing known      https://surviveaccounting.com/
// Public identifiers only — the school's SLUG (university-of-mississippi), the chapter's SLUG —
// never a campus uuid. Course and exam do NOT travel: no share route reads them, /learn picks the
// exam from what is live, and a link that is wrong about the exam is worse than one that is not.
import { withRef } from "@/lib/contact-ref";
import { goPath } from "@/lib/greek-go.functions";

export const SHARE_ORIGIN = "https://surviveaccounting.com";

export type ShareContext = {
  /** The school's public slug (School.slug). */
  campusSlug?: string | null;
  /** The chapter's public slug, when the student has picked one. */
  chapterSlug?: string | null;
  /** The contact reference the visitor arrived with (?by / ?ref) — travels as the sharer. */
  contactRef?: string | null;
};

export function buildShareUrl({ campusSlug, chapterSlug, contactRef }: ShareContext): string {
  const campus = campusSlug?.trim() || null;
  const chapter = chapterSlug?.trim() || null;
  const ref = contactRef?.trim() || null;
  if (campus && chapter) return withRef(`${SHARE_ORIGIN}${goPath(campus, chapter)}`, ref);
  if (campus) return `${SHARE_ORIGIN}/s/${campus}${ref ? `?by=${encodeURIComponent(ref)}` : ""}`;
  return `${SHARE_ORIGIN}/`;
}

/** The toast's second line — "Ole Miss · ACCY 201 · Exam 1", whatever of it is known. */
export function shareCaption({ campusName, courseCode, examLabel }: { campusName?: string | null; courseCode?: string | null; examLabel?: string | null }): string | null {
  const parts = [campusName, courseCode, examLabel].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : null;
}
