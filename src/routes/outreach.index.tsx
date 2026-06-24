// /outreach → redirect to the default landing: Leads › Leaderboard (the scraping
// hub). All real content lives under the three section routes.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/outreach/")({
  beforeLoad: () => {
    throw redirect({ to: "/outreach/leadfinder-leaderboard" });
  },
});
