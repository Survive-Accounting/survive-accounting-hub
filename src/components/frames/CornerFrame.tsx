// CORNER frame (frames/) — the full-frame corner bolt watermark on the shared theme. Wraps the
// existing CornerBolt. Background defaults to "none" (a watermark shouldn't paint an atmosphere
// over what it overlays); pass a variant to use it as a standalone frame.
import type { ComponentProps } from "react";

import { CornerBolt } from "@/components/brand-cards/CornerBolt";
import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";

type CornerFrameProps = Omit<ComponentProps<typeof CornerBolt>, "scale"> & {
  theme?: FrameTheme;
  scale?: number;
  background?: FrameBgVariant | "none";
  animate?: boolean;
  className?: string;
};

export function CornerFrame({ theme, scale = 1, background = "none", animate = true, className, ...corner }: CornerFrameProps) {
  return (
    <div className={className} style={{ ...frameThemeVars(theme), position: "relative", width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto" }}>
      {background !== "none" && <div className="absolute inset-0" style={{ zIndex: 0 }}><FrameBackground variant={background} animate={animate} /></div>}
      <div className="absolute inset-0" style={{ zIndex: 1 }}><CornerBolt {...corner} scale={scale} /></div>
    </div>
  );
}
