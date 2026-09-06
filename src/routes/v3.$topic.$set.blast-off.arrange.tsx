// /v3/$topic/$set/blast-off/arrange — RETIRED (2026-09-05): "fold Arrange into Review, renumber
// the steps." Arrange's own job description — "the ideas become reusable elements dropped
// between slides, review each slide, add and remove" — was already Review's, in Review's own
// words ("see the slides, edit, add, skip, rearrange"). BlastOffEditor (what this page used to
// mount) is superseded by ReviewDeck; nothing here is rebuilt, because there is nothing left
// that Review doesn't already do.
//
// A redirect, not a deletion — an old link or a bookmark to /arrange still lands somewhere
// real (Review) rather than a 404. See StepBar.tsx for the new four-step numbering.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/arrange")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/v3/$topic/$set/blast-off/results", params, replace: true });
  },
});
