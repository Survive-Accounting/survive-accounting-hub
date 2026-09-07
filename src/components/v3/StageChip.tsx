// THE STAGE CHIP — one glance-able word per set row, the same on /v3 and /v3/post.
//
// 2026-09-06 audit: "The main work is reconciling the status sources into one glance-able chip
// per row." The reconciling happens in set-stage.ts; this is only the rendering, kept in one
// place so the queue and Post can never drift apart in colour or wording. The chip's title
// spells out where the answer came from, because "filmed?" and "filmed" look alike at a glance
// and the difference (timer evidence vs Lee's confirmation) is the whole point.
import { STEPS } from "./StepBar";
import { isFilmedUnconfirmed, type StageInfo } from "./set-stage";

const STAGE_HINT: Record<StageInfo["stage"], string> = {
  not_started: "No talkthrough session yet",
  talking: "A talkthrough session is open",
  talked: "Talked through — see the results",
  generating: "Results are being generated",
  reviewed: "A blast plan is saved — reviewed, ready to film",
  filmed: "Filmed (confirmed on Post)",
  posting: "Some destinations posted",
  posted: "Posted to all four destinations",
};

export function StageChip({ info, align = "right", minWidth = 96 }: { info: StageInfo; align?: "left" | "right"; minWidth?: number }) {
  const hint = isFilmedUnconfirmed(info) ? "The Film timer ran on this set — confirm on Post" : STAGE_HINT[info.stage];
  return (
    <span
      title={hint}
      style={{ minWidth, textAlign: align, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: info.color, whiteSpace: "nowrap" }}
    >
      {info.label}
    </span>
  );
}

/** "Rehearse & Film", "Editor", … — the step's own label from StepBar, so the resume button and
 *  the step bar never disagree on what a step is called (2026-09-07: which is how the rename
 *  reached the resume button without a change here). */
export function stepLabel(step: StageInfo["next"]): string {
  return STEPS.find((s) => s.step === step)?.label ?? step;
}
