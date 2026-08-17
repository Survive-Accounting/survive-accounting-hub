// /c/<slug> — LEGACY. Redirect-only since Phase 1; /go/<school>/<chapter> is canonical.
//
// The redirect is a real 301 rather than a client-side hop because these links were printed and
// texted: the permanent status is what lets a search engine, a link preview and a phone's
// autocomplete all learn the new address instead of holding the old one forever.
//
// No surface generates a /c/ link any more — share toolkit, QR, dashboard and every copy action
// emit /go/ only, via goPath(). This route exists purely so links already in the wild keep working.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveLegacyChapterSlug } from "@/lib/greek-go.functions";

export const Route = createFileRoute("/c/$slug")({
  beforeLoad: async ({ params }) => {
    // Resolved server-side so the 301 is issued on the first response — a client-side redirect
    // would render a flash of the wrong page and would not teach anything the new URL.
    const to = await resolveLegacyChapterSlug({ data: { slug: params.slug } }).catch(() => null);
    // An unresolvable slug (revoked chapter, typo, a 0111 row that never got linked to a roster
    // chapter) goes to the landing page rather than a 404 — the student still gets the free player,
    // which is the thing the link promised.
    throw redirect({ href: to ?? "/", statusCode: 301 });
  },
});
