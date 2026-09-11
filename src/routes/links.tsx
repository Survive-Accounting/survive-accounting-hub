// /links → /admin/growth/links. The short address Lee types; the page itself lives behind the
// team passcode because it lists students' personal handles and emails (2026-09-11).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/links")({
  beforeLoad: () => { throw redirect({ to: "/admin/growth/links", replace: true }); },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => null,
});
