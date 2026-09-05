// ANIMATED CAMPUS BOLT — THE TUNING DESK.
//
// Every number that decides how the bolt LOOKS and MOVES lives in this file, and nothing in this
// file needs any knowledge of the animation internals. Change a constant, reload /lab/bolt, judge
// it with your eyes. The lab page can also override each of these live (it passes a `tuning` prop);
// what is written here is the default the production hero will ship with.

/** ═══ MOTION — CHARGE, THEN REST ═══════════════════════════════════════════════════════════
 *
 *  The bolt is NOT a continuous conveyor. It is a two-beat loop:
 *
 *      CHARGE (fast, eased)  →  DWELL (dead still)  →  CHARGE  →  DWELL  →  …
 *
 *  The charge is the identity: the next campus's colours drive UPWARD through the mark and resolve.
 *  The dwell is what the visitor actually reads — the finished school, its colours, its course code
 *  and its name, sitting still. Movement, rest, movement, rest; never constant motion.
 *
 *  These two numbers are the whole cadence. Nothing else in the component knows a duration. */

/** The upward charge. Quick and energetic — long enough to read as a sweep, short enough that it
 *  never becomes the thing you are watching. 600–1000 is the useful band. */
export const CHARGE_MS = 780;

/** How long the finished campus sits still afterwards. This is READING time: the caption has to be
 *  legible, out loud, by someone who only just noticed the bolt. 2500–3500 is the useful band. */
export const DWELL_MS = 3000;

/** One campus, door to door. Derived — do not set it. */
export const CAMPUS_CYCLE_MS = CHARGE_MS + DWELL_MS;

/** The charge curve, as cubic-bezier control points (the same four numbers CSS takes).
 *  The default is a launch-and-settle: off the line immediately, quick through the middle, and a
 *  long soft resolve into the finished state so the stop never reads as a stop. */
export const CHARGE_EASE: readonly [number, number, number, number] = [0.2, 0.9, 0.25, 1];

/** How tall one campus panel is, in bolt-heights. It must be MORE than 1: the panels lean
 *  (RIBBON_ANGLE), so a panel exactly one bolt tall would leave a wedge of the bolt's top corner
 *  uncovered at rest. The overhang is split evenly above and below, and 1.25 gives ~18 units of
 *  slack against a worst-case lean of ~13. Raising it makes the charge travel further in the same
 *  time (a longer, faster sweep); lowering it below ~1.2 risks the wedge. */
export const PANEL_SPAN = 1.25;

/** Tilt of the flow, in degrees. Both the campus hand-off edge and the ribbon bands share it, so
 *  the whole stream leans as one object. Positive = the edge rises to the LEFT (complements the
 *  bolt's own lean); 0 = dead flat. Keep it small — this is a slant, not a diagonal wipe. */
export const RIBBON_ANGLE = 7;

/** How many broad tonal ribbons ride inside ONE campus panel. This is the density knob, and the
 *  one that separates "conveyor" from "TV scan lines": at 4, each ribbon is roughly HALF a bolt
 *  tall. Anything above ~8 starts to stripe. Multiples of 4 tile most cleanly (the tone wave has
 *  a period of 4), but any integer ≥ 1 works. */
export const RIBBON_COUNT = 4;

/** Ribbon depth — how far the light/deep ribbons drift from the exact school hex, as a mix ratio
 *  toward white and toward black. The tone wave is a SMOOTH gradient, so these read as sheen, not
 *  as bands. 0/0 = a flat colour panel with no visible flow at all. */
export const RIBBON_TONE_LIGHT = 0.17;
export const RIBBON_TONE_DEEP = 0.13;

/** ═══ THE CAPTION ══════════════════════════════════════════════════════════════════════════
 *
 *  The plate ("for ACCT 2110 · AUBURN") is part of the campus change, not a separate event. It
 *  fades OUT as the charge begins, swaps its text while invisible, and fades back IN as the charge
 *  resolves — so the new school's NAME can never be on screen while the bolt still wears the old
 *  school's COLOURS, which is the one thing that made the old version feel uncoordinated. */

/** Length of each half of the caption cross-fade. Twice this must comfortably fit inside
 *  CHARGE_MS, or the caption is still fading when the bolt has already settled. */
export const CAPTION_FADE_MS = 190;

/** Where in the charge the caption's TEXT is swapped, 0–1. It is invisible at this moment, so the
 *  exact value only decides which campus a click means mid-charge — 0.55 hands over just after the
 *  new colours take the middle of the bolt. */
export const CAPTION_SWAP_PROGRESS = 0.55;

