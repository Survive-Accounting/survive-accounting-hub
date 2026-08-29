// /preview/studentplayerv1 — THE STUDENT PLAYER, ON ITS OWN, REACHABLE (2026-08-29).
//
// WHY THIS EXISTS. The two-door "/" has no player on it, so the V1 player — exam tabs, the Exam 1
// Path topic list, the campus plate with its reset / change-school / choose-professor controls,
// the "You're ready for <campus>" start panel — became unreachable from the front door. Lee's
// words: "I'm afraid we will lose it and it's a really good starting point for the upcoming
// versions of player." This route is how you get back to it.
//
// ── READ THIS BEFORE TREATING IT AS A BACKUP ──────────────────────────────────────────────────
// THIS ROUTE IS NOT A FROZEN COPY. It renders the LIVE LandingPage, so it will follow the player
// wherever the player goes. That is deliberate: ExamPlayer is not a standalone component — it
// lives inside routes/landing.tsx among ~2,800 lines of campus, professor, exam-map and notify
// wiring — so a real snapshot would mean forking that file and every dependency it reaches, and a
// fork nobody runs is a fork that quietly rots into a lie.
//
// THE ACTUAL SAFEKEEPING IS THE GIT TAG `player-v1-2026-08-29`. That commit holds this player
// exactly as it looked the day Lee asked for it, and `git show player-v1-2026-08-29` will still
// hold it after any number of V2 rewrites. Use this route to LOOK at the player and to compare
// new versions against it; use the tag to RECOVER it.
//
// Preview conventions, same as /preview/home and /preview/exam1: noindex, unlinked from every
// nav, and no loader — a testing surface, not an indexable page.
import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/routes/landing";

export const Route = createFileRoute("/preview_/studentplayerv1")({
  head: () => ({
    meta: [
      { title: "Student player V1 — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudentPlayerV1,
});

function StudentPlayerV1() {
  // No campusSlug and no goChapter: the GENERIC player, the way a student who has told us nothing
  // meets it. That is the state worth testing against — a campus-locked or chapter-locked player
  // skips the very school and professor steps this page exists to preserve.
  return <LandingPage />;
}
