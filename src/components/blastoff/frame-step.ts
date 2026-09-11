// THE FRAME STEP — what the film surface tells a slide that walks itself with the spacebar: the
// step it is on. One context for every such kind (the rubric's reveal, Survibes' props); the map
// keeps its richer ClusterFilmContext. Provided by BlastOffCapture only; absent everywhere else,
// which every reader takes as "at rest, everything revealed".
//
// THE RUBRIC'S TAKE (2026-09-11). Lee: "we'll play with the rubric to get the answer … Make it
// clear by hover animation that these are clickable. Let revenue/exp be toggleable with maybe
// the TAB key?" On film a box click and Tab change THIS TAKE only — per box, what the box shows
// now (`over`), and whether the Rev/Exp row shows (`revExp`). Never written to the plan; ~ clears
// it with the reveal.
import { createContext } from "react";

import type { RubricArrow, RubricKey } from "./rubric";

export interface FrameStepRubric {
  over: Partial<Record<RubricKey, RubricArrow[]>>;
  revExp?: boolean;
  set: (key: RubricKey, arrows: RubricArrow[]) => void;
}

export interface FrameStep { step: number; rubric?: FrameStepRubric }
export const FrameStepContext = createContext<FrameStep | null>(null);
