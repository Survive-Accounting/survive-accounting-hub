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
import { CampusBanner } from "@/components/brand-cards/BoltZoom";
import { UPPER_THIRD_Y, V, VStage, boilAt, reveal, riseIn } from "./stage";

const WORD = 190; // cap-height px — the wordmark is the loudest thing on screen

export function SurviveOutro({
  tagline = "Cram what's on your exam.",
  domain = "surviveaccounting.com",
  progress,
  scale = 1,
  transparent = false,
  banner = false,
}: {
  tagline?: string;
  domain?: string;
  /** 0..1 through the card's hold. Omit for the finished still. */
  progress?: number;
  scale?: number;
  transparent?: boolean;
  /** The slow Power Four ticker (2026-09-06, Lee: "let me add campus scroller at the end outro
   *  card") — the ReviewDeck "🏫 campus banner" toggle already writes frame.banner for any
   *  slide, outro included; this was just never reading it. Same relative Y as the open/intro
   *  cards' own banner, so all three read as one consistent strip. */
  banner?: boolean;
}) {
  const tag = reveal(progress, 0.10);
  const url = reveal(progress, 0.28);
  // THE ARRIVAL FLASH (2026-09-06, Lee: "the final transition to outro should be a white flash
  // type emoji — like this came out of heaven"). A quick white-out that's already fading by the
  // time the wordmark itself would be visible — one held instant, not a strobe. Only on the
  // live transition; the static still (progress undefined, used for a finished preview/export
  // frame) shows no flash, since there's no arrival to mark.
  const flash = progress === undefined ? 0 : Math.max(0, 1 - progress / 0.12);
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
      {banner && <CampusBanner w={V.w} h={V.h} live={progress === undefined} />}
      {flash > 0 && <div aria-hidden style={{ position: "absolute", inset: 0, background: "#FFFFFF", opacity: flash, pointerEvents: "none" }} />}
    </VStage>
  );
}
