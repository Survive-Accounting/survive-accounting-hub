// FRAMES — the ONE shared frame library used by BOTH the Study Canvas (filming) and the HTML
// video player (DOM overlays for school-color variants without re-rendering video). Build once.
//
// Foundation: FrameStage (1920x1080 + scale + CSS-variable theme, vertical reserved),
// FrameBackground (shared atmosphere, reuses canvas WorldBackground), frame-theme (CSS vars +
// school variants). Frames: IntroFrame / OutroFrame / CornerFrame (A wraps the existing cards;
// B/C/D rebuild the intro/outro/CEQ-hook internals directly on FrameStage).
export { FrameStage } from "./FrameStage";
export { FrameBackground, type FrameBgVariant } from "./FrameBackground";
export { frameThemeVars, schoolFrameTheme, DEFAULT_FRAME_THEME, type FrameTheme } from "./frame-theme";
export { IntroFrame } from "./IntroFrame";
export { IntroSting } from "./IntroSting";
export { OutroFrame } from "./OutroFrame";
export { OutroSting, type OutroLine } from "./OutroSting";
export { CornerFrame } from "./CornerFrame";
