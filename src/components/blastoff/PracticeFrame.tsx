// THE PRACTICE SLIDE, FILMED (practice-cta.ts has Lee's words and the two-surface rule). Full 9:16 in the
// end-of-topic shell: the chip, the heading, the line, and — where the site will show buttons — a quiet
// "Practice at surviveaccounting.com" plate that doesn't look tappable. The camera takes the corner.
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { Chip, END_OF_TOPIC_GEOM, Shell } from "./EndOfTopicFrames";
import type { BlastFrame } from "./plan";
import { PRACTICE_DOMAIN, practiceWords } from "./practice-cta";
import { DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";

export function PracticeFrame({ w, frame }: { w: number; frame: BlastFrame }) {
  const k = w / 306;
  const { chip, heading, line } = practiceWords(frame);
  return (
    <Shell w={w} k={k}>
      <div style={{ width: "100%", minHeight: 400 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 * k }}>
        <div style={{ width: END_OF_TOPIC_GEOM.headerW * k }}><Chip text={chip} k={k} /></div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 34 * k, lineHeight: 1.02, color: BRAND_CREAM, textWrap: "balance" as never }}>{heading}</div>
        <div style={{ fontSize: 15 * k, lineHeight: 1.35, color: "#C9D1E3", textWrap: "balance" as never }}>{line}</div>
        {/* NOT A BUTTON: an underlined line with the domain lit, so a viewer on a social app reads where
            to go instead of tapping a shape that does nothing. */}
        <div style={{ marginTop: 14 * k, display: "flex", flexDirection: "column", gap: 4 * k }}>
          <span style={{ fontSize: 12 * k, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8C9BBA" }}>Practice at</span>
          <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 26 * k, lineHeight: 1, color: GOLD, borderBottom: `${Math.max(1, 2 * k)}px solid ${GOLD}66`, paddingBottom: 4 * k, alignSelf: "flex-start" }}>{PRACTICE_DOMAIN}</span>
        </div>
      </div>
    </Shell>
  );
}
