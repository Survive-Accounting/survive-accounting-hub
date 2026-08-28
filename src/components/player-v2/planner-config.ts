// PLAYER V2 "TONIGHT'S PLAN" — PREVIEW/BETA PLANNING CONFIGURATION (2026-08-27).
//
// ⚠ EVERYTHING IN THIS FILE IS THE ISOLATED PREVIEW LAYER (spec §33). It exists so the V2 beta
// can demonstrate the Mode → Goal → Plan mental model with REAL content and honest time math,
// WITHOUT pretending the curriculum has been pedagogically tier-tagged (it has not — Lee assigns
// Easy/Core/B-to-A near the END of each exam's content development), and without touching the
// canonical curriculum structure or database.
//
// The migration path OUT of this file (documented in PLAYER_V2_TONIGHTS_PLAN_BETA_REPORT.md):
//   1. Authoring adds a real `priorityTier` per set (natural home: the DeckDef / CEQ Studio
//      publish metadata, arriving through fetchStudentTree like runtimeSec does today).
//   2. plan-model's stepTier() starts reading that field; SET_TIER_OVERRIDES and PREVIEW_RULES
//      below become dead code and get deleted. Nothing else in the player changes.

/** The future reusable priority vocabulary (spec §10). Student-facing phrase for `b_to_a`
 *  is "Take it to an A" — never the raw token. */
export type PriorityTier = "easy" | "core" | "b_to_a";

/** Time assumptions the estimate engine runs on. The practice band matches the one documented
 *  assumption the live player already uses (exam-path's estRangeMin: 0.65–0.9 min/question).
 *  Video estimates prefer the real runtimeSec and only fall back to these defaults. */
export const V2_TIME = {
  minPerQuestionLow: 0.65,
  minPerQuestionHigh: 0.9,
  /** A cram video whose runtime hasn't published yet. */
  defaultCramMin: 4,
  /** A review video whose runtime hasn't published yet. */
  defaultReviewMin: 6,
} as const;

/** FUTURE AUTHORING SLOT — explicit per-set tiers, keyed by set id. Lee (or the studio publish
 *  flow) can pin real tiers here before the schema-level field exists. Checked FIRST, so one
 *  entry immediately overrides the preview rules for that set. Empty today, on purpose. */
export const SET_TIER_OVERRIDES: Record<string, PriorityTier> = {};

/** PREVIEW-ONLY heuristics — clearly NOT final pedagogy. They give the beta real steps behind
 *  each tier so goals change real plans and "Take it to an A" adds real minutes. */
export const PREVIEW_RULES = {
  /** A topic whose name says "easy points" previews as tier `easy`. */
  easyTopicPattern: /easy\s*point/i,
  /** In a core topic with at least this many practice steps, the LAST practice step previews as
   *  `b_to_a` — the deepest cut of the topic stands in for its A-level detail, IN PLACE (never
   *  moved out of its natural topic, spec §12). */
  bToALastPracticeMinSteps: 3,
  /** "Just Pass" previews "selected/highest-value Core" as: each core topic keeps its cram
   *  video(s) plus its FIRST practice step. */
  passKeepsFirstPracticeOnly: true,
} as const;
