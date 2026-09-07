// THE MAP'S PALETTE — the house colours the film already uses (stage.tsx, CalloutCard's detour,
// the Editor's chrome), named once for the node renderers. Every node draws in FIELD pixels
// (the phone is 1080 wide; ClusterStage scales the whole field), so a size here is a size on a
// 1080-wide phone at zoom 1.
import { BRAND_FONT, DISPLAY_FONT } from "../../stage";

export { BRAND_FONT, DISPLAY_FONT };

export const INK = {
  cream: "#F5EFE6",
  creamMuted: "rgba(245,239,230,0.62)",
  creamFaint: "rgba(245,239,230,0.28)",
  navy: "#14213D",
  navyInk: "#14213D",
  navyMuted: "rgba(20,33,61,0.62)",
  gold: "#FCA311",
  mint: "#3BF5A0",
  orange: "#FF9F43",
  red: "#C22B45",
  /** The ledger paper — the same cream the detour ink uses, as a ground. */
  paper: "#F5EFE6",
  paperRule: "rgba(20,33,61,0.16)",
  paperMargin: "rgba(194,43,69,0.55)",
} as const;

/** The rubric type chip's colour, A / L / E / R / X — the Rubric board's own regions. */
export const TYPE_COLOR: Record<"A" | "L" | "E" | "R" | "X", string> = { A: "#1F9D57", L: "#C77D0A", E: "#6D5BB8", R: "#1D7FA8", X: "#C22B45" };

/** The rise every revealed node plays once, on arrival (stage.tsx's riseIn as a keyframe). */
export const NODE_CSS = `
@keyframes sa-map-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes sa-map-pop { 0% { transform: scale(0.6); opacity: 0.4; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); } }
.sa-map-rise { animation: sa-map-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.sa-map-pop { display: inline-block; animation: sa-map-pop 320ms cubic-bezier(0.34, 1.3, 0.64, 1) both; }
.sa-map-term { cursor: default; }
.film-mode .sa-map-term[data-live="1"] { cursor: pointer; }
.film-mode .sa-map-term[data-live="1"]:hover { text-decoration: underline; text-decoration-color: rgba(252,163,17,0.55); text-underline-offset: 0.12em; }
@media (prefers-reduced-motion: reduce) { .sa-map-rise, .sa-map-pop { animation: none; } }
`;
