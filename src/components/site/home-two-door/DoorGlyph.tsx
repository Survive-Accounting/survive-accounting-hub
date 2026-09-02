// THE HOME PAGE'S DOOR ICONS — big, flat, one colour, nothing behind them.
//
// ── WHAT THIS REPLACES, AND WHY ───────────────────────────────────────────────────────────────
// BoltBadge composed three layers: the Survive bolt as a rotated backdrop, a heavy knockout in
// the card colour, and the glyph on top. It is a good piece of work and it is not deleted — it
// moves to /learn, where a badge has room and a reason to be a composition.
//
// It was wrong HERE for one reason: on a card, the icon's whole job is to explain the card before
// anyone reads a word, and it can only do that if it is instantly legible at a glance. Three
// overlapping layers at 112px — of which the glyph itself was only 52px — is a small illustration,
// not a sign. Reference is speechnotes.co: the icon is huge, flat, single-colour, and nothing
// overlaps it.
//
// ── OPTICAL MATCHING, WHICH IS NOT PIXEL MATCHING ─────────────────────────────────────────────
// The two glyphs do not carry their ink the same way. lucide's GraduationCap is a wide, shallow
// shape — its ink spans nearly the full 24-unit width but only about two thirds of the height —
// while House is close to a square silhouette. Rendered at the same `size`, the cap looks WIDER
// and the house looks TALLER, and the pair reads as mismatched even though the boxes are
// identical.
//
// So each glyph carries its own scale factor, measured from the rendered ink rather than guessed
// from the box (see the numbers below). Everything else — colour, stroke weight, stroke behaviour
// — is shared and may not be branched on the glyph, which is the same symmetry contract BoltBadge
// held and the reason the two doors have never drifted apart.
import { GraduationCap, House } from "lucide-react";

export type DoorGlyphKind = "cap" | "house";

const GLYPHS: Record<DoorGlyphKind, typeof GraduationCap> = { cap: GraduationCap, house: House };

/** PER-GLYPH SCALE — the only thing allowed to differ.
 *
 *  ── THESE NUMBERS WERE MEASURED, NOT GUESSED ────────────────────────────────────────────────
 *  My first pass reasoned from the viewBox and got it backwards: it assumed the cap dominated and
 *  scaled the HOUSE up to compensate. Rendered and measured at 190px (getBBox on the live SVG,
 *  scaled to CSS pixels), the truth was the other way round:
 *
 *    cap    at 0.92 → ink 146 x 102, area 14,899
 *    house  at 1.06 → ink 151 x 159, area 23,989   ← 61% heavier
 *
 *  The house is a closed pentagon with a door inside it; the cap is a flat trapezoid and a
 *  tassel, so it fills a wide box with far less ink. Equal boxes are not equal weight, and it was
 *  the HOUSE that was dominating.
 *
 *  The scales below bring the two ink areas within ~9% of each other, which is where an outline
 *  pair stops reading as mismatched. Deliberately not exactly equal: matching bounding-box AREA
 *  alone would leave the house looking small, because a wide shallow glyph carries its mass
 *  differently from a compact one. Weight first, then a nudge back toward equal stature. */
const SCALE: Record<DoorGlyphKind, number> = {
  cap: 0.95,
  house: 0.90,
};

/** STROKE IN PIXELS, NOT IN GLYPH UNITS. `absoluteStrokeWidth` is what makes this a constant:
 *  without it lucide scales the stroke with the icon, so a 180px icon would render a ~15px
 *  slab. 5px is the weight that stays flat and legible at this size in both glyphs. */
const STROKE_PX = 5;

export function DoorGlyph({ glyph, size = 180, color = "var(--brand-cream)" }: {
  glyph: DoorGlyphKind;
  /** The optical target height. The actual render is this times the glyph's scale factor. */
  size?: number;
  /** One colour, both doors. The doors are told apart by their BUTTONS, not by their icons —
   *  two differently-coloured icons plus two differently-coloured buttons is four colours doing
   *  the work of two. */
  color?: string;
}) {
  const Glyph = GLYPHS[glyph];
  return (
    <span aria-hidden style={{ display: "grid", placeItems: "center", height: size, width: size }}>
      <Glyph
        size={Math.round(size * SCALE[glyph])}
        color={color}
        strokeWidth={STROKE_PX}
        absoluteStrokeWidth
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </span>
  );
}
