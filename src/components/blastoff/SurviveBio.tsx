// THE BIO SLOT — the end slate that sits after the answer and before the
// sign-off, in the same position on every Blast Off. Spec: Lee, 2026-09-01.
//
// WHY THE POSITION IS FIXED. It is the slot, not the card, that matters: once
// every video has a beat here, the same beat can later hold the chapter ask, the
// rep ask or the syllabus ask, filmed separately and dropped in at the edit
// without reshooting anything. Keep any replacement the same length as this.
//
// FOUR LINES, NOTHING MORE. Low-key by design — "the people who read it are the
// ones who'll care". No wordmark and no bolt here: this card is the one place in
// the family that is a person rather than a brand, and the sign-off frame right
// after it carries the lockup.
//
// MIDDLE THIRD, not the upper third the intro and outro use. Shorts and Reels
// overlay captions along the bottom and their own UI in the top corners, so the
// vertical centre is the only band that survives on both.
//
// DELIBERATELY STATIC. It takes `progress` like every card in this family, and
// ignores it. Lee: "Don't animate the text in line by line; it's the last thing
// before the sign-off and motion there reads as a commercial." Holding it ~4
// seconds is a timeline decision, not something this card should perform.
//
// THE CLAIMS ARE LOAD-BEARING. "1,000+ students tutored since 2015" is across
// intro accounting overall — never a thousand in any one course. Do not add a
// grade promise or a guarantee that any specific exam is fully covered.
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { DISPLAY_FONT, VStage, V } from "./stage";

const NAME = 92;  // cap-height px for the name — read at a glance, not shouted

export function SurviveBio({
  name = "Lee Ingram",
  credentials = "BAccy · MAccy — Ole Miss",
  claim = "1,000+ students tutored since 2015",
  domain = "surviveaccounting.com",
  scale = 1,
  transparent = false,
}: {
  name?: string;
  credentials?: string;
  claim?: string;
  domain?: string;
  /** Accepted for parity with the rest of the family, and deliberately unused —
   *  see the note above about motion in this slot. */
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{
        position: "absolute", left: 0, right: 0,
        // Vertically centred: the middle third is the band Shorts and Reels
        // leave alone at both ends.
        top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        paddingLeft: Math.round(V.w * 0.10), paddingRight: Math.round(V.w * 0.10),
      }}>
        <div style={{
          fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: NAME, lineHeight: 1,
          letterSpacing: "0.02em", textTransform: "uppercase", color: BRAND_CREAM,
        }}>
          {name}
        </div>
        <div style={{
          marginTop: 52, fontWeight: 600, fontSize: Math.round(NAME * 0.46),
          lineHeight: 1.35, color: BRAND_CREAM, opacity: 0.9,
        }}>
          {credentials}
        </div>
        <div style={{
          marginTop: 14, fontWeight: 600, fontSize: Math.round(NAME * 0.46),
          lineHeight: 1.35, color: BRAND_CREAM, opacity: 0.9,
        }}>
          {claim}
        </div>
        <div style={{
          marginTop: 58, fontWeight: 600, fontSize: Math.round(NAME * 0.38),
          lineHeight: 1, letterSpacing: "0.01em", color: BRAND_CREAM, opacity: 0.6,
        }}>
          {domain}
        </div>
      </div>
    </VStage>
  );
}
