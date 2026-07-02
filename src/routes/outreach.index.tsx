// /outreach → redirect to the default landing. ProfIntel V2 is now the default
// admin workflow; V1 surfaces (Lead Finder, Campaigns, …) are reachable via the
// sidebar once the gear → "Outreach V1 archive" version switch is toggled.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/outreach/")({
  beforeLoad: () => {
    throw redirect({ to: "/outreach/profintel" });
  },
});
