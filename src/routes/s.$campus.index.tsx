// /s/<campus> — THE DM DESTINATION.
//
// The one link that goes to every Greek contact. It survives forwarding — council chair to
// scholarship chairs, chair to members, member to a friend at another chapter — because it is
// campus-level, not chapter-level: a per-chapter link breaks at the first hop, this one doesn't.
//
// ── WHAT CHANGED (learn-share-flow) ──────────────────────────────────────────────────────────
// This used to be a chapter PICKER ("which chapter are you with?"). It now lands the visitor
// straight on the product — /learn, campus prefilled, nothing gated — and the adaptive CTA bar
// there does the "who are you" work. Show the thing, then ask. The picker moved into the CTA
// bar's "Pick your chapter" step, reached only once someone has decided to share.
//
// ATTRIBUTION carries through the hop:
//   ?ref=<uuid>  — WE messaged this person (the recipient). No banner. Sets CTA context only.
//   ?by=<uuid>   — a PERSON forwarded it (the sharer). Shows the vouched banner on /learn.
// Both are preserved on the redirect and picked up by /learn (cookie-persisted there). `by` is a
// NEW param, deliberately not the already-taken `?via=` (that is the share-CHANNEL stamp).
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { schoolBySlug } from "@/lib/schools";
import { isContactRef } from "@/lib/contact-ref";

export const Route = createFileRoute("/s/$campus/")({
  // ref = the recipient we DM'd; by = a human who forwarded it. Both are contact UUIDs; anything
  // that is not a UUID is dropped rather than carried (a short code is a rep code, not a contact —
  // carrying it here would risk the rep-commission collision the sa_cref/sa_ref split prevents).
  validateSearch: (s: Record<string, unknown>): { ref?: string; by?: string } => {
    const ref = typeof s.ref === "string" && isContactRef(s.ref) ? s.ref : undefined;
    const by = typeof s.by === "string" && isContactRef(s.by) ? s.by : undefined;
    return { ...(ref ? { ref } : {}), ...(by ? { by } : {}) };
  },
  // Resolve the campus and hand off to the product. An unknown slug is said out loud rather than
  // redirected — these URLs go out in DMs and a typo should be findable, not bounced to a generic
  // page.
  beforeLoad: ({ params, search }) => {
    const school = schoolBySlug(params.campus);
    if (!school) throw notFound();
    throw redirect({
      to: "/learn",
      search: {
        // /learn keys campus context off the campus ID (the same deep-link it already accepts).
        campus: school.campusId,
        // g=<slug> tells the CTA bar this arrival came through the Greek share funnel, so it can
        // scope its copy to this campus even before a chapter is picked.
        g: school.slug,
        ...(search.ref ? { ref: search.ref } : {}),
        ...(search.by ? { by: search.by } : {}),
      },
    });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  // No component: this route only ever redirects (or 404s on an unknown campus).
  notFoundComponent: () => null,
});
