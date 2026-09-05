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
import { overlaps, type Box, type CamSpot } from "./capture/webcam-spots";

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
  // Pass 2 (polish pass, 2026-09-05). THE INTRO IS RECTANGULAR — the talking-head portrait —
  // but at .48w, not the hero spot's .62w default: at .62w its bottom lands at .529h, under
  // the pass-2 wordmark block (introWordmarkTop .44h); at .48w the bottom is .434h and clears
  // it by ~1 % h. layout.test.ts pins that invariant. THE HOME CIRCLE is .28w, ~7 % under the
  // .30 it was (Lee: "test reducing its default size approximately 5–10 %").
  if (kind === "intro") return { spot: "hero", size: 0.48 };
  return { spot: "home", size: 0.28 };
}

/** THE FIXED CAPTION RAIL (polish pass, 2026-09-05). Captions have ONE place on every slide,
 *  whatever the camera is doing (Lee: "The camera intentionally moves/swims around the
 *  composition between slides. Captions need their own fixed visual position."). Lower-middle
 *  of the canvas — not flush to the bottom edge (the platform's caption/title chrome lives
 *  there), never inside the card, never attached to the camera.
 *
 *  Read by three things, which is the point: the post-burn (lib/captions.ts, the ASS margins
 *  and type size), the Review stage's dashed reservation, and the /film chrome's collision
 *  readout. Change a number here and all three follow.
 *
 *    top / bottom   .61h – .735h. The text's bottom edge sits at .735h: above the campus banner
 *                   (.745h–.791h) and the SAFE.bottom .78h caption zone. Below the hero
 *                   wordmark's bottom edge (.585h — webcam-spots.wordmarkHero) so the two can
 *                   never collide.
 *    left           .35w: the pass-2 home camera's right edge (.05w + .28w) plus a breath.
 *    wideLeft       .07w when the slide has no camera.
 *    right          .84w = SAFE.right, inside the like/share rail.
 *    size           4.0 % of the height (77 px at 1920) — phone-readable; two lines at most.
 *    spoken         a SOFT gold for the word being said, not the full brand gold — the
 *                   emphasis is a lift in brightness, not a colour change (Lee: restrained). */
export const CAPTION_RAIL = {
  top: 0.61, bottom: 0.735, left: 0.35, wideLeft: 0.07, right: 0.84,
  size: 0.04, lineHeight: 1.12, maxLines: 2,
  ink: "#FFFFFF", spoken: "#FFD98A", stroke: "#0B1220", strokeW: 0.005,
} as const;

/** The rail in px on a phone w × h; `wide` when the slide films with no camera. */
export function captionRailRect(w: number, h: number, wide = false): Box {
  const left = wide ? CAPTION_RAIL.wideLeft : CAPTION_RAIL.left;
  return { x: Math.round(w * left), y: Math.round(h * CAPTION_RAIL.top), w: Math.round(w * (CAPTION_RAIL.right - left)), h: Math.round(h * (CAPTION_RAIL.bottom - CAPTION_RAIL.top)) };
}

/** Characters that fit on one rail line at `fontPx` — Rubik 900's average advance is ≈0.56em.
 *  Clamped so a huge or tiny frame still produces 3–7-word cards. */
export function captionLineChars(railWpx: number, fontPx: number): number {
  return Math.max(8, Math.min(22, Math.floor(railWpx / (fontPx * 0.56))));
}

export type RailStatus = "clear" | "card" | "illustration" | "camera";

/** Does anything sit on the rail? `art` first — it's the one Lee is most likely to have just
 *  dragged there on purpose (2026-09-05: the readout used to call this "ON THE CARD" even when
 *  the actual culprit was a placed illustration, since the card box handed in was already a
 *  card+picture union) — then the card, then the camera. */
export function captionRailClear(rail: Box, card: Box | null, cam: Box | null, art: Box | null = null): RailStatus {
  if (art && overlaps(rail, art)) return "illustration";
  if (card && overlaps(rail, card)) return "card";
  if (cam && overlaps(rail, cam)) return "camera";
  return "clear";
}

/** The intro's wordmark block sits lower in pass 2 to leave the camera the top. */
export function introWordmarkTop(layout: SlideLayout): number {
  return layout === "pass2" ? 0.44 : 0.36;
}
