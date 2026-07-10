// Present Canvas — synthwave neon theme tokens. Deep purple-black table, neon pink/yellow
// accents, cyan for "correct/agree" states. Tuned to read well on a 1080p recording.
export const NEON = {
  bg: "#0b0714",
  bg2: "#160d28",
  panel: "rgba(22,13,40,0.86)",
  panelSolid: "#160d28",
  pink: "#ff2d95",
  pinkSoft: "#ff6ac1",
  yellow: "#ffd23f",
  cyan: "#22e0d6",
  green: "#3bf5a0",
  red: "#ff5c7a",
  text: "#f3e9ff",
  muted: "#a892c9",
  border: "rgba(255,45,149,0.38)",
  borderSoft: "rgba(168,146,201,0.28)",
  glow: "0 0 0 1px rgba(255,45,149,0.35), 0 0 22px -6px rgba(255,45,149,0.55)",
} as const;

// Note-card marker colors (neon).
export const NOTE_COLORS = [
  { name: "pink", ink: "#ff6ac1", bg: "rgba(255,45,149,0.10)", border: "rgba(255,106,193,0.55)" },
  { name: "yellow", ink: "#ffd23f", bg: "rgba(255,210,63,0.10)", border: "rgba(255,210,63,0.55)" },
  { name: "cyan", ink: "#22e0d6", bg: "rgba(34,224,214,0.10)", border: "rgba(34,224,214,0.55)" },
] as const;
