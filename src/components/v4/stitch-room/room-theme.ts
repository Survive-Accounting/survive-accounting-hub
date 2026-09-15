// The Stitch Room's colours — the film tool's own dark palette.
export const ROOM = {
  bg: "#070B14",
  panel: "#0D1426",
  edge: "#2A3654",
  cream: "#F5EFE6",
  muted: "#8C9BBA",
  gold: "#FCA311",
  sky: "#7DD3FC",
  mint: "#3BF5A0",
  red: "#FF7A6B",
  font: "'Rubik', system-ui, sans-serif",
} as const;

export const ANIM_KEY = "sa-stitch-anim";
export function readAnimOn(): boolean { try { return localStorage.getItem(ANIM_KEY) !== "off"; } catch { return true; } }
export function writeAnimOn(on: boolean) { try { localStorage.setItem(ANIM_KEY, on ? "on" : "off"); } catch { /* this visit only */ } }
