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
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { blastOffPath, type BlastOffStep } from "./use-bank";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

export const STEPS: readonly { step: BlastOffStep; n: number; label: string; blurb: string; soon?: boolean }[] = [
  { step: "talkthrough", n: 1, label: "Talkthrough", blurb: "Talk through the set — or an exhibit — and stamp out ideas." },
  // Lee (2026-09-03): "Review is seeing the filming draft as it stands …
  // getting it SOLID before I do the film run." The AI board folds under it.
  { step: "results", n: 2, label: "Review", blurb: "The film draft: see the slides, edit, add, skip, rearrange, drop in what you've banked — your own words beside each one. The AI board folds underneath." },
  { step: "film", n: 3, label: "Film", blurb: "Capture — one frame at a time, spacebar forward, nothing else in the shot." },
  // Post got its own page 2026-09-06 — a cross-set queue at /v3/post (blastOffPath special-cases
  // this step to point there instead of nesting under the current topic/set).
  { step: "post", n: 4, label: "Post", blurb: "Queue up what's filmed across every topic and set, process it, publish it." },
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
        // A step with no page yet (Post) is a plain pill, not a link — Door.tsx's own "soon"
        // rule, so it never 404s and reads as "coming", not broken.
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
