// THE TEASER SLIDE (teaser.ts has the rules and Lee's words). Full 9:16: the small wordmark, an
// optional heading (frame.title), and the stack of callout chips — each in its own callout's colour,
// from the one registry the big callouts use. On film the chips come in one per click; a chip not
// yet revealed keeps its space, so the stack never jumps as it fills.
import { useContext } from "react";

import { calloutMeta } from "@/components/canvas/cards/CalloutCard";
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { Shell } from "./EndOfTopicFrames";
import { FrameStepContext } from "./frame-step";
import { INSERT_CALLOUT, type BlastFrame } from "./plan";
import { DISPLAY_FONT } from "./stage";
import { teaserItems, teaserKindOf, teaserShown } from "./teaser";

const GOLD = "#FCA311";

const TEASER_CSS = `
@keyframes sa-teaser-in { 0% { opacity: 0; transform: translateY(14%) scale(0.86); } 60% { opacity: 1; transform: translateY(-3%) scale(1.04); } 100% { opacity: 1; transform: none; } }
.sa-teaser-chip.is-in { animation: sa-teaser-in 420ms cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .sa-teaser-chip.is-in { animation: none; } }
`;

function accentOf(line: string): string {
  const kind = teaserKindOf(line);
  const tag = kind ? INSERT_CALLOUT[kind] : undefined;
  return tag ? calloutMeta(tag as Parameters<typeof calloutMeta>[0]).accent : GOLD;
}

export function TeaserFrame({ w, frame, live }: { w: number; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const step = useContext(FrameStepContext);
  const items = teaserItems(frame);
  const walking = !!live && !!step;
  const shown = teaserShown(frame, walking ? step.step : null);
  const heading = frame.title?.trim();
  return (
    <div
      onClick={walking && step.advance ? (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; e.stopPropagation(); step.advance?.(e.shiftKey ? -1 : 1); } : undefined}
      style={{ cursor: walking ? "pointer" : undefined }}>
      <style>{TEASER_CSS}</style>
      <Shell w={w} k={k}>
        <div style={{ width: "100%", minHeight: 400 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 * k }}>
          {heading && (
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 24 * k, lineHeight: 1.05, color: BRAND_CREAM, textWrap: "balance" as never, marginBottom: 4 * k }}>{heading}</div>
          )}
          {items.map((line, i) => {
            const accent = accentOf(line);
            const on = i < shown;
            return (
              <div key={`${i}:${line}`} className={`sa-teaser-chip${on && walking ? " is-in" : ""}`}
                style={{ visibility: on ? "visible" : "hidden", alignSelf: "flex-start" }}>
                <span style={{
                  display: "inline-flex", padding: `${6 * k}px ${14 * k}px`, borderRadius: 9 * k,
                  fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 21 * k, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1.1,
                  color: accent, background: `${accent}24`, border: `${Math.max(1, 1.5 * k)}px solid ${accent}80`,
                  boxShadow: `0 0 ${18 * k}px ${accent}33`,
                }}>{line}</span>
              </div>
            );
          })}
        </div>
      </Shell>
    </div>
  );
}
