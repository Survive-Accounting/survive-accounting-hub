// THE OPTIONAL ILLUSTRATION on a slide. Mounted by PhoneFrame as the stage's SECOND child,
// after FrameView, so the stage's centred grid places it in its own row under the card — it
// inherits the capture camera's transform and is re-keyed per frame like everything else on
// the stage. A slide with no illustration mounts nothing and keeps all its negative space.
//
// The band: below the card, above the fixed caption rail (layout.ts CAPTION_RAIL) — the
// height is what is left once the card has taken its share, capped so the picture never
// reaches the rail. Nothing here is a network call at render time beyond the <img> itself,
// which points at OUR bucket (never the provider's expiring URL). A fetch failure is loud:
// a small label, not a blank.
import { useState } from "react";

import { RasterBoil } from "@/components/brand-cards/RasterBoil";
import { BOIL_SECONDS } from "@/components/brand-cards/raster-boil";

import type { FrameIllustration } from "./illustration";
import { CAPTION_RAIL, SAFE } from "./layout";

export function IllustrationLayer({ ill, w, h, live, boilFrame }: {
  ill: FrameIllustration; w: number; h: number; live: boolean; boilFrame?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!ill.assetUrl) return null;
  // The band's width is the safe column; its height is a fixed share of the frame that stays
  // clear of the rail on a pass-2 card. The picture is square (1024×1024), contained.
  const bw = Math.round(w * (SAFE.right - SAFE.left) * 0.62);
  const bh = Math.min(bw, Math.round(h * (CAPTION_RAIL.top - 0.02 - 0.36)));
  const preset = ill.animationPreset ?? "boil";
  const marginTop = Math.round(h * 0.018);
  if (failed) {
    return (
      <div data-sa-illustration="" style={{ width: bw, height: Math.round(h * 0.04), marginTop, display: "grid", placeItems: "center", color: "rgba(252,163,17,0.9)", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: Math.max(10, Math.round(h * 0.014)), fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        illustration failed to load
      </div>
    );
  }
  if (preset === "none") {
    return (
      <span data-sa-illustration="" style={{ position: "relative", display: "block", width: bw, height: bh, marginTop }}>
        <img src={ill.assetUrl} alt={ill.prompt ?? ""} decoding="sync" loading="eager" draggable={false} onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      </span>
    );
  }
  return (
    <span style={{ display: "block", marginTop }} onErrorCapture={() => setFailed(true)}>
      <RasterBoil src={ill.assetUrl} width={bw} height={bh} alt={ill.prompt ?? ""} live={live} boilFrame={boilFrame}
        boilSeconds={preset === "boil-calm" ? BOIL_SECONDS["boil-calm"] : BOIL_SECONDS.boil}
        options={{ seed: ill.seed ?? 7 }} />
    </span>
  );
}
