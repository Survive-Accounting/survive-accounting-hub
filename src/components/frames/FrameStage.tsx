// FRAME STAGE (frames/) — the ONE fixed 1920x1080 stage + scale wrapper for every frame. It
// applies the CSS-variable theme to its subtree and renders the shared FrameBackground behind
// its children by default. `vertical` reserves the 1080x1920 stage size (layouts not built yet
// — it just sizes the stage so a later vertical pass isn't blocked). Used directly by frames
// built from scratch (B/C/D); the composed IntroFrame/OutroFrame wrap their existing card's own
// stage instead. Replaces the ad-hoc bolt-boil `Stage`.
import type { CSSProperties, ReactNode } from "react";

import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";

export function FrameStage({ theme, scale = 1, vertical = false, background = "orbital", bgIntensity, animate = true, transparent = false, style, children }: {
  theme?: FrameTheme;
  scale?: number;
  vertical?: boolean;
  background?: FrameBgVariant | "none";
  bgIntensity?: number;
  animate?: boolean;
  transparent?: boolean; // drop the navy fill for OBS keying (the background layer still renders unless "none")
  style?: CSSProperties;
  children: ReactNode;
}) {
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  return (
    <div style={{ width: W * scale, height: H * scale, overflow: "hidden", flex: "0 0 auto", ...style }}>
      <div style={{ ...frameThemeVars(theme), width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", overflow: "hidden", background: transparent ? "transparent" : "var(--brand-navy)" }}>
        {background !== "none" && <FrameBackground variant={background} intensity={bgIntensity ?? 0.3} animate={animate} />}
        <div className="absolute inset-0 grid place-items-center" style={{ zIndex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