/** ═══ IDLE LIFE ════════════════════════════════════════════════════════════════════════════ */

/** During the dwell ONLY, the bolt drifts by this many CSS pixels and back. This is deliberately
 *  the subtlest of the options on the table: no scale breathing, no glow pulse, no bounce — one
 *  slow float, small enough that you notice it without seeing it. 0 turns it off entirely.
 *  Above ~3px it starts to read as an animation, which is exactly wrong. */
export const IDLE_FLOAT_PX = 1.5;
/** A full float round trip. Slow — this is breathing, not motion. */
export const IDLE_FLOAT_MS = 5200;

/** ═══ REDUCED MOTION ═══════════════════════════════════════════════════════════════════════ */

/** Campus dwell when the visitor prefers reduced motion: no charge and no float at all, just a
 *  slow colour cross-fade from campus to campus. Long, because a fade is the only event. */
export const REDUCED_MOTION_DWELL_MS = 6000;
/** Length of that cross-fade. */
export const REDUCED_MOTION_FADE_MS = 700;

/** ═══ RENDER ═══════════════════════════════════════════════════════════════════════════════ */

/** The white keyline, in SVG user units (the bolt is ~147 tall). It is painted LAST, centred on
 *  the silhouette edge, so HALF of it shows outside the bolt and half covers the fill's edge:
 *  visible white ≈ OUTLINE_WIDTH / 2. The old hero drew a 7-unit stroke under the fill (3.5 units
 *  visible); 2.6 here reads as a crisp 1.3-unit border — half the old weight. Raise for a
 *  chunkier sticker look, lower until it starts to break up at navbar size. */
export const OUTLINE_WIDTH = 2.6;
export const OUTLINE_COLOR = "#FFFFFF";

/** Overlap, in user units, that the RIGHT (secondary) region is dilated by across the internal
 *  divider, so anti-aliasing can never open a hairline between the two colours. The divider
 *  GEOMETRY does not move — this only fattens the mask by half this value on each side. Keep it
 *  under ~1.5 or the divider visibly shifts. */
export const SEAM_OVERLAP = 0.9;

/** Outer glow: a blurred copy of the silhouette, painted FIRST, never moving. Blur is in user
 *  units; opacity is the whole glow's strength. HOVER is what the glow rises to on pointer-over. */
export const GLOW_BLUR = 9;
export const GLOW_OPACITY = 0.38;
export const GLOW_HOVER_OPACITY = 0.55;
export const GLOW_COLOR = "#F5EFE6";

/** The soft dark shadow that seats the bolt on the navy. Blur + downward offset, user units. */
export const SHADOW_BLUR = 7;
export const SHADOW_DY = 9;
export const SHADOW_OPACITY = 0.5;

/** ═══ COLOUR SELECTION ═════════════════════════════════════════════════════════════════════ */
// See bolt-palette.ts for the rule these feed. In short: a secondary colour that is too close to
// the WHITE OUTLINE (white, near-white, cream, silver, light grey) is replaced by the school's
// accent colour, so the right half of the bolt never dissolves into its own keyline.

/** Lightness (HSL L, 0–1) at or above which a colour counts as near-white REGARDLESS of how
 *  colourful it is. Catches #FFFFFF, Alabama's #F1F2F3, Nebraska's cream #F5F1E7 and Oklahoma's
 *  #FDF9D8 — while leaving LSU's #FDD023 (L 0.57) and FSU's #CEB888 (L 0.67) alone. */
export const NEAR_WHITE_LIGHTNESS = 0.86;

/** The second half of the rule: a colour that is merely LIGHT is only rejected if it is also
 *  WASHED OUT. Lightness ≥ LIGHT_LIGHTNESS **and** chroma ≤ LIGHT_MAX_CHROMA → too close to white.
 *  Chroma here is (max − min) / 255 — absolute colourfulness, not HSL saturation, which reports
 *  pale creams as "90 % saturated" and would throw the golds out with the greys.
 *  Catches Mississippi State's #C8C8C8 and Ohio State's #A7B1B7; spares every school gold. */
export const LIGHT_LIGHTNESS = 0.62;
export const LIGHT_MAX_CHROMA = 0.2;

/** OFF BY DEFAULT. The mirror rule for the other end: a near-black secondary (Georgia, Mizzou,
 *  South Carolina, Iowa…) has plenty of contrast with the white outline but little with the navy
 *  page behind the bolt. Flip this on in the lab to see those schools use their accent instead.
 *  Left off because black IS those schools' colour and the outline does separate it. */
