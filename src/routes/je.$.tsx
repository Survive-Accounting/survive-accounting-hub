// /je/* → /study — permanent (301) catch-all redirect. No /je sub-paths ever existed, so
// every /je/* hit lands on the /study base rather than a dead /study/<old> path. When the
// deep /study/* routes (scenarios/{slug}, chapters/{id}, …) ship, switch this to preserve
// the sub-path: redirect({ to: "/study/$", params, statusCode: 301 }).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/je/$")({
  beforeLoad: () => {
    throw redirect({ to: "/study", statusCode: 301 });
  },
});
