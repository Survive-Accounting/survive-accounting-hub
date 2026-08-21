// ANIMATED CAMPUS BOLT — THE TUNING DESK.
//
// Every number that decides how the bolt LOOKS and MOVES lives in this file, and nothing in this
// file needs any knowledge of the animation internals. Change a constant, reload /lab/bolt, judge
// it with your eyes. The lab page can also override each of these live (it passes a `tuning` prop);
// what is written here is the default the production hero will ship with.

/** ═══ MOTION ═══════════════════════════════════════════════════════════════════════════════ */

/** How long one campus owns the bolt, door to door. The conveyor never pauses — this is the time
 *  it takes one campus panel to travel its own height, so it is BOTH the campus cadence AND the
 *  flow speed. Lower = faster river and quicker campus turnover. Target 3400–3800. */
export const CAMPUS_DURATION_MS = 3600;

/** How tall one campus panel is, in bolt-heights. This is the single knob that trades "flow speed"
 *  against "clean read time":
 *    2.0 → the hand-off crosses the bolt in half a cycle (1.8s), then 1.8s of ONE campus alone.
 *    1.0 → a campus edge is always crossing the bolt; never a clean single-campus frame.
 *    3.0 → a faster river, a shorter hand-off, a longer clean hold.
 *  The fraction of each cycle spent handing over is exactly 1 / PANEL_SPAN. */
export const PANEL_SPAN = 2.0;

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

/** When the plate ("for ACCT 2110 · AUBURN") flips to the incoming campus, as a fraction of the
 *  HAND-OVER (not of the whole cycle) — 0.55 means "when the new campus owns a bit more than half
 *  the bolt". 0 flips the instant the new colours appear; 1 waits until the old campus is gone. */
export const LABEL_SWITCH_PROGRESS = 0.55;

/** Campus dwell when the visitor prefers reduced motion: no conveyor at all, just a slow colour
 *  cross-fade from campus to campus. Long, because a fade is the only event. */
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
  // Alabama's third colour is the houndstooth GREY, and it is genuinely part of the identity. A
  // tint of the crimson would come out pink, which is worse than accurate.
  alabama: "#828A8F",
  // Ohio State is scarlet + grey. Their published grey (#A7B1B7) is too light to sit beside the
  // outline, so this is the same grey taken down to where it reads; a tint of the scarlet would be
  // pink on scarlet, which barely separates.
  "ohio-state": "#7A868C",
};

/** ═══ ROTATION ORDER ═══════════════════════════════════════════════════════════════════════ */

/** THE CURATED SEQUENCE — hand-ordered, never alphabetical, never database order.
 *
 *  Two jobs: put the schools we care most about first (a visitor who watches ten seconds should
 *  see the SEC), and make each ADJACENT PAIR a pleasing colour move — navy→purple→orange→navy
 *  rather than three maroons in a row.
 *
 *  Ids are the landing-picker ids from src/lib/schools.generated.ts. An id that is not in the
 *  campus list passed to the bolt is simply skipped, and any campus NOT named here still plays —
 *  it just plays after everything that is. So this list is safe to trim, extend or reorder at
 *  will; it can never drop a campus off the rotation. */
export const CURATED_CAMPUS_ORDER: string[] = [
  // ── the SEC opening, in the order Lee wants it seen ──────────────────────────────────────────
  "ole-miss", // navy + red
  "lsu", // purple + gold
  "tennessee", // orange + burnt orange
  "auburn", // navy + orange
  "alabama", // crimson pair
  "georgia", // red + black
  "florida", // blue + orange
  "florida-state", // garnet + gold
  "south-carolina", // garnet + black
  "kentucky", // blue pair
  "arkansas", // cardinal pair
  "mississippi-state", // maroon pair
  "mizzou", // gold + black
  "texas-aandm", // maroon pair
  // ── the rest of the SEC ─────────────────────────────────────────────────────────────────────
  "texas", // burnt orange
  "oklahoma", // crimson
  "vanderbilt", // black + gold
  // ── everyone else, still hand-ordered so neighbours contrast ────────────────────────────────
  "clemson", // orange + purple
  "michigan-state", // green pair
  "usc", // cardinal + gold
  "washington", // purple + gold
  "virginia-tech", // maroon + orange
  "oregon", // green + yellow
  "penn-state", // navy pair
  "syracuse", // orange + navy
  "wisconsin", // red pair
  "west-virginia", // navy + gold
  "iowa", // gold + black
  "north-carolina", // carolina blue + navy
  "nc-state", // red pair
  "purdue", // old gold + black
  "illinois", // orange + navy
  "northwestern", // purple pair
  "indiana", // crimson pair
  "ohio-state", // scarlet pair
  "kansas", // blue + red
  "kansas-state", // purple pair
  "baylor", // green + gold
  "tcu", // purple pair
  "texas-tech", // red + black
  "houston", // red pair
  "arizona-state", // maroon + gold
  "arizona", // cardinal pair
  "colorado", // gold + black
  "colorado-state", // green + gold
  "utah", // red pair
  "oregon-state", // orange + black
  "cal-poly", // green + gold
  "san-diego-state", // scarlet + gold
  "smu", // red + blue
  "miami", // orange + green
  "miami-oh", // red pair
  "cincinnati", // red + black
  "louisville", // red pair
  "maryland", // red + gold
  "rutgers", // scarlet pair
  "pittsburgh", // navy + gold
  "virginia", // orange + navy
  "james-madison", // purple + gold
  "delaware", // blue + gold
  "minnesota", // maroon + gold
  "nebraska", // scarlet pair
  "iowa-state", // cardinal + gold
  "oklahoma-state", // orange + black
  "georgia-tech", // gold + navy
  "ucf", // black + gold
];

/** The whole tuning desk as one object, so the lab can hand the component a modified copy without
 *  every consumer having to thread twelve props. Production passes nothing and gets these. */
export type BoltTuning = {
  campusDurationMs: number;
  panelSpan: number;
  ribbonAngle: number;
  ribbonCount: number;
  ribbonToneLight: number;
  ribbonToneDeep: number;
  labelSwitchProgress: number;
  outlineWidth: number;
  seamOverlap: number;
  glowBlur: number;
  glowOpacity: number;
  glowHoverOpacity: number;
  useLightFallback: boolean;
  useDarkFallback: boolean;
};

export const DEFAULT_BOLT_TUNING: BoltTuning = {
  campusDurationMs: CAMPUS_DURATION_MS,
  panelSpan: PANEL_SPAN,
  ribbonAngle: RIBBON_ANGLE,
  ribbonCount: RIBBON_COUNT,
  ribbonToneLight: RIBBON_TONE_LIGHT,
  ribbonToneDeep: RIBBON_TONE_DEEP,
  labelSwitchProgress: LABEL_SWITCH_PROGRESS,
  outlineWidth: OUTLINE_WIDTH,
  seamOverlap: SEAM_OVERLAP,
  glowBlur: GLOW_BLUR,
  glowOpacity: GLOW_OPACITY,
  glowHoverOpacity: GLOW_HOVER_OPACITY,
  useLightFallback: true,
  useDarkFallback: USE_DARK_FALLBACK,
};
