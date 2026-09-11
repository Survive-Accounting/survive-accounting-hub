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
// PASS 2 puts every card at the TOP of that column (eye lands there first),
// makes the card narrower and its type bigger so it reads portrait rather than
// landscape, and gives the camera the bottom-left of the column at a size that
// reads on a phone. On the intro the camera sits above the wordmark; on the
// open it stays off. Nothing here moves outside the column.
//
// NO CAPTION RAIL, SINCE 2026-09-12. A fixed band at .61h–.735h used to be held
// empty on every slide for burned-in captions. Lee, on videos now under a
// minute: "Should we just eliminate these? I think if we remove captions, it
// creates more space in the frame for us to teach from. Probably worth more
// than captions." Then: "Yes remove. And ensure that we're making more use of
// that space now. Update all slides to resize if they can and be better."
//
// So the content floor is simply SAFE.bottom, and what sat above the old rail
// grew into it: the camera, the picture band (IllustrationLayer), the slogan
// and big-callout bands, the end-of-topic and outline shells, Survibes' camera
// box, and the rubric. The burn's own geometry moved to lib/captions.ts, which
// still writes .ass / .srt for the offline CLI — a caption track costs no frame
// space, a burned-in one costs an eighth of the frame.
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

/** THE CONTENT FLOOR (2026-09-12) — how far down a slide may draw. It is the safe column's own
 *  bottom now that nothing is reserved for captions; every band that used to stop at the caption
 *  rail (.61h) reads this instead. */
export const CONTENT_BOTTOM = SAFE.bottom;

export interface CardPlacement {
  /** "top" = the card's top edge sits at SAFE.top (+ a breath); "centre" = the old deal. */
  align: "top" | "centre";
  /** The card's width in flow units (the canvas card is 560) and a type multiplier. */
  cardW?: number;
  scaleMul?: number;
}

/** Where a card kind sits in a layout. */
export function cardPlacement(layout: SlideLayout, kind: BlastFrame["kind"]): CardPlacement {
  // THE COLUMN KINDS (the rubric 2026-09-11, Types of accounts 2026-09-11) sit at the top of the
  // safe column in BOTH templates — they are fixed blocks sized from the phone, not flow cards.
  if (isColumnKind(kind)) return { align: "top" };
  if (layout === "pass1") return { align: "centre" };
  // Narrower and bigger: the drawn width is the same 560 × 1.04 it has always been — past that a
  // card runs under the like/share icons — but the type inside it grew 8 % when the captions went
  // (2026-09-12), so every line reads bigger in the same box.
  if (kind === "ceq") return { align: "top", cardW: 435, scaleMul: 1.34 };
  if (kind === "bio") return { align: "top", cardW: 480, scaleMul: 1.17 };
  return { align: "top", cardW: 445, scaleMul: 1.32 };           // the detours
}

/** The camera's default spot and size in a layout (absent frame.cam). */
export function camDefault(layout: SlideLayout, kind: BlastFrame["kind"]): { spot: CamSpot; size?: number } {
  // SLOGAN: camera off by default (Lee, 2026-09-10) — the words are the slide.
  if (kind === "open" || kind === "outro" || kind === "bolt" || kind === "ad" || kind === "slogan") return { spot: "off" };
  // THE MAP (2026-09-07): the small corner circle in both templates — a field wants the camera
  // out of the way (webcam-spots.defaultCamFor says the same).
  if (kind === "cluster") return { spot: "corner" };
  // THE RUBRIC (2026-09-11): content, camera small — the plain home circle in both templates. The
  // block's top row ends well above the circle, which sits in the L's crook (RubricFrame.tsx's
  // geometry, pinned in rubric-frame.test.ts).
  if (kind === "rubric") return { spot: "home", size: 0.32 };
  // THE END-OF-TOPIC FRAMES (2026-09-11): the corner bubble — the charge bar and the tease own
  // the column; the header block keeps clear of the corner (EndOfTopicFrames.tsx headerW).
  if (kind === "topic_done" || kind === "up_next" || kind === "outline") return { spot: "corner" };
  // TYPES OF ACCOUNTS (2026-09-11): the corner bubble too — the list takes the column down to the
  // bottom of the safe area, and the header keeps left of the corner (TypesFrame.tsx headerW).
  if (kind === "types") return { spot: "corner" };
  // SURVIBES (2026-09-11): the big rounded box on the LEFT (the brief: "the camera (large rounded
  // box, left)"), the struck bolt standing to its right — the `left` spot, which runs down to the
  // content floor since the captions box under it went (2026-09-12). A prop step swaps it for a
  // small circle under the prop card (BlastOffCapture, survibes.SURVIBES_PROP_CAM).
  if (kind === "survibes") return { spot: "left" };
  // MEMORIZE THIS / DEEPER IDEA (Deep Question since 2026-09-06; kind "tip") / BIO (Lee, fast
  // track 2026-09-05: "enlarge the camera frame … large enough to be viewable on a phone without
  // blocking any text"). Bigger than every other card slide's home camera, in both templates, and
  // bigger again since the captions went (2026-09-12) — nothing sits beside it to keep clear of
  // now. avoidCard (webcam-spots.ts) still shrinks it toward its own bottom-left corner if a tall
  // card reaches into it, so it can never cover the stem or the bullets.
  if (kind === "phrase" || kind === "tip" || kind === "tricky" || kind === "found" || kind === "ask" || kind === "bio") return { spot: "home", size: 0.38 };
  if (layout === "pass1") return { spot: kind === "intro" ? "corner" : "home", ...(kind === "intro" ? {} : { size: 0.32 }) };
  // Pass 2 (polish pass, 2026-09-05). THE INTRO IS RECTANGULAR — the talking-head portrait —
  // but at .48w, not the hero spot's .62w default: at .62w its bottom lands at .529h, under
  // the pass-2 wordmark block (introWordmarkTop .44h); at .48w the bottom is .434h and clears
  // it by ~1 % h. layout.test.ts pins that invariant.
  if (kind === "intro") return { spot: "hero", size: 0.48 };
  // THE HOME CIRCLE: .32w since the captions went (2026-09-12) — it used to be held at .28w so the
  // caption text beside it had a column to live in.
  return { spot: "home", size: 0.32 };
}

/** THE COLUMN KINDS (2026-09-11): slides laid out as one fixed column in phone units, flush to the
 *  safe column's left edge rather than centred, running down toward the content floor. Lee, on the
 *  rubric: "needs to make better use of our available space. It's too tucked into the top right
 *  corner." */
export const COLUMN_KINDS: readonly BlastFrame["kind"][] = ["rubric", "types"];
export function isColumnKind(kind: BlastFrame["kind"] | undefined): boolean { return !!kind && COLUMN_KINDS.includes(kind); }

/** The intro's wordmark block sits lower in pass 2 to leave the camera the top. */
export function introWordmarkTop(layout: SlideLayout): number {
  return layout === "pass2" ? 0.44 : 0.36;
}
