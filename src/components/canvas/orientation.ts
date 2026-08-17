// ORIENTATION — the one place that knows what a frame's shape means.
//
// Lee films the landscape blast for the site, then films a vertical short from
// the SAME set: same CEQs, same memos, same spine, same F9 → F10 → auto-advance
// loop. Only the frame changes.
//
// SUPERSEDES part of the stitch/publication spec (Lee, 08-17): a 9:16
// publication is filmed NATIVELY VERTICAL. There is no crop, no reframe, no
// letterbox, and deliberately no renderer for one — a cropped 16:9 loses the CEQ
// card and the cutout, which is exactly why we film it twice instead.
//
// THE LAW HERE: orientation is a LAYOUT concern, never a content fork. The card,
// choices, memos, callouts, exhibits, highlights, boss styling and spine are
// identical in both. One CEQ, two ways of drawing it. Anything that branches on
// orientation to change *what is taught* is a bug.
//
// 9:16 is not 16:9 shrunk. It is watched on a phone at arm's length, so type
// steps UP rather than down (see TYPE_SCALE) and the card is re-typeset into a
// taller, narrower column with the camera cutout below it.

export type Orientation = "16:9" | "9:16";

export const ORIENTATIONS: readonly Orientation[] = ["16:9", "9:16"] as const;
export const DEFAULT_ORIENTATION: Orientation = "16:9";

export const isVertical = (o: Orientation): boolean => o === "9:16";

/** The delivered pixel size. Both are the standard for their shape, and both are
 *  what OBS must capture 1:1. */
