// THE QUESTION FRAME, vertical.
//
// orientation.ts sets the law this obeys: "orientation is a LAYOUT concern,
// never a content fork. One CEQ, two ways of drawing it." So this draws the
// SAME stem and choices the canvas draws — re-typeset into the taller, narrower
// column a phone gets, at that module's own TYPE_SCALE rather than sizes
// invented here. Nothing about what is taught changes.
//
// The card sits in the upper band; the lower third is left clear for Lee's
// camera cutout, which is where verticalZones() puts it.
//
// HIGHLIGHTING is the shared gesture from canvas/text-highlights — the same
// store, the same offsets, the same gold .sa-sel-emph. Select words in a stem
// or a choice and they stay marked; a click on the card clears that question;
// the backtick (owned by the capture surface) clears the run.
import { useContext, useRef } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { typeSize, verticalZones } from "@/components/canvas/orientation";
import { Emph, HighlightContext, SEL_EMPH_CSS, readRangeIn } from "@/components/canvas/text-highlights";
import { DISPLAY_FONT, V, VStage, reveal, riseIn } from "./stage";

const GOLD = "#FCA311";
const CORRECT = "#3BF5A0";

export interface CeqFrameChoice { text: string; correct?: boolean }

export function CeqFrame({
  ceqId, label, stem, choices = [], showAnswer = false, progress, scale = 1, transparent = false,
}: {
  /** Keys this question's highlights. Absent = a non-question frame; no gesture. */
  ceqId?: string;
  label?: string;
  stem: string;
  choices?: readonly CeqFrameChoice[];
  /** Film reveal: the answer lands when Lee says it, not before. */
  showAnswer?: boolean;
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  const hlx = useContext(HighlightContext);
  const stemRef = useRef<HTMLDivElement>(null);
  const choiceRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const card = verticalZones("9:16").card;
  const stemPx = typeSize(34, "9:16", "stem");
  const choicePx = typeSize(26, "9:16", "choice");
  const head = reveal(progress, 0.02, 0.08);
  const body = reveal(progress, 0.08, 0.10);

  const markStem = () => { if (!ceqId) return; const r = readRangeIn(stemRef.current); if (r) hlx.setStem(ceqId, r); };
  const markChoice = (i: number) => { if (!ceqId) return; const r = readRangeIn(choiceRefs.current[i]); if (r) hlx.setChoice(ceqId, i, r); };

  return (
    <VStage scale={scale} transparent={transparent}>
      <style>{SEL_EMPH_CSS}</style>
      {/* A click anywhere on the card clears THIS question's marks — same
          gesture the canvas gives, so muscle memory carries across. */}
      <div
        onClick={() => { if (ceqId && !window.getSelection()?.toString()) hlx.clearCeq(ceqId); }}
        style={{
          position: "absolute",
          left: 72, right: 72,
          top: Math.round((card.y / 1600) * V.h) + 40,
          maxHeight: Math.round((card.h / 1600) * V.h),
        }}
      >
        {label ? (
          <div style={{
            fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 38, letterSpacing: "0.2em",
            textTransform: "uppercase", color: GOLD, marginBottom: 22, ...riseIn(head),
          }}>
            {label}
          </div>
        ) : null}

        <div
          ref={stemRef}
          onMouseUp={markStem}
          style={{
            fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: stemPx * 2.1,
            lineHeight: 1.16, color: BRAND_CREAM, textWrap: "balance",
            cursor: ceqId ? "text" : undefined, ...riseIn(body),
          }}
        >
          <Emph text={stem} range={ceqId ? hlx.stem(ceqId) : null} />
        </div>

        <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 20 }}>
          {choices.map((c, i) => {
            const t = reveal(progress, 0.20 + i * 0.06);
            const lit = showAnswer && c.correct;
            return (
              <div key={i} style={{
                display: "flex", gap: 20, alignItems: "flex-start",
                border: `2px solid ${lit ? CORRECT : "rgba(244,239,230,0.18)"}`,
                background: lit ? "rgba(59,245,160,0.10)" : "rgba(9,13,26,0.5)",
                borderRadius: 18, padding: "22px 26px", ...riseIn(t),
              }}>
                <span style={{
                  fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: choicePx * 1.5,
                  color: lit ? CORRECT : GOLD, lineHeight: 1.1, minWidth: 40,
                }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span
                  ref={(el) => { choiceRefs.current[i] = el; }}
                  onMouseUp={() => markChoice(i)}
                  style={{ fontSize: choicePx * 1.5, lineHeight: 1.24, color: BRAND_CREAM, cursor: ceqId ? "text" : undefined }}
                >
                  <Emph text={c.text} range={ceqId ? hlx.choice(ceqId, i) : null} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </VStage>
  );
}
