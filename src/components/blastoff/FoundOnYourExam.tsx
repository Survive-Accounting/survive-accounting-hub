// FOUND ON YOUR EXAM — frame 2 of every Blast Off. The canonical question in
// quotes, then the costumes it shows up in. Generated from the set's own CEQ
// stems; every field is overridable because generation is a first draft.
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { DISPLAY_FONT, VStage, reveal, riseIn } from "./stage";
import { foundOnYourExam } from "./found-on-exam";

const GOLD = "#FCA311";

export function FoundOnYourExam({
  stems = [],
  canonical: canonicalIn,
  variations: variationsIn,
  progress,
  scale = 1,
  transparent = false,
}: {
  /** The set's CEQ stems — the component picks the distinct phrasings. */
  stems?: readonly string[];
  /** Overrides after generation. */
  canonical?: string;
  variations?: readonly string[];
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  const gen = foundOnYourExam(stems, canonicalIn);
  const canonical = canonicalIn ?? gen.canonical;
  const variations = variationsIn ?? gen.variations;

  const head = reveal(progress, 0.02, 0.08);
  const main = reveal(progress, 0.10);

  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{ position: "absolute", left: 84, right: 84, top: Math.round(1920 * 0.17) }}>
        <div style={{
          fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 44, letterSpacing: "0.18em",
          textTransform: "uppercase", color: GOLD, ...riseIn(head),
        }}>
          Found on your exam
        </div>

        <div style={{
          marginTop: 34, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 76,
          lineHeight: 1.14, color: BRAND_CREAM, textWrap: "balance", ...riseIn(main),
        }}>
          “{canonical}”
        </div>

        <div style={{ marginTop: 54, display: "flex", flexDirection: "column", gap: 26 }}>
          {variations.map((v, i) => {
            const t = reveal(progress, 0.26 + i * 0.10);
            return (
              <div key={v} style={{ display: "flex", gap: 20, alignItems: "flex-start", ...riseIn(t) }}>
                <span style={{ color: GOLD, fontSize: 42, fontWeight: 700, lineHeight: 1.25 }}>–</span>
                <span style={{ fontSize: 42, lineHeight: 1.25, color: BRAND_CREAM, opacity: 0.92 }}>“{v}”</span>
              </div>
            );
          })}
        </div>
      </div>
    </VStage>
  );
}