export function captureSize(o: Orientation): { w: number; h: number } {
  return isVertical(o) ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

/** The authoring frame — the coordinate space cards are laid out in. Kept at the
 *  same aspect as the capture so nothing distorts between authoring and film,
 *  and small enough that the whole frame fits a laptop screen while authoring. */
export function frameSize(o: Orientation): { w: number; h: number } {
  return isVertical(o) ? { w: 900, h: 1600 } : { w: 1600, h: 900 };
}

/** TYPE STEPS UP ON A PHONE. A 9:16 frame is 900 units wide against 1600, so a
 *  stem set for landscape would render ~44% narrower in absolute terms and read
 *  as fine print at arm's length. This multiplier is applied to card type in
 *  vertical, and the floor below is what it may never go under. */
export const TYPE_SCALE: Record<Orientation, number> = { "16:9": 1, "9:16": 1.35 };

/** The legibility floor, in frame units, for the two things a viewer must read.
 *  A stem that cannot fit above these WRAPS — it never shrinks past them. */
export const MIN_TYPE = { stem: 30, choice: 26 } as const;

/** Resolve a card font size for an orientation, never below the floor. Pure. */
export function typeSize(base: number, o: Orientation, kind: "stem" | "choice" = "stem"): number {
  return Math.max(MIN_TYPE[kind], Math.round(base * TYPE_SCALE[o]));
}

// ------------------------------------------------------------- composition

/** VERTICAL COMPOSITION (Lee): the CEQ card takes the upper band, the camera
 *  cutout the lower. Fractions of frame height, adjustable and saved as the
 *  set's default vertical layout. */
export interface VerticalBands {
  /** Fraction of height the CEQ card occupies, from the top. */
  card: number;
  /** Fraction of height reserved for the camera cutout, at the bottom. */
  camera: number;
}

export const DEFAULT_VERTICAL_BANDS: VerticalBands = { card: 0.6, camera: 0.4 };

/** Lee's stated range — a card band outside it is a mistake, not a preference:
 *  too tall and the cutout has no room, too short and the CEQ can't be read. */
export const CARD_BAND_RANGE = { min: 0.55, max: 0.65 } as const;

export function clampBands(b: Partial<VerticalBands> | undefined): VerticalBands {
  const card = Math.min(CARD_BAND_RANGE.max, Math.max(CARD_BAND_RANGE.min, b?.card ?? DEFAULT_VERTICAL_BANDS.card));
  return { card, camera: Math.round((1 - card) * 1000) / 1000 };
}

/** The two zones in frame units, for laying out and for drawing guides. */
export function verticalZones(o: Orientation, bands: VerticalBands = DEFAULT_VERTICAL_BANDS): { card: Rect; camera: Rect } {
  const { w, h } = frameSize(o);
  if (!isVertical(o)) {
    // Landscape keeps its existing composition: the cutout sits bottom-right
    // over the frame rather than owning a band of its own.
    return { card: { x: 0, y: 0, w, h }, camera: { x: Math.round(w * 0.62), y: Math.round(h * 0.55), w: Math.round(w * 0.36), h: Math.round(h * 0.42) } };
  }
  const b = clampBands(bands);
  const cardH = Math.round(h * b.card);
  return { card: { x: 0, y: 0, w, h: cardH }, camera: { x: 0, y: cardH, w, h: h - cardH } };
}

export interface Rect { x: number; y: number; w: number; h: number }

// ------------------------------------------------------------ film-safe guides

/** FILM-SAFE GUIDES, recomputed per orientation. Title-safe is the classic 90%
 *  inset; the watermark and end-screen zones are ours.
 *
 *  The end-screen zone matters more in vertical: TikTok/Reels/Shorts overlay a
 *  caption, handle and action rail along the BOTTOM and RIGHT, so anything that
 *  must stay readable has to clear them. */
export interface SafeZones { titleSafe: Rect; camera: Rect; watermark: Rect; endScreen: Rect }

export function safeZones(o: Orientation, bands?: VerticalBands): SafeZones {
  const { w, h } = frameSize(o);
  const inset = (f: number): Rect => ({ x: Math.round(w * f), y: Math.round(h * f), w: Math.round(w * (1 - 2 * f)), h: Math.round(h * (1 - 2 * f)) });
  const zones = verticalZones(o, bands);
  if (!isVertical(o)) {
    return {
      titleSafe: inset(0.05),
      camera: zones.camera,
      watermark: { x: Math.round(w * 0.82), y: Math.round(h * 0.04), w: Math.round(w * 0.14), h: Math.round(h * 0.08) },
      endScreen: { x: Math.round(w * 0.68), y: Math.round(h * 0.72), w: Math.round(w * 0.3), h: Math.round(h * 0.26) },
    };
  }
  return {
    titleSafe: inset(0.05),
    camera: zones.camera,
    // Top-centre-right: clear of the phone's status bar, clear of the card's text column.
    watermark: { x: Math.round(w * 0.7), y: Math.round(h * 0.02), w: Math.round(w * 0.26), h: Math.round(h * 0.05) },
    // The social chrome band: bottom strip + right rail. Keep it empty.
    endScreen: { x: 0, y: Math.round(h * 0.82), w, h: Math.round(h * 0.18) },
  };
}

/** Does a rect stay clear of the social chrome? Used by the readiness check so a
 *  short isn't filmed with its punchline under a TikTok caption. */
export function clearsEndScreen(r: Rect, o: Orientation, bands?: VerticalBands): boolean {
  const z = safeZones(o, bands).endScreen;
  return r.y + r.h <= z.y || r.y >= z.y + z.h || r.x + r.w <= z.x || r.x >= z.x + z.w;
}

// ------------------------------------------------------------- exhibit fitting

/** EXHIBIT REFLOW (shared, so future T-account / JE / trial-balance cards inherit
 *  it). An exhibit authored for landscape is wider than a vertical frame; scale
 *  it to fit the card band with a margin, never past 1× — a diagram may shrink to
 *  fit a phone, but blowing it up past its authored size just softens it.
 *  Returns the scale to apply. Pure. */
export function exhibitFit(natural: { w: number; h: number }, o: Orientation, bands?: VerticalBands, margin = 0.92): number {
  const band = verticalZones(o, bands).card;
  if (natural.w <= 0 || natural.h <= 0) return 1;
  const s = Math.min((band.w * margin) / natural.w, (band.h * margin) / natural.h);
  return Math.min(1, Math.round(s * 1000) / 1000);
}