export const USE_DARK_FALLBACK = false;
/** Lightness at or below which a secondary counts as near-black, when the rule above is on. */
export const DARK_LIGHTNESS = 0.12;

/** How the DERIVED accent is built for a school with no curated third colour (see BOLT_ACCENTS).
 *
 *  The school's own primary, moved a FIXED FRACTION of the way to white (if it is dark) or to
 *  black (if it is already light), keeping its hue. Moving a fraction rather than to a fixed
 *  target is what keeps a maroon reading as a maroon: an earlier version pushed everything to
 *  lightness 0.58, which turned Texas A&M's #500000, Mississippi State's #660000 and four other
 *  schools' primaries into the SAME fire-engine red.
 *
 *  Saturation is floored so the result is always a colour (never a grey, so it can never trip the
 *  light rule it exists to answer) and, on the tint side only, capped — lightening a fully
 *  saturated dark red at full saturation gives neon. */
export const ACCENT_PIVOT_LIGHTNESS = 0.5;
export const ACCENT_MIX = 0.32;
export const ACCENT_MIN_SATURATION = 0.45;
export const ACCENT_MAX_TINT_SATURATION = 0.72;
/** Used only when a school's primary is itself achromatic (a black or grey primary), where a
 *  "more colourful version of the primary" does not exist. */
export const NEUTRAL_ACCENT = "#8A94A6";

/** CURATED THIRD COLOURS — the override table. Anything not listed here gets the derived accent
 *  described above, which is a vivid tint/shade of the school's own primary and looks correct for
 *  the great majority of schools whose real palette is just "one colour and white".
 *
 *  ADD A ROW whenever a school has a genuine, vivid third colour that beats the derivation. Keys
 *  are school ids (schools.generated.ts). This table is consulted for EVERY school, but only
 *  matters for the ones whose secondary fails the light-colour rule. */
export const BOLT_ACCENTS: Record<string, string> = {
  // SMU is officially Harvard red AND Yale blue — the blue is a real second colour, not a filler.
  smu: "#354CA1",
  // San Diego State: scarlet, black and GOLD. The gold is the right answer, not a paler scarlet.
  "san-diego-state": "#FFC72C",
  // Arizona State's maroon/gold pair is already vivid, but keep the gold explicit for clarity.
  "arizona-state": "#FFC627",
  // ── THE TWO CRIMSON SCHOOLS ────────────────────────────────────────────────────────────────
  // Both list a grey/silver alongside their red, and both greys are too light to sit beside the
  // white outline. Their first fix was a DARKER GREY, which was accurate and wrong: the right
  // region is the larger one, so a grey accent makes the whole bolt read grey — an Alabama bolt
  // that is not crimson. The derived tint is no good either; lightening a crimson lands on pink
  // (#DF425E / #E14967).
  //
  // So each one gets a second tone of ITS OWN red, chosen in the direction its identity actually
  // runs: Alabama is a DEEP crimson, Ohio State is a BRIGHT scarlet. Either way the bolt reads as
  // the school's colour, with the stored hex as the banding against it.
  alabama: "#6B1222", // deep crimson under Alabama's own #9E1B32
  "ohio-state": "#E31B3D", // bright scarlet over Ohio State's own #BA0C2F
};

/** ═══ ROTATION ORDER ═══════════════════════════════════════════════════════════════════════ */

/** THE CURATED SEQUENCE (Lee, 2026-09-05: "Ole Miss LSU Tennessee MS State then randomized
 *  power four after that") — four named leads, then every other Power Four school in a fixed
 *  mix: SEC, Big Ten, Big 12 and ACC each shuffled and dealt round-robin so no stretch is all
 *  one conference, the same recipe as the slide scroller's campusMix (bolt-zoom.ts) with the
 *  same seed (7) so the two surfaces read as one system.
 *
 *  BAKED, NOT COMPUTED AT RENDER: a `Math.random()` shuffle here would let the server and a
 *  hydrating client disagree about the very first campus painted — a visible colour flash on
 *  load. This exact order was generated once (seededShuffle, seed 7, round-robin across the
 *  four Power Four pools minus the leads) and is checked in as a plain list, same as before.
 *  Regenerate it with scripts/regen-bolt-order.ts if the leads or the seed ever change.
 *
 *  Ids are the landing-picker ids from src/lib/schools.generated.ts. An id that is not in the
 *  campus list passed to the bolt is simply skipped, and any campus NOT named here still plays —
 *  it just plays after everything that is (every non-Power-Four live campus, unchanged). So this
 *  list is safe to trim, extend or reorder at will; it can never drop a campus off the rotation. */
