// OUTRO frame (frames/) — the outro card on the shared theme + FrameBackground. A wraps the
// existing OutroCard; D rebuilds it (line variants) on FrameStage. Background rules as IntroFrame.
import type { ComponentProps } from "react";

import { OutroCard } from "@/components/brand-cards/OutroCard";
import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";

type OutroFrameProps = Omit<ComponentProps<typeof OutroCard>, "scale"> & {
  theme?: FrameTheme;
  scale?: number;
  background?: FrameBgVariant | "none";
  animate?: boolean;
  className?: string;
};

export function OutroFrame({ theme, scale = 1, background = "orbital", animate = true, className, ...outro }: OutroFrameProps) {
  return (
    <div className={className} style={{ ...frameThemeVars(theme), position: "relative", width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto" }}>
      {background !== "none" && <div className="absolute inset-0" style={{ zIndex: 0 }}><FrameBackground variant={background} animate={animate} /></div>}
      <div className="absolute inset-0" style={{ zIndex: 1 }}><OutroCard {...outro} scale={scale} /></div>
    </div>
  );
}
