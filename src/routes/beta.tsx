// /beta — THE BETA INVITE (Lee, 2026-09-17: "a beta test version of the entire site, where everything uses test
// data, any verification sms is bypassable, emails still send though").
//
//   /beta?email=friend@x.com&t=Sam&k=<signature>    (minted on /admin/site-qa → "Beta invite")
//
// It turns the invite into the tester URL the Test Mode bar already understands and lands on the home page.
// From there the whole site is the real site: every write the tester causes is is_test on the server
// (beta-invite.server.ts), texts are never sent, the rep phone code is 000000, and emails still go to the
// address typed. The session ends with the browser; "End test" on the bar ends it sooner.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/beta")({
  validateSearch: (s: Record<string, unknown>): { email?: string; t?: string; k?: string; to?: string } => ({
    ...(typeof s.email === "string" ? { email: s.email } : {}),
    ...(typeof s.t === "string" ? { t: s.t } : {}),
    ...(typeof s.k === "string" ? { k: s.k } : {}),
    ...(typeof s.to === "string" && s.to.startsWith("/") && !s.to.startsWith("//") ? { to: s.to } : {}),
  }),
  beforeLoad: ({ search }) => {
    if (!search.email || !search.k) throw redirect({ href: "/" });
    const q = new URLSearchParams({ feedback: "1", testmode: "1", t: search.t || search.email.split("@")[0], email: search.email, k: search.k });
    const to = search.to ?? "/";
    throw redirect({ href: `${to}${to.includes("?") ? "&" : "?"}${q.toString()}` });
  },
  component: () => null,
  head: () => ({ meta: [{ title: "Survive · beta" }, { name: "robots", content: "noindex" }] }),
});
