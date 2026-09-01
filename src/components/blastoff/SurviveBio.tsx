// THE BIO CARD — second to last, immediately before the outro.
//
// LEE'S SPEC (2026-09-01): it is NOT a "Lee Ingram" title card. It is the SAME
// survive lockup the outro uses, with the credentials underneath — so cutting
// bio → outro reads as the lines changing while the wordmark holds still,
// rather than as two different slides.
//
// That effect is entirely a matter of geometry, so this file deliberately
// borrows the outro's numbers instead of picking its own: same WORD size, same
// UPPER_THIRD_Y, same first-line offset. Change one and change both, or the
// wordmark jumps on the cut — which is the exact thing this replaces (the old
// bio slide was a hand-made frame holding an empty note, which filmed white).
//
// ONE BOLT, and it is the "i" in surv[bolt]ve — SurviveWordmark is the whole
// lockup; nothing else here draws a bolt.
import { SurviveWordmark, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { UPPER_THIRD_Y, VStage, boilAt, reveal, riseIn } from "./stage";

/** MUST match SurviveOutro's WORD. The two cards are a matched pair; the
 *  wordmark holding its exact size and position across the cut is the effect. */
const WORD = 190;

export function SurviveBio({
  credentials = "BAccy • MAccy — Ole Miss",
  proof = "1,000+ students tutored since 2015",
  tutor = "Lee Ingram",
  progress,
  scale = 1,
  transparent = false,
}: {
  /** The degrees line. */
  credentials?: string;
  /** The one number that earns trust. Blank to drop the line entirely. */
  proof?: string;
  /** Reads as "tutored by ___" — where the outro puts its domain. */
  tutor?: string;
  /** 0..1 through the card's hold. Omit for the finished still. */
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  const cred = reveal(progress, 0.10);
  const pf = reveal(progress, 0.20);
  const by = reveal(progress, 0.30);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{
        position: "absolute", left: 0, right: 0, top: UPPER_THIRD_Y,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      }}>
        <SurviveWordmark size={WORD} boilFrame={boilAt(progress)} />

        {/* Same 44px first-line offset and 0.30 size as the outro's tagline, so
            the credentials land exactly where "Cram what's on your exam." does. */}
        <div style={{ marginTop: 44, fontWeight: 600, fontSize: Math.round(WORD * 0.30), color: BRAND_CREAM, lineHeight: 1.15, ...riseIn(cred) }}>
          {credentials}
        </div>

        {proof ? (
          <div style={{ marginTop: 18, fontWeight: 500, fontSize: Math.round(WORD * 0.22), color: BRAND_CREAM, opacity: pf * 0.78, lineHeight: 1.2, transform: riseIn(pf).transform }}>
            {proof}
          </div>
        ) : null}

        {/* Where the outro puts surviveaccounting.com — same offset, same size,
            same muted weight, so the two swap cleanly. */}
        <div style={{ marginTop: 26, fontWeight: 600, fontSize: Math.round(WORD * 0.19), color: BRAND_CREAM, letterSpacing: "0.01em", lineHeight: 1, opacity: by * 0.6, transform: riseIn(by).transform }}>
          tutored by {tutor}
        </div>
      </div>
    </VStage>
  );
}
