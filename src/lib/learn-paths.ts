// THE /learn PATHS EVERY LINK POINTS AT (the simple flow, Lee, 2026-09-16 round 2: "send a chapter exec or
// council exec to /learn and just have what they need there … chairs are students").
//
// One destination for everyone: /learn/<School.id>[/<chapter>]. What differs is the strip under the button
// (learn/ChapterStrip.tsx), and the link says who is arriving:
//   member         /learn/ole-miss/ka                       "You're studying with ΚΑ."
//   chapter exec   /learn/ole-miss/ka?share=chair           "Bring this to the house."
//   council exec   /learn/ole-miss?share=council&c=ifc      "Bring this to your chapters."
// /go/… redirects here for every link already in the wild. The path speaks School.id ("ole-miss"); a campus slug
// ("university-of-mississippi") is accepted and translated. Pure: no React, no network.
import { schoolByAny } from "@/lib/schools";

export const LEARN_ORIGIN = "https://surviveaccounting.com";

const idOf = (schoolSlugOrId: string): string => schoolByAny(schoolSlugOrId)?.id ?? schoolSlugOrId;

/** The chapter's page. `share: "chair"` for the exec's link; `via` stamps how a member link was shared. */
export function chapterLearnPath(school: string, chapterSlug: string, o: { share?: "chair"; via?: string } = {}): string {
  const q = new URLSearchParams();
  if (o.share) q.set("share", o.share);
  if (o.via) q.set("via", o.via);
  const s = q.toString();
  return `/learn/${idOf(school)}/${chapterSlug}${s ? `?${s}` : ""}`;
}

/** The council exec's page: the campus page with the council strip. */
export function councilLearnPath(school: string, council: string): string {
  return `/learn/${idOf(school)}?share=council&c=${encodeURIComponent(council)}`;
}

/** The chairs' link a council passes down: the campus page with the council preset — chairs pick their chapter. */
export function councilChairsPath(school: string, council: string): string {
  return `/learn/${idOf(school)}?c=${encodeURIComponent(council)}`;
}
