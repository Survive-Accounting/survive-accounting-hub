// INTRO frame (frames/) — the animated sting on the shared theme + FrameBackground. A wraps the
// existing AnimatedIntro (visuals unchanged); C rebuilds its internals directly on FrameStage.
// The card owns its own scale/Stage; FrameBackground is layered BEHIND it (no double-scale).
// Standalone (player/preview) = orbital by default (pass transparent so it shows through);
// INSIDE a canvas FrameNode pass background="none" (the frame already draws its own world).
import type { ComponentProps } from "react";

import { AnimatedIntro } from "@/components/brand-cards/AnimatedIntro";
import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";

type IntroFrameProps = Omit<ComponentProps<typeof AnimatedIntro>, "scale"> & {
  theme?: FrameTheme;
  scale?: number;
  background?: FrameBgVariant | "none";
  animate?: boolean;
  className?: string;
};

export function IntroFrame({ theme, scale = 1, background = "orbital", animate = true, className, ...intro }: IntroFrameProps) {
  return (
    <div className={className} style={{ ...frameThemeVars(theme), position: "relative", width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto" }}>
      {background !== "none" && <div className="absolute inset-0" style={{ zIndex: 0 }}><FrameBackground variant={background} animate={animate} /></div>}
      <div className="absolute inset-0" style={{ zIndex: 1 }}><AnimatedIntro {...intro} scale={scale} /></div>
    </div>
  );
}
