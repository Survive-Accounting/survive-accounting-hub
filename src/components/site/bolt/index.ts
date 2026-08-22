// The animated campus bolt, as one import. Everything a page needs:
//
//   import { AnimatedCampusBolt, ANIMATED_CAMPUS_BOLT_CSS, curatedBoltCampuses } from "@/components/site/bolt";
//
//   <style>{ANIMATED_CAMPUS_BOLT_CSS}</style>
//   <AnimatedCampusBolt campuses={curatedBoltCampuses()} autoplay showLabel />
//
// Tuning lives in bolt-config.ts and nowhere else.
export {
  AnimatedCampusBolt,
  ANIMATED_CAMPUS_BOLT_CSS,
  type AnimatedCampusBoltProps,
} from "./AnimatedCampusBolt";
export {
  allBoltCampuses,
  boltCampusFor,
  curatedBoltCampuses,
  orderCampuses,
} from "./bolt-campuses";
export { getBoltPalette, type BoltCampus, type BoltPalette } from "./bolt-palette";
export { useBoltRotation } from "./useBoltRotation";
export {
  CURATED_CAMPUS_ORDER,
  DEFAULT_BOLT_TUNING,
  BOLT_ACCENTS,
  type BoltTuning,
} from "./bolt-config";
export { BOLT_ASPECT } from "./bolt-geometry";
