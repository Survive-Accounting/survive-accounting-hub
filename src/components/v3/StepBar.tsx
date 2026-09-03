// THE STEP BAR — the three buttons at the top of every Blast Off step screen.
//
// Lee (2026-09-02): "What we want is maybe three buttons at the top —
// Step 1: Talkthrough · Step 2: Generate Results · Step 3: Send to filming."
// The previous "Talkthrough studio ↗" link left the breadcrumb trail and got
// him stuck; nothing here leaves /v3. Each button is a real URL so the
// browser's back button walks the steps too.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { blastOffPath, type BlastOffStep } from "./use-bank";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

export const STEPS: readonly { step: BlastOffStep; n: number; label: string; blurb: string }[] = [
  { step: "talkthrough", n: 1, label: "Talkthrough", blurb: "Talk through the set — or an exhibit — and stamp out ideas." },
  // Lee (2026-09-03): "Review is seeing the filming draft as it stands …
  // getting it SOLID before I do the film run." The AI board folds under it.
  { step: "results", n: 2, label: "Review", blurb: "The film draft: see the slides, edit, add, skip, rearrange — your own words beside each one. The AI board folds underneath." },
  { step: "arrange", n: 3, label: "Send to filming", blurb: "Arrange the running order, drop in what you banked, send it to film." },
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
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: on ? V3_GOLD : V3_MUTED }}>
              Step {s.n}
            </span>
            <span style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: 14 }}>{s.label}</span>
          </Link>
        );
      })}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
