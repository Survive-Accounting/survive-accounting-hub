// /greek -> /chapters.
//
// The portal has always lived at /chapters, but it is universally called "the Greek portal" in
// conversation and in the briefs, so /greek is the address people actually try. It was a 404.
//
// A REDIRECT RATHER THAN A MOVE, deliberately: /chapters is printed on flyers, sits in sent SMS
// messages, and is where the chapter dashboard hangs off (/chapters/dashboard). Renaming the route
// would break every one of those to fix a URL nobody has linked to yet.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/greek")({
  beforeLoad: () => { throw redirect({ to: "/chapters", replace: true }); },
});
