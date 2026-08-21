// /go/<school> — CONVENIENCE REDIRECT to the canonical campus page at /<school>.
//
// The campus page deliberately lives at the TOP LEVEL (see $school.index.tsx): it is the
// indexable SEO surface, its short URL is what OG cards, the sitemap, and existing inbound
// links carry, and moving it would orphan all of that. But /go/ is the namespace students
// see on Greek chapter links (/go/<school>/<chapter>), so a hand-typed /go/<school> should
// land somewhere sensible rather than 404. Unknown slugs fall through to /$school's own
// beforeLoad, which bounces home.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { schoolByAny } from "@/lib/schools";

export const Route = createFileRoute("/go/$school/")({
  beforeLoad: ({ params }) => {
    // Accept either slug space (campus slug OR picker id) and land on the canonical slug;
    // an unknown value still redirects to /$school, whose own beforeLoad bounces home.
    const school = schoolByAny(params.school);
    throw redirect({ to: "/$school", params: { school: school?.slug ?? params.school }, replace: true });
  },
});
