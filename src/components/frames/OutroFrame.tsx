// OUTRO frame (frames/, D) — the outro sting on the shared theme + FrameBackground. `line` picks
// the tagline variant (exam / retake); `tagline` overrides. Standalone = orbital by default;
// inside a canvas FrameNode pass background="none". `transparent` drops the navy for OBS keying.
import { FrameBackground, type FrameBgVariant } from "./FrameBackground";
import { frameThemeVars, type FrameTheme } from "./frame-theme";
import { OutroSting, type OutroLine } from "./OutroSting";

type OutroFrameProps = {
  theme?: FrameTheme;
  scale?: number;
  background?: FrameBgVariant | "none";
  animate?: boolean;
  className?: string;
  line?: OutroLine;
  tagline?: string;
  url?: string;
  playKey?: number | string;
  transparent?: boolean;
};

export function OutroFrame({ theme, scale = 1, background = "orbital", animate = true, className, line, tagline, url, playKey, transparent }: OutroFrameProps) {
  const fill = transparent ? "transparent" : background === "none" ? "var(--brand-navy)" : undefined;
  return (
    <div className={className} style={{ ...frameThemeVars(theme), position: "relative", width: 1920 * scale, height: 1080 * scale, overflow: "hidden", flex: "0 0 auto", background: fill }}>
      {background !== "none" && <div className="absolute inset-0" style={{ zIndex: 0 }}><FrameBackground variant={background} animate={animate} /></div>}
      <div className="absolute inset-0" style={{ zIndex: 1 }}><OutroSting line={line} tagline={tagline} url={url} playKey={playKey} scale={scale} /></div>
    </div>
  );
}
