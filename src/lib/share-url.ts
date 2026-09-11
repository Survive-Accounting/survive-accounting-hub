// THE SHARE LINK (Lee, 2026-09-11: "Do not construct links ad hoc in the navbar component.
// Create/reuse a central helper such as buildShareUrl({ campus, chapter, course, exam })." — and,
// later that day: "Share button top right should just be a share link icon … it just copies the
// link to the page they're on. Maybe it can say a UTM for sharebutton").
//
// Two builders, one shape. The /learn URLs are PRETTY now (the route is /learn/{-$campus}/
// {-$chapter}): /learn/ole-miss, /learn/ole-miss/alpha-tau-omega — the school's short public id
// (School.id) and the chapter's slug, never a campus uuid.
//   pageShareUrl(location)   the page the student is on, minus the state that must not travel
//                            (set / stage / topic / look / looks / test / demo), plus the share
//                            UTM (utm_source=share, utm_medium=link, utm_campaign=learn) so the
//                            arrivals can be counted later. ref / by / g / campus are kept — they
//                            are the link's context.
//   buildShareUrl(context)   the canonical link for a context (used by anything that has no
//                            location — DMs, tests): campus + chapter → /learn/<id>/<chapter>,
//                            campus → /learn/<id>, nothing → the site; + ?by= for a forwarder.
// Course and exam do NOT travel: no route reads them, /learn picks the exam from what is live.
import { CLICK_ID_KEYS } from "@/lib/carry-params";
import { withRef } from "@/lib/contact-ref";

export const SHARE_ORIGIN = "https://surviveaccounting.com";
/** Search keys that are the page's own state, never the link's — and an ad's click id / creative
 *  tags (lib/carry-params, 2026-09-11): they belong to the click that brought THIS student, and a
 *  shared link carrying them would credit that ad with every friend who opens it. */
const VOLATILE = ["set", "stage", "topic", "look", "looks", "test", "demo", "share", "c", ...CLICK_ID_KEYS, "utm_content", "utm_term"] as const;
export const SHARE_UTM = { utm_source: "share", utm_medium: "link", utm_campaign: "learn" } as const;

export type ShareContext = {
  /** The school's public id (School.id — "ole-miss"). */
  campus?: string | null;
  /** The chapter's public slug, when the student has picked one. */
  chapter?: string | null;
  /** The contact reference the visitor arrived with (?by / ?ref) — travels as the sharer. */
  contactRef?: string | null;
};

export function buildShareUrl({ campus, chapter, contactRef }: ShareContext): string {
  const c = campus?.trim() || null;
  const ch = chapter?.trim() || null;
  const ref = contactRef?.trim() || null;
  if (c && ch) return withRef(`${SHARE_ORIGIN}/learn/${c}/${ch}`, ref);
  if (c) return `${SHARE_ORIGIN}/learn/${c}${ref ? `?by=${encodeURIComponent(ref)}` : ""}`;
  return `${SHARE_ORIGIN}/`;
}

/** The link to the page the student is on — cleaned of its own state, stamped with the UTM. */
export function pageShareUrl(loc: { origin: string; pathname: string; search: string }): string {
  const u = new URL(loc.pathname + loc.search, loc.origin);
  for (const k of VOLATILE) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(SHARE_UTM)) u.searchParams.set(k, v);
  return u.toString();
}

/** "Ole Miss · ACCY 201 · Exam 1", whatever of it is known. */
export function shareCaption({ campusName, courseCode, examLabel }: { campusName?: string | null; courseCode?: string | null; examLabel?: string | null }): string | null {
  const parts = [campusName, courseCode, examLabel].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : null;
}
