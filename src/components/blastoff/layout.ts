// THE SLIDE TEMPLATE — pass 1 (what filmed today) and pass 2 (the vertical
// template built for the format).
//
// Lee (2026-09-05, the overnight brief): "Makes better use of the space
// available in the frame … far too much space above … the questions/detours
// may work better less rectangular like landscape and more portrait-y … best
// practices for shorts … ensure it doesn't move out of safe zones … the camera
// movement is really cool … cameras a bit bigger and placed better in
// correlation to the content — intro slide 2, the camera above the Survive …
// make this the most amazing shorts slide template imaginable. We will be
// making hundreds of shorts in this format."
//
// THE FRAME, 1080 × 1920, in fractions. The zones a phone paints its own UI
// over: status bar 0–9 %, caption / title / sound 80–100 %, the like / share
// rail on the right 16 % from 30 % to 80 %. The content column is what is
// left: x 5–84 %, y 10–78 %.
//
// PASS 2 puts every card at the TOP of that column (eye lands there first,
// captions live below), makes the card narrower and its type bigger so it
// reads portrait rather than landscape, and gives the camera the bottom-left
// of the column at a size that reads on a phone. On the intro the camera sits
// above the wordmark; on the open it stays off. Nothing here moves outside
// the column.
import type { BlastFrame } from "./plan";
import type { CamSpot } from "./capture/webcam-spots";

export const LAYOUTS = ["pass1", "pass2"] as const;
export type SlideLayout = (typeof LAYOUTS)[number];
export const LAYOUT_LABEL: Record<SlideLayout, string> = { pass1: "Pass 1 · the current slides", pass2: "Pass 2 · the vertical template" };
export function isLayout(v: unknown): v is SlideLayout { return typeof v === "string" && (LAYOUTS as readonly string[]).includes(v); }

/** The layout a surface renders: the plan's, unless this browser has a QA
 *  override (localStorage `sa-layout-qa`) — how a pass is previewed on a set
 *  without changing what the set has saved. */
export function layoutOf(plan: { layout?: string } | null | undefined): SlideLayout {
  try { const qa = typeof window !== "undefined" ? window.localStorage.getItem("sa-layout-qa") : null; if (isLayout(qa)) return qa; } catch { /* ignore */ }
  return isLayout(plan?.layout) ? plan.layout : "pass1";
}

/** The Shorts safe column, as fractions of the frame. */
export const SAFE = { top: 0.10, bottom: 0.78, left: 0.05, right: 0.84 } as const;

export interface CardPlacement {
  /** "top" = the card's top edge sits at SAFE.top (+ a breath); "centre" = the old deal. */
  align: "top" | "centre";
  /** The card's width in flow units (the canvas card is 560) and a type multiplier. */
  cardW?: number;
  scaleMul?: number;
}

/** Where a card kind sits in a layout. */
export function cardPlacement(layout: SlideLayout, kind: BlastFrame["kind"]): CardPlacement {
  if (layout === "pass1") return { align: "centre" };
  // Narrower and bigger: 470 flow units at ×1.24 is the same width as 560 at
  // ×1.04 but every line is a fifth larger, so four choices stack tall.
  if (kind === "ceq") return { align: "top", cardW: 470, scaleMul: 1.24 };
  if (kind === "bio") return { align: "top", cardW: 520, scaleMul: 1.08 };
  return { align: "top", cardW: 480, scaleMul: 1.22 };           // the detours
}

/** The camera's default spot and size in a layout (absent frame.cam). */
export function camDefault(layout: SlideLayout, kind: BlastFrame["kind"]): { spot: CamSpot; size?: number } {
  if (kind === "open" || kind === "outro" || kind === "bolt" || kind === "ad") return { spot: "off" };
  if (layout === "pass1") return { spot: kind === "intro" ? "corner" : "home" };
  // Pass 2: bigger everywhere; above the wordmark on the intro.
  if (kind === "intro") return { spot: "top", size: 0.34 };
  return { spot: "home", size: 0.3 };
}

/** The intro's wordmark block sits lower in pass 2 to leave the camera the top. */
export function introWordmarkTop(layout: SlideLayout): number {
  return layout === "pass2" ? 0.44 : 0.36;
}
