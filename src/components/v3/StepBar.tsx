// THE STEP BAR — the buttons at the top of every Blast Off step screen.
//
// Lee (2026-09-02): "What we want is maybe three buttons at the top —
// Step 1: Talkthrough · Step 2: Generate Results · Step 3: Send to filming."
// The previous "Talkthrough studio ↗" link left the breadcrumb trail and got
// him stuck; nothing here leaves /v3. Each button is a real URL so the
// browser's back button walks the steps too.
//
// FOUR STEPS NOW (Lee, 2026-09-05: "go ahead and fold Arrange into Review,
// renumber the steps... Step 3: Film Step 4: Post"). Arrange's own job —
// "the ideas become reusable elements dropped between slides, review each
// slide, add and remove" — was already Review's job in its own words ("see
// the slides, edit, add, skip, rearrange"); Review's blurb below says so
// explicitly now, and the Arrange URL redirects into Review rather than
// disappearing, so an old link or bookmark still lands somewhere real. Film
// gets its own numbered step for the first time (it always had its own page,
// just never its own door — see the old "arrange"'s "Capture in-page →"
// link, now redundant since Film is a step click away). Post got its page
// 2026-09-06 (/v3/post — a cross-set queue, not nested under a topic/set).
//
// RENAMED, AND A FIFTH (Lee, 2026-09-07): "I think Review should be named Editor.
// Talkthrough should be brainstorm. Rehearse & Film, because I want teleprompter to
// live here, during review the lines. #4 Cross-post" — and "I'd love a Step 5:
// Improve Process." Labels only: the step ids and the URL segments (talkthrough ·
// results · film · post) are unchanged, so bookmarks, the timer's path detection
// (lib/production-time.ts) and the deployed routes all still resolve. The fifth step
// nests under the set like the others (/blast-off/improve) and isn't timed.
// 2026-09-07: no teleprompter on the Editor — lines are made on Rehearse & Film
// (rounds + the rehearsal review).
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { blastOffPath, type BlastOffStep } from "./use-bank";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

/** The numbered steps — the BlastOffStep vocabulary minus "arrange", which keeps its URL
 *  (a redirect into the Editor) but has had no door since 2026-09-05. Five since 2026-09-07. */
export type NumberedStep = Exclude<BlastOffStep, "arrange">;

export const STEPS: readonly { step: NumberedStep; n: number; label: string; blurb: string; soon?: boolean }[] = [
  // 2026-09-07: "Talkthrough" → "Brainstorm" (id and URL still talkthrough).
  { step: "talkthrough", n: 1, label: "Brainstorm", blurb: "Talk the set through out loud — or an exhibit — and stamp what's worth keeping." },
  // Lee (2026-09-03): "Review is seeing the filming draft as it stands …
  // getting it SOLID before I do the film run." The AI board folds under it.
  // 2026-09-07: "Review" → "Editor" (id and URL still results); the teleprompter left this step.
  { step: "results", n: 2, label: "Editor", blurb: "The film draft: order and skip slides, fix the cards, drop in callouts, pictures, camera. The AI board folds underneath." },
  // 2026-09-07: "Film" → "Rehearse & Film" — "I want teleprompter to live here, during review the lines."
  { step: "film", n: 3, label: "Rehearse & Film", blurb: "Rounds with the teleprompter, then the take — one frame at a time, nothing else in the shot." },
  // Post got its own page 2026-09-06 — a cross-set queue at /v3/post (blastOffPath special-cases
  // this step to point there instead of nesting under the current topic/set).
  // 2026-09-07: "Post" → "Cross-post" (id and URL still post).
  { step: "post", n: 4, label: "Cross-post", blurb: "Captions, exports, every destination — queued across every topic and set." },
  // STEP 5 (Lee, 2026-09-07: "I'd love a Step 5: Improve Process."). A real door to a real page
  // (/blast-off/improve — components/v3/improve/ImprovePage.tsx); not timed (production-time.ts).
  { step: "improve", n: 5, label: "Improve Process", blurb: "Time to beat, where the minutes went, what to change next set." },
];

export function StepBar({ topic, set, active, right }: {
  topic: BoothTopic; set: BoothSetInfo; active: BlastOffStep;
  /** Anything that belongs on the right of the bar (a secondary link). */
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 16, flexWrap: "wrap" }}>
      {STEPS.map((s) => {
        const on = s.step === active;
        const kicker = (
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: on ? V3_GOLD : V3_MUTED }}>
            Step {s.n}
          </span>
        );
        const label = <span style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: 14 }}>{s.label}</span>;
        // A step with no page yet is a plain pill, not a link — Door.tsx's own "soon" rule, so
        // it never 404s and reads as "coming", not broken. (Post was the example until it got
        // its page on 2026-09-06; nothing sets `soon` today, the rule stays for the next one.)
        if (s.soon) {
          return (
            <span key={s.step} className="flex items-center gap-2 rounded-xl px-3.5 py-2" title={s.blurb} aria-disabled
              style={{ border: `1.5px solid ${V3_EDGE}`, color: V3_MUTED, opacity: 0.5, cursor: "not-allowed" }}>
              {kicker}{label}
            </span>
          );
        }
        return (
          <Link
            key={s.step}
            to={blastOffPath(topic, set, s.step)}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2"
            style={{
              border: `1.5px solid ${on ? V3_GOLD : V3_EDGE}`,
              background: on ? "rgba(252,163,17,0.12)" : "transparent",
              color: on ? V3_CREAM : V3_MUTED,
              textDecoration: "none",
            }}
            title={s.blurb}
          >
            {kicker}{label}
          </Link>
        );
      })}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
