// /links → /admin/growth/links. The short address Lee types; the page itself lives behind the
// team passcode because it lists students' personal handles and emails (2026-09-11).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/links")({
  // ?day=2026-09-12 (the hand-off email's link) and any other search travel through.
  beforeLoad: ({ search }) => { throw redirect({ to: "/admin/growth/links", search: search as Record<string, string>, replace: true }); },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => null,
});
