// /v3/$topic/$set/blast-off — A REDIRECT INTO THE EDITOR (2026-09-09).
//
// This was a menu until today: "WHICH STEP ARE YOU ON?" — the five doors in the order the work
// happens (Brainstorm · Editor · Rehearse & Film · Cross-post · Iterate, StepBar.tsx STEPS) with
// the FilmPreflight stat block under them. But the StepBar draws those same five steps at the top
// of every step screen, so the menu was one more click between Lee and the work — and the click
// that hurt was Escape on /film. BlastOffCapture's onExit navigates to blastOffPath(topic, set),
// which is THIS route, so leaving a take dropped him on a menu whose only useful door was the
// Editor he had come from. That bounce (Editor → Film → Escape → menu → Editor) is one key now:
// the menu redirects to /results, so Escape from film lands on the Editor.
//
// Same shape as blast-off.arrange.tsx (2026-09-05, the first retired step): a redirect, not a
// deletion — every link, bookmark, split-set path and strategy path that still spells /blast-off
// lands somewhere real. `replace: true` so browser back never bounces through the redirect (back
// from the Editor goes to wherever Lee came from, /film included), and the search is carried
// over so ?frame=<id> (the illustration bank's "open slide in Review →") survives the hop.
//
// The pre-flight numbers (slides, questions, memorize-this, cheat codes, deep questions,
// illustrations, production cost) moved with the doors: they fold under "Pre-flight" at the
// bottom of the Editor (blast-off.results.tsx), closed until opened.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/v3/$topic/$set/blast-off/results", params, search, replace: true });
  },
});
