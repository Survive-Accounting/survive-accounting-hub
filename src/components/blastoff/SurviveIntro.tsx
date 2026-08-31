// THE INTRO — on screen for a beat while Lee says "we're about to blast off on
// [topic]." Same lockup as the outro so the two bookend each other: wordmark
// (ONE bolt, as the "i"), a rule, the set name, and the credit.
//
// The set name is the only thing that changes between videos, which is why it
// is a prop and not a text layer Lee has to retype.
import { SurviveWordmark, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { DISPLAY_FONT, UPPER_THIRD_Y, VStage, boilAt, reveal, riseIn } from "./stage";

const WORD = 150; // smaller than the outro — the TOPIC is the message here

export function SurviveIntro({
  topic,
  tutor = "Lee Ingram",
  progress,
  scale = 1,
  transparent = false,
}: {
  topic: string;
  tutor?: string;
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  const rule = reveal(progress, 0.08, 0.10);
  const name = reveal(progress, 0.16);
  const by = reveal(progress, 0.34);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{
        position: "absolute", left: 80, right: 80, top: UPPER_THIRD_Y,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      }}>
        <SurviveWordmark size={WORD} boilFrame={boilAt(progress)} />

        <div style={{ height: 3, width: `${rule * 100}%`, background: BRAND_CREAM, opacity: 0.35, marginTop: 40, borderRadius: 2 }} />

        <div style={{
          marginTop: 40, fontFamily: DISPLAY_FONT, fontWeight: 800,
          fontSize: 86, lineHeight: 1.06, letterSpacing: "0.01em",
          textTransform: "uppercase", color: BRAND_CREAM, textWrap: "balance",
          ...riseIn(name),
        }}>
          {topic}
        </div>

        <div style={{ marginTop: 30, fontWeight: 500, fontSize: 40, color: BRAND_CREAM, opacity: by * 0.62, transform: riseIn(by).transform }}>
          tutored by {tutor}
        </div>
      </div>
    </VStage>
  );
}