export const CURATED_CAMPUS_ORDER: string[] = [
  // ── the four leads, in the order Lee wants them seen ────────────────────────────────────────
  "ole-miss", // SEC — navy + red
  "lsu", // SEC — purple + gold
  "tennessee", // SEC — orange + white
  "mississippi-state", // SEC — maroon pair
  // ── the rest of the Power Four, mixed across conferences (seed 7 — see the note above) ──────
  "oklahoma", // SEC — crimson + cream
  "iowa", // Big Ten — gold + black
  "iowa-state", // Big 12 — cardinal + gold
  "pittsburgh", // ACC — navy + gold
  "texas-aandm", // SEC — maroon pair
  "purdue", // Big Ten — old gold + black
  "arizona", // Big 12 — cardinal pair
  "smu", // ACC — red + white
  "florida", // SEC — blue + orange
  "wisconsin", // Big Ten — red pair
  "kansas", // Big 12 — blue + red
  "louisville", // ACC — red pair
  "kentucky", // SEC — blue pair
  "ohio-state", // Big Ten — scarlet pair
  "kansas-state", // Big 12 — purple pair
  "nc-state", // ACC — red pair
  "arkansas", // SEC — cardinal pair
  "rutgers", // Big Ten — scarlet pair
  "colorado", // Big 12 — gold + black
  "georgia-tech", // ACC — gold + navy
  "south-carolina", // SEC — garnet + black
  "minnesota", // Big Ten — maroon + gold
  "oklahoma-state", // Big 12 — orange + black
  "florida-state", // ACC — garnet + gold
  "auburn", // SEC — navy + orange
  "illinois", // Big Ten — orange + navy
  "houston", // Big 12 — red pair
  "miami", // ACC — orange + green
  "georgia", // SEC — red + black
  "oregon", // Big Ten — green + yellow
  "ucf", // Big 12 — black + gold
  "syracuse", // ACC — orange + navy
  "mizzou", // SEC — gold + black
  "michigan-state", // Big Ten — green pair
  "baylor", // Big 12 — green + gold
  "virginia-tech", // ACC — maroon + orange
  "texas", // SEC — burnt orange
  "maryland", // Big Ten — red + gold
  "texas-tech", // Big 12 — red + black
  "north-carolina", // ACC — carolina blue + navy
  "vanderbilt", // SEC — black + gold
  "washington", // Big Ten — purple + gold
  "cincinnati", // Big 12 — red + black
  "clemson", // ACC — orange + purple
  "alabama", // SEC — crimson pair
  "usc", // Big Ten — cardinal + gold
  "west-virginia", // Big 12 — navy + gold
  "virginia", // ACC — orange + navy
  "penn-state", // Big Ten — navy pair
  "tcu", // Big 12 — purple pair
  "nebraska", // Big Ten — scarlet pair
  "utah", // Big 12 — red pair
  "northwestern", // Big Ten — purple pair
  "arizona-state", // Big 12 — maroon + gold
];

/** The whole tuning desk as one object, so the lab can hand the component a modified copy without
 *  every consumer having to thread twelve props. Production passes nothing and gets these. */
export type BoltTuning = {
  chargeMs: number;
  dwellMs: number;
  panelSpan: number;
  ribbonAngle: number;
  ribbonCount: number;
  ribbonToneLight: number;
  ribbonToneDeep: number;
  captionSwapProgress: number;
  idleFloatPx: number;
  outlineWidth: number;
  seamOverlap: number;
  glowBlur: number;
  glowOpacity: number;
  glowHoverOpacity: number;
  useLightFallback: boolean;
  useDarkFallback: boolean;
};

export const DEFAULT_BOLT_TUNING: BoltTuning = {
  chargeMs: CHARGE_MS,
  dwellMs: DWELL_MS,
  panelSpan: PANEL_SPAN,
  ribbonAngle: RIBBON_ANGLE,
  ribbonCount: RIBBON_COUNT,
  ribbonToneLight: RIBBON_TONE_LIGHT,
  ribbonToneDeep: RIBBON_TONE_DEEP,
  captionSwapProgress: CAPTION_SWAP_PROGRESS,
  idleFloatPx: IDLE_FLOAT_PX,
  outlineWidth: OUTLINE_WIDTH,
  seamOverlap: SEAM_OVERLAP,
  glowBlur: GLOW_BLUR,
  glowOpacity: GLOW_OPACITY,
  glowHoverOpacity: GLOW_HOVER_OPACITY,
  useLightFallback: true,
  useDarkFallback: USE_DARK_FALLBACK,
};
