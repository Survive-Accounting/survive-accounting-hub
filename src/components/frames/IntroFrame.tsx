// INTRO frame (frames/, C) — the SILENT intro sting on the shared theme + FrameBackground. The
// byline comes from a PROP ("Cram videos by [tutor]"); topicChip (optional) turns it into the
// player pre-roll. Standalone use = orbital by default; inside a canvas FrameNode pass
// background="none" (the frame draws its own world). `transparent` drops the navy for OBS keying.
import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";
import { IntroSting } from "./IntroSting";

type IntroFrameProps = {
  theme?: FrameTheme;
  scale?: number;
  background?: FrameBgVariant | "none";
  animate?: boolean;
  className?: string;
  byline?: string;
  topicChip?: string;
  playKey?: number | string;
  transparent?: boolean;
};

export function IntroFrame({ theme, scale = 1, background = "orbital", animate = true, className, byline, topicChip, playKey, transparent }: IntroFrameProps) {
  const fill = transparent ? "transparent" : background === "none" ? "var(--brand-navy)" : undefined;
  return (
    <div className={className} style={{ ...frameThemeVars(theme), position: "relative", width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto", background: fill }}>
      {background !== "none" && <div className="absolute inset-0" style={{ zIndex: 0 }}><FrameBackground variant={background} animate={animate} /></div>}
      <div className="absolute inset-0" style={{ zIndex: 1 }}><IntroSting byline={byline} topicChip={topicChip} playKey={playKey} scale={scale} /></div>
    </div>
  );
}
