// CORNER BOLT — the boiling bolt ALONE as a persistent watermark for short-form video
// (Shorts/Reels/TikTok, where there is no intro card). ~64px tall, 70% opacity, 48px safe-
// area inset. Renders on the 1920x1080 stage (transparent by default) so it can be keyed
// or composited. `corner` picks which safe corner it sits in. React only.
import type { CSSProperties } from "react";

import { Stage, BoltBoil } from "./bolt-boil";

type Corner = "tl" | "tr" | "bl" | "br";

export function CornerBolt({ corner = "tr", inset = 48, height = 64, opacity = 0.7, scale = 1, transparent = true }:
  { corner?: Corner; inset?: number; height?: number; opacity?: number; scale?: number; transparent?: boolean }) {
  const pos: CSSProperties = { position: "absolute" };
  if (corner === "tl" || corner === "bl") pos.left = inset; else pos.right = inset;
  if (corner === "tl" || corner === "tr") pos.top = inset; else pos.bottom = inset;
  return (
    <Stage scale={scale} transparent={transparent}>
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={pos}><BoltBoil height={height} opacity={opacity} /></div>
      </div>
    </Stage>
  );
}
