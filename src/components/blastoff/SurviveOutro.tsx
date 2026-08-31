// THE OUTRO — identical on every Blast Off, generated, never hand-placed.
//
// Lockup (Lee, 2026-08-30): wordmark, tagline, domain. ONE bolt, and it is the
// "i". The earlier sketch had a second bolt floating above the wordmark; Lee
// cut it — two bolts read as two logos, and the wordmark alone is the
// consistent vertical usage.
//
// Placed in the upper third: YouTube stacks its end-screen cards over the
// bottom of a vertical frame and captions sit above those, so a centred outro
// is a covered outro. Nothing renders above it — the landscape version used to
// carry a header here and it does not belong on camera.
import { SurviveWordmark, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { UPPER_THIRD_Y, VStage, boilAt, reveal, riseIn } from "./stage";

const WORD = 190; // cap-height px — the wordmark is the loudest thing on screen

export function SurviveOutro({
  tagline = "Cram what's on your exam.",
  domain = "surviveaccounting.com",
  progress,
  scale = 1,
  transparent = false,
}: {
  tagline?: string;
  domain?: string;
  /** 0..1 through the card's hold. Omit for the finished still. */
  progress?: number;
  scale?: number;
  transparent?: boolean;
}) {
  const tag = reveal(progress, 0.10);
  const url = reveal(progress, 0.28);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{
        position: "absolute", left: 0, right: 0, top: UPPER_THIRD_Y,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      }}>
        <SurviveWordmark size={WORD} boilFrame={boilAt(progress)} />
        <div style={{ marginTop: 44, fontWeight: 600, fontSize: Math.round(WORD * 0.30), color: BRAND_CREAM, lineHeight: 1.15, ...riseIn(tag) }}>
          {tagline}
        </div>
        <div style={{ marginTop: 26, fontWeight: 600, fontSize: Math.round(WORD * 0.19), color: BRAND_CREAM, letterSpacing: "0.01em", lineHeight: 1, opacity: url * 0.6, transform: riseIn(url).transform }}>
          {domain}
        </div>
      </div>
    </VStage>
  );
}
