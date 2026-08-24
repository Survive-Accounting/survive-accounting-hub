// STAGE PILLS (08-21) — the compact Cram / Practice / Review control that sits over a set.
// It makes the workflow legible while most of Cram and Review are still being filmed: every
// stage is ALWAYS visible, a stage without content is muted with a SOON tag but stays
// clickable (→ the contextual notify), and the muted state clears itself the moment the data
// says the content exists (set-flow.ts stagesOf — no hardcoded topics, no extra flags).
//
// MODE COLOURS are semantic signals, not brand: Cram = the powder-blue accent, Practice = the
// action orange, Review = a restrained violet that exists ONLY here.
import { ListChecks, RotateCcw, Zap } from "lucide-react";

import type { SetStage } from "@/lib/set-flow";

export const STAGE_COLOR: Record<SetStage, string> = { cram: "#006BA6", practice: "#FFA611", review: "#8B7FC7" };
const STAGE_LABEL: Record<SetStage, string> = { cram: "Cram", practice: "Practice", review: "Review" };
const STAGE_TITLE: Record<SetStage, string> = {
  cram: "Cram Blast — a fast preview of the exact kinds of questions you're about to try",
  practice: "Practice — try the questions yourself",
  review: "Review — watch Lee work them, slower, with the tricks",
};
const ORDER: SetStage[] = ["cram", "practice", "review"];

export function StagePills({ current, available, onSelect, onUnavailable, size = "sm" }: {
  current: SetStage;
  /** Which stages have content right now (derived from the set, never a stored flag). */
  available: Record<SetStage, boolean>;
  onSelect: (st: SetStage) => void;
  /** A muted stage was clicked — open the contextual notify for THIS stage. */
  onUnavailable: (st: SetStage) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" aria-label="Set stages" className="flex items-center gap-1">
      {ORDER.map((st) => {
        const on = st === current;
        const has = available[st];
        const c = STAGE_COLOR[st];
        const Icon = st === "cram" ? Zap : st === "practice" ? ListChecks : RotateCcw;
        // Contrast: an "on" pill is dark text on the mode colour; an available-but-off pill is
        // the mode colour on a tinted ground; a SOON pill keeps the colour but at ~55% so it
        // reads as "not yet" rather than disabled — still ≥3:1 on the navy ground.
        const style = on
          ? { background: c, color: st === "practice" ? "#0B1220" : "#FFFFFF", border: `1px solid ${c}` }
          : has
            ? { background: `${c}22`, color: st === "cram" ? "#6FC2F2" : c, border: `1px solid ${c}66` }
            : { background: "transparent", color: st === "cram" ? "#6FC2F2" : c, border: `1px dashed ${c}66`, opacity: 0.62 };
        return (
          <button
            key={st}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${STAGE_LABEL[st]}${has ? "" : " — coming soon"}${on ? ", current" : ""}`}
            title={STAGE_TITLE[st]}
            onClick={() => (has ? onSelect(st) : onUnavailable(st))}
            className={`flex shrink-0 items-center gap-1 rounded-full font-black uppercase tracking-wider ${size === "md" ? "px-2.5 text-[11px]" : "px-1.5 text-[10px] sm:px-2"}`}
            style={{ minHeight: size === "md" ? 30 : 26, ...style }}
          >
            <Icon aria-hidden className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
            <span>{STAGE_LABEL[st]}</span>

          </button>
        );
      })}
    </div>
  );
}
