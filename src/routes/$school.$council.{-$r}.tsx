// /<school>/<council>[/<ref8>] — THE SHORT COUNCIL LINK (Lee, 2026-09-14: "make these links shorter
// … and prettier. It's the link a council exec would share with scholarship chairs").
// surviveaccounting.com/ole-miss/ifc/0e54a9c2 → /chapters?school=university-of-mississippi&c=ifc&ref=<uuid>.
// Only the four councils resolve; any other two-segment path is a 404, as before this route existed.
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { councilPortalUrl } from "@/components/site/chair-promo";
import { resolveRefPrefix } from "@/lib/outreach-links.functions";
import { schoolByAny } from "@/lib/schools";

const COUNCILS = new Set(["ifc", "panhellenic", "nphc", "mgc"]);

export const Route = createFileRoute("/$school/$council/{-$r}")({
  beforeLoad: async ({ params }) => {
    const council = params.council.toLowerCase();
    const school = schoolByAny(params.school);
    if (!COUNCILS.has(council) || !school) throw notFound();
    let href = councilPortalUrl(school.slug, council).replace(/^https?:\/\/[^/]+/, "");
    if (params.r && /^[0-9a-f]{8}$/i.test(params.r)) {
      const r = await resolveRefPrefix({ data: { prefix: params.r } }).catch(() => null);
      if (r?.ref) href += `&ref=${encodeURIComponent(r.ref)}`;
    }
    throw redirect({ href, statusCode: 302 });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => null,
});
